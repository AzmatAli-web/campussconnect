# Milestone 45 — Weekly Study Planner

Students can create up to 12 goals per campus week (120 retained goals) in a browser-local planner, browse preceding or following weeks, mark manual goals completed/reopened, and track completion percentage. Goals optionally link to an existing personal assignment. A linked goal automatically reflects the assignment's current completion status, including if reopened. If the linked assignment is removed, the goal remains but is treated as incomplete. The Student Overview includes a progress card for the current campus week.

Dates use Asia/Karachi calendar Mondays; student IDs and campus IDs scope local storage keys. This is not server-stored or synced across devices. These are private personal reminders, not official academic outcomes or faculty submissions. All changes are in a stacked draft branch; no live testing or production deployment.

Checks: `npm --prefix web test`; `npm --prefix web run build`; `npm --prefix web run test:browser` (Playwright Chromium and mock browser fixture). Live campus acceptance deferred.
