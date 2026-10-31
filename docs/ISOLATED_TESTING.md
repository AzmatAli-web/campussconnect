# Isolated role and event integration test plan

**No real Admin account needed. No Firebase credentials or Atlas URI required.**

## Running automated tests

```powershell
cd C:\Users\azmii\Desktop\campussconnect\backend
npm.cmd install
npm.cmd test
npm.cmd run test:integration
```

The integration command downloads a local test-only MongoDB binary the first time it runs (internet access required), launches a disposable **single-node MongoDB replica set**, seeds entirely fictional Student/Faculty/Manager/Admin identities in that **temporary database**, and uses a Firebase verifier double injected into Express *only by the test runner*. No browser login or API endpoint can impersonate test roles. It stops and destroys the temporary database at test exit.

The suite verifies:
1. Missing token and Student access to Admin endpoints are denied.
2. The Admin fixture can create a society and assign a Manager, while another Student cannot publish.
3. Faculty is denied until an Admin completes the evidence-attested approval.
4. Faculty can publish an event after approval.
5. Announcement publishing is role-controlled and author edits are protected.
6. Twenty Student fixtures compete for exactly five seats: successful registrations cannot exceed capacity and duplicates cannot create extra seats.
7. Idempotency keys replay successful responses and changing keys cannot bypass duplicate protection.
8. Manager revocation is effective immediately and audited.
9. A unique Admin bootstrap marker cannot be inserted twice.

## Constraints

- **Integration tests use simulated Firebase identities**, not a Firebase Auth emulator or live Firebase project.
- This is real MongoDB transaction testing inside a disposable test replica set, not a connection to production Atlas.
- CI unit and integration test results do not prove all security properties; do not grant real privileges in production or merge unreviewed PRs.
- Do **not** set your real `MONGODB_URI` for this suite; the test imports `createApp` and connects to its own temporary database.
- If MongoDB binary download fails, inspect network access / platform support. This must be reported as a failed test, not a pass.
- First-admin CLI and real Atlas behavior remain separate manual staging checks.


## Privacy: attendee identities

- The public Test Lab Activity Feed filters activity by the current persona. Individual registration notifications are visible only to the student who registered; role approvals are visible only to Admin.
- Students see their own registration status plus publicly available event seat totals. The private attendee list appears only for the event creator or the Demo Admin.
- Real backend: `GET /api/v1/me/event-registrations` returns **only the authenticated student's** registration records; `GET /api/v1/events/:id/registrations` stays restricted to the event creator or Admin. Responses set `Cache-Control: no-store`.
- All privacy checks also run in the isolated backend integration suite and frontend unit tests. Browser persona switching is a test-only simulation and is **not** real authentication.
