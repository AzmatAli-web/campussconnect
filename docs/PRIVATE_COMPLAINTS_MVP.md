# Milestone 13 — Private student complaints and tracking

This milestone adds a campus support workflow to the existing Firebase / Express / MongoDB / React / Flutter setup.

## Student experience

- Active Student users submit a complaint in categories **Academic, Facilities, Fees, Other** with a subject and description.
- They see **only their own** complaint history, status and staff response in the React **Complaints** section.
- On Flutter, open **Profile → My complaints & tracking**. This avoids overcrowding the existing bottom navigation.
- The offline preview supports fictional complaints stored only in memory, labeled **OFFLINE DEMO**.
- No file attachments, public forum, anonymous reports, or SMS/email notifications are implemented.

## Staff and Admin experience

- Active **Staff/Admin** can view the restricted review queue in React. Faculty and Society Manager roles alone do not have access.
- Status changes are sequential: `submitted → in_review → resolved → closed`.
- A public-to-student staff response is required before resolving.
- The backend rejects skipped steps, unauthorized updates and simultaneous conflicting status updates.
- Only students and authorized campus Staff/Admin can read the complaint text. Responses are visible to the submitting student; there is no public complaint feed.

## API contract

| Method | Path | Authorization |
| --- | --- | --- |
| POST | `/api/v1/complaints` | Active Student; JSON `category`, `title`, `description` |
| GET | `/api/v1/me/complaints?limit=100` | Active Student; own only |
| GET | `/api/v1/me/complaints/:id` | Active Student; own only |
| GET | `/api/v1/staff/complaints?status=submitted` | Active Staff or Admin |
| PATCH | `/api/v1/staff/complaints/:id` | Active Staff or Admin; `status` plus optional `staffResponse` |

The backend derives `studentId` and `universityId` from the verified session and configured university. Client-supplied identity/status/privileged fields are rejected. Responses omit student IDs, email, Firebase IDs, and handler IDs. All endpoints set `Cache-Control: private, no-store`.

**Scope limits:** The queue is accessible to all authorized Staff within the current university; finer-grained department-specific routing, complaint reassignment, audit reporting, retention policy, moderation, anti-abuse rate controls, sensitive-case escalation, and notification service remain future work. Do not use the MVP for confidential misconduct or emergency reporting until dedicated privacy and escalation protocols exist. The complaints endpoint inherits the app's general API rate limiter.

## Isolated testing and real testing

All automated integration cases use an in-memory MongoDB replica set and mock Firebase identities. They verify creation, another student's 404, denied unauthorized staff routes, accepted staff review, response requirements, and finalization. No real Admin accounts, user privileges, or live complaint records are created by CI.

When ready to test manually, checkout this draft branch and start backend, React and Flutter. First run from `backend`:
```powershell
npm.cmd run db:ensure-indexes
npm.cmd run dev
```
Only create fictional test complaints in an approved staging database. With a live Student, the creation and own-list workflow can run, but reviewing/resolving requires an actual authorized Staff/Admin account.

This branch is stacked on draft Milestone 12 and previous branches and is not deployed to production.
