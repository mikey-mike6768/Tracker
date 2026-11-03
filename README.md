# TeamTrack — Android attendance MVP

This repository contains the first Android application foundation for TeamTrack.

## Included
- Expo/React Native Android app
- Supabase email/password authentication
- Shift acknowledgement
- Login/logout camera photo capture
- GPS coordinates captured at each attendance submission
- Break-in, break-out, lunch-in and lunch-out event capture
- Server timestamp from PostgreSQL
- Supabase schema and starter row-level security
- GitHub Actions workflow to build a debug APK

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create Auth users and matching rows in `profiles`. Use the Auth user's UUID as profile id.
4. Create shifts in `shifts` for employee UUIDs.
5. Add GitHub repository Actions secrets: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
6. Open Actions → Build TeamTrack Android APK → Run workflow.
7. Download the `TeamTrack-debug-apk` artifact and extract `app-debug.apk`.

Never put the Supabase service-role key in the app or repository. Use only the anon/public key.
GPS is captured only during a user-submitted attendance action; there is no continuous background tracking.

## Not production complete yet
The manager web dashboard, team-scoped team-lead permissions, roster editor, approval workflows,
geofence controls, secure signed photo viewing, validated event sequencing, monthly Excel export,
and signed production APK are still future milestones. The included policies are starter policies
and must be security-reviewed before real employee attendance and location data is collected.
