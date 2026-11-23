# Milestone 44 — Unified student dashboard

The student-only Overview now presents today's classes from the existing authorized timetable API and up to four unfinished assignment deadlines from the student's browser-local assignment planner. The existing announcements, upcoming events, and personal registration counts remain unchanged. The schedule follows the previously chosen group (a local viewing preference, not proof of enrollment). All dates and class times follow Pakistan Standard Time. Nonstudent roles retain the existing overview.

No new API endpoint, faculty submission, synchronized assignment storage, or live deployment is added. The UI handles missing timetables and loading failures explicitly, and its cards stack on narrow screens. Existing browser fixture tests continue to cover role-specific navigation and privacy. Unit tests cover campus-day logic, timetable selection, and only-open deadlines.
