import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Sign-in required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.slice(7);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Invalid or expired Manager session" }, 401);

    const { data: caller, error: callerError } = await userClient
      .from("profiles").select("role,active").eq("id", authData.user.id).single();
    if (callerError || caller?.role !== "manager" || caller.active !== true) {
      return respond({ error: "Only an active Manager can create staff accounts" }, 403);
    }

    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const employee_code = body.employee_code ? String(body.employee_code).trim() : null;
    const password = String(body.password ?? "");
    const role = body.role;
    const team_id = String(body.team_id ?? "");

    if (!full_name || !email || !team_id || password.length < 8 || !["employee", "team_lead"].includes(role)) {
      return respond({ error: "Provide name, valid email, team, employee/Team Leader role and a password of at least 8 characters." }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: team, error: teamError } = await admin.from("teams").select("id,team_lead_id").eq("id", team_id).single();
    if (teamError || !team) return respond({ error: "Selected team was not found" }, 404);

    const { count: employeeCount, error: employeeCountError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true }).eq("role", "employee").eq("active", true);
    const { count: leadCount, error: leadCountError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true }).eq("role", "team_lead").eq("active", true);
    if (employeeCountError || leadCountError) throw new Error("Could not verify organisation capacity");
    if (role === "employee" && (employeeCount ?? 0) >= 25) return respond({ error: "The organisation already has 25 active employees" }, 409);
    if (role === "team_lead" && (leadCount ?? 0) >= 5) return respond({ error: "The organisation already has 5 active Team Leaders" }, 409);
    if (role === "team_lead" && team.team_lead_id) return respond({ error: "This team already has a Team Leader" }, 409);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError || !created.user) return respond({ error: createError?.message ?? "Auth account creation failed" }, 400);

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id, full_name, employee_code, role, team_id, active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return respond({ error: "Account was rolled back because the staff profile could not be created: " + profileError.message }, 400);
    }

    if (role === "team_lead") {
      const { error: leaderError } = await admin.from("teams").update({ team_lead_id: created.user.id }).eq("id", team_id);
      if (leaderError) {
        await admin.from("profiles").delete().eq("id", created.user.id);
        await admin.auth.admin.deleteUser(created.user.id);
        return respond({ error: "Account was rolled back because Team Leader assignment failed: " + leaderError.message }, 400);
      }
    }

    return respond({ ok: true, user_id: created.user.id, full_name, email, role, team_id });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});