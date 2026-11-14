# Milestone 11 — Official academic timetables

CampusConnect now supports **weekly academic timetables** for colleges. This MVP deliberately separates campus-authorized publishing from student browsing.

## Scope

- Campus-wide published groups identified by **term, program, semester, and section** (e.g. Fall 2026 / BSE / 7 / A).
- Classes contain weekday (Monday=1 through Sunday=7), start/end time in **campus-local 24-hour HH:mm**, course code/name, instructor display name, and room.
- Active verified users (including students) can browse published groups and slots in **React** and **Flutter**.
- **Only active Staff or Admin roles** can publish or archive classes; ordinary Student/Faculty/Society Manager cannot.
- MongoDB unique multikey constraint blocks **overlapping published classes for the same cohort/day**, including simultaneous publishers. Class times are limited to 15-minute boundaries between 06:00–22:00, max four hours.
- Archiving removes a class from public listings and permits that interval to be reused. Original history remains stored.

## Real app and no-Admin setup

Since there is **no real campus Staff/Admin provisioned yet**, your currently signed-in Student will see **No official timetable has been published yet**. That is correct and secure. Do not promote a Student or bypass role authorization for a demo.

The isolated integration tests create fixture-only Admin and Student identities. The Flutter **offline preview** also contains a clearly labeled fictional timetable for visual testing without real database writes.

## Backend API

- `GET /api/v1/timetable/groups`: authenticated active campus user; published group summaries
- `GET /api/v1/timetable/slots?term=Fall%202026&program=BSE&semester=7&section=A`: authenticated user; published classes only
- `POST /api/v1/timetable/slots`: **Staff/Admin** only, validates all fields, returns 201 or 409 on overlap
- `POST /api/v1/timetable/slots/:id/archive`: **Staff/Admin** only; archives and hides from list

The backend rejects invalid times, unsupported fields, missing filters and unauthorized writes. Timetable responses omit internal Staff/University IDs and overlap-index keys.

## Start locally

From `C:\Users\azmii\Desktop\campussconnect`:

```powershell
git fetch origin
git switch feature/academic-timetable-mvp
git pull origin feature/academic-timetable-mvp
```

Backend terminal:

```powershell
cd backend
npm.cmd install
npm.cmd run db:ensure-indexes
npm.cmd run dev
```

If you're using the test-only database instead of Atlas:

```powershell
npm.cmd run test:integration
```

Web terminal:

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

On a connected phone, from `mobile`:

```powershell
flutter pub get
.\scripts\run-phone-live.ps1
```

You should see the **Timetable** navigation item in React and the **Classes** tab in Flutter. If no slots have been officially published, those pages display a clean empty state.

## Testing and limitations

- Backend unit/integration tests run with fake Firebase claims + isolated MongoDB replica set; they never modify the actual Atlas database.
- The offline Flutter preview contains demo-only classes; it has no Firebase login.
- No production timetable author is provisioned automatically. An actual university/college admin must approve a real Staff or Admin account using the existing secure workflow.
- All published groups are currently browseable by every active verified campus account. **There is no automatic student-to-section enrollment matching yet.** A student chooses their cohort manually.
- Slot overlap protection is per cohort/day, **not yet per instructor or classroom across different cohorts**. That can be added after verified staffing and program/section data exist.
- Timetable classes are weekly recurring lessons, not calendar-dated exceptions or substitutions.
