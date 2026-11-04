# TeamTrack role-based architecture

## Product decisions
- Initial operating size: up to 8 employees.
- Roles: Manager, Team Leader, Employee.
- Plan for up to 3 Team Leaders, each assigned to a team. The three leader accounts and teams are not created until their real Auth users are provisioned.
- Manager dashboard: Android mobile app (no separate web dashboard in this phase).
- Team Leaders receive the same operational modules as Manager, but every list, action, export, location, and photo is restricted to their assigned team.
- Employees can access only their own profile, shifts, attendance, leave requests, and announcements relevant to their team.

## Role dashboards

### Manager — organisation-wide access
- Overview: live present/absent/on-break/on-lunch counts, late arrivals, pending approvals.
- Employee and team administration: create/deactivate employees, assign team and Team Leader.
- Shift management: create, assign, edit and cancel shifts for any team.
- Shift changes: approve/reject requests with reviewer note.
- Attendance monitoring: view organisation-wide attendance events.
- Location monitoring: inspect recorded GPS and compare against assigned work location/geofence.
- Photo verification: securely view login/logout photos.
- Leave management: approve/reject leave for any employee.
- Reports: daily, weekly and monthly Excel exports; organisation or employee filters.
- Performance: attendance %, punctuality, late count, missed punches and hours.
- Settings: work locations, geofence radius, policies and announcement controls.
- Announcements: organisation-wide or team-specific.

### Team Leader — same operations, team-scoped
Team Leaders have all operational modules listed below, but only for employees assigned to their own team:
- Create, assign and update shifts for their team.
- Approve/reject team shift-change requests.
- Live attendance monitoring for their team.
- View GPS coordinates and geofence status for team attendance.
- View team login/logout photos.
- Approve/reject team leave requests.
- Daily, weekly and monthly Excel reports for their team.
- Team attendance and punctuality performance.
- Manage work locations/geofence settings assigned to their team.
- Publish team announcements.
Restrictions: cannot access another team, create/deactivate users, change organisation-wide settings, reassign team ownership, or alter organisation-wide policies.

### Employee — personal access
- View assigned shift and acknowledge it.
- Request shift changes and leave.
- Login/logout with consented camera photo and GPS capture.
- Break and lunch in/out.
- View own attendance history and monthly summary.
- Read relevant announcements and notifications.
- View/edit permitted personal profile fields.

## Data model foundation
Existing:
- profiles (role, team_id, employee_code, active)
- shifts
- shift_acknowledgements
- attendance_events
- private attendance-photos Storage bucket

Added in migration `teamtrack_role_based_operations`:
- teams (team name and assigned team_lead_id)
- work_locations (team, coordinates, radius, active)
- leave_requests (dates, reason, pending/approved/rejected, reviewer)
- announcements (global or team-specific)
- attendance_corrections (employee request, reviewer, audit trail)

RLS is enabled on the added tables. Manager access is organisation-wide. Team Leader policies scope operational access through the signed-in profile's team. Employees can create their own leave/correction requests and read their own records. Storage remains private.

## Implementation phases
1. Role-aware navigation and dashboard overview cards.
2. Manager employee/team administration and provisioning flow for up to 3 Team Leaders.
3. Shift calendar, assignment, employee shift-change requests and approval workflow.
4. Live attendance, GPS/geofence verification, and private photo viewer.
5. Leave request and approval workflow; announcements and notifications.
6. Daily/weekly/monthly Excel reports and performance calculations.
7. Security hardening and end-to-end testing of RLS with one test account per role.

## Important implementation rules
- Enforce authorization in Supabase RLS and database operations, not only by hiding UI buttons.
- Never put Supabase service-role/secret keys in the Android app or repository.
- Do not treat a client-provided GPS coordinate or device timestamp as tamper-proof. Validate geofence and event sequencing server-side before operational use.
- Keep photos in private Storage; issue short-lived signed URLs only after role/team authorization.
- Audit manager/team-leader approvals and attendance corrections.
- Do not use sample attendance events as payroll evidence. Test with clearly marked test records first.

## Current state / known gaps
- Manager Auth user and profile exist.
- New operational tables and baseline RLS policies have been applied and table existence/RLS enablement verified.
- Team, Team Leader, employee provisioning UI, approval workflows, geofence enforcement, secure photo viewer, notification delivery, Excel exports, and dashboard screens are not yet fully implemented.
- The existing APK is an MVP. Rebuild after the next UI implementation phase.
