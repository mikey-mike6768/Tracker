-- Applied directly to Supabase project esycmyawbtpumevadkze on 2026-11-05.
-- Attendance inserts and attendance-photo uploads are now accepted only by
-- the record-attendance Edge Function, which validates the caller and geofence
-- before using its server-side service credential to upload/insert.
-- Keep SELECT policies scoped as they are; do not restore client INSERT policies.

drop policy if exists events_insert_self on public.attendance_events;
drop policy if exists "insert own attendance" on public.attendance_events;
drop policy if exists attendance_photos_insert_own on storage.objects;
drop policy if exists "upload own photos" on storage.objects;
