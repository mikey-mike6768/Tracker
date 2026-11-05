import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedEvents = new Set(["login", "break_in", "break_out", "lunch_in", "lunch_out", "logout"]);
const rad = (v: number) => v * Math.PI / 180;
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Sign-in required" }, 401);

  let uploadedPath: string | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Server attendance configuration is incomplete.");

    const token = authHeader.slice(7);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid or expired. Sign in again." }, 401);

    const { data: profile, error: profileError } = await userClient
      .from("profiles").select("id,role,team_id,active").eq("id", authData.user.id).single();
    if (profileError || !profile || profile.active !== true || !["employee", "team_lead"].includes(profile.role)) {
      return respond({ error: "Only active employees and Team Leaders can record attendance." }, 403);
    }

    const body = await req.json();
    const eventType = String(body.event_type ?? "");
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy_m);
    if (!allowedEvents.has(eventType)) return respond({ error: "Unsupported attendance event." }, 400);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return respond({ error: "A valid GPS location is required." }, 400);
    }
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
      return respond({ error: "GPS accuracy is too low. Move to an open area and try again (maximum accepted accuracy error: 100 m)." }, 422);
    }

    const needsPhoto = eventType === "login" || eventType === "logout";
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let photoPath: string | null = null;
    let distance: number | null = null;
    let radius: number | null = null;

    if (needsPhoto && profile.team_id) {
      const { data: team, error: teamError } = await userClient
        .from("teams").select("geofence_enabled,geofence_latitude,geofence_longitude,geofence_radius_m")
        .eq("id", profile.team_id).single();
      if (teamError) return respond({ error: "Could not verify your team's attendance location." }, 500);
      if (team?.geofence_enabled) {
        if (team.geofence_latitude == null || team.geofence_longitude == null) {
          return respond({ error: "Your team's geofence is enabled but not configured. Contact your Manager." }, 403);
        }
        radius = team.geofence_radius_m || 150;
        distance = distanceMeters(latitude, longitude, team.geofence_latitude, team.geofence_longitude);
        if (distance > radius) {
          return respond({ error: `Outside approved work area. You are approximately ${Math.round(distance)} m away; allowed radius is ${radius} m. Attendance was not recorded and no photo was uploaded.`, distance_m: Math.round(distance), allowed_radius_m: radius }, 403);
        }
      }
    } else if (needsPhoto) {
      return respond({ error: "Your account is not assigned to a team. Contact your Manager before login/logout." }, 403);
    }

    if (needsPhoto) {
      const encoded = String(body.photo_base64 ?? "");
      if (!encoded || encoded.length > 8_000_000) return respond({ error: "A login/logout photo is required and must be under 6 MB." }, 400);
      const bytes = decodeBase64(encoded);
      if (!bytes.length || bytes.length > 6_000_000) return respond({ error: "Photo is empty or exceeds the 6 MB limit." }, 400);
      uploadedPath = `${profile.id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await admin.storage.from("attendance-photos").upload(uploadedPath, bytes, {
        contentType: "image/jpeg", upsert: false,
      });
      if (uploadError) throw new Error("Photo upload failed: " + uploadError.message);
      photoPath = uploadedPath;
    }

    const { data: saved, error: saveError } = await admin.from("attendance_events").insert({
      employee_id: profile.id,
      event_type: eventType,
      latitude,
      longitude,
      photo_path: photoPath,
      notes: accuracy != null ? `GPS accuracy ±${Math.round(accuracy)} m` : null,
    }).select("id,created_at,event_type").single();
    if (saveError) throw new Error("Attendance could not be saved: " + saveError.message);

    return respond({ ok: true, event: saved, distance_m: distance == null ? null : Math.round(distance), allowed_radius_m: radius });
  } catch (error) {
    if (uploadedPath) {
      try {
        const url = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await admin.storage.from("attendance-photos").remove([uploadedPath]);
      } catch { /* best-effort cleanup */ }
    }
    return respond({ error: error instanceof Error ? error.message : "Unexpected attendance server error." }, 500);
  }
});