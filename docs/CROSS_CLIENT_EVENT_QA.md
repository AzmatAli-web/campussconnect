# Milestone 10 — Cross-client event registration QA

**Objective:** confirm React and Flutter use the same campus backend contract, even though the mobile screen and web dashboard are separate clients.

## Automated isolated integration test

The backend integration suite now covers a complete flow using **test-only Firebase fixtures** and a **temporary in-memory MongoDB replica set**:

1. Approved faculty fixture publishes a two-seat event through the same HTTP endpoint used by the React Organizer Studio.
2. A student fixture retrieves the event through the endpoint consumed by Flutter, checking all fields required by the mobile event model.
3. The student submits the exact Flutter registration payload and idempotency header.
4. The same student can see that registration when making the equivalent React-side private registration request.
5. Another student sees updated aggregate seat availability but **cannot** see the first student's private registration or attendee roster.
6. Retrying the registration with the original idempotency key returns the original receipt without consuming another seat.
7. A new key does not allow duplicate registration, and the organizer cannot edit event details once a seat is booked.
8. The authorized event organizer can access the private attendee roster.

These tests create **no real Firebase users, no real Admin accounts, and no writes to your MongoDB Atlas database**.

Run from the repository root:

```powershell
cd C:\Users\azmii\Desktop\campussconnect
git fetch origin
git switch feature/cross-client-events-qa
git pull origin feature/cross-client-events-qa
cd backend
npm.cmd install
npm.cmd run test:integration
```

> The isolated test downloads/uses a MongoDB test binary on the first run; it does not require a connection to the actual university database. GitHub's backend CI runs the same suite.

## Manual physical-phone confirmation (separate)

1. Ensure your existing Android Firebase client file is still under `mobile/android/app/google-services.json` and your backend runs on the Windows laptop.
2. Keep the phone authorized over USB. From `mobile`, run `.\scripts\run-phone-live.ps1`.
3. On your phone, you should see **Welcome back** or your authenticated **student profile**, not an **OFFLINE DEMO** badge.
4. Sign in using the same verified Firebase student account already used by the React portal. Do not create a second account.
5. Open **Profile → Check live connections** (Milestone 9). All five checks should be green; zero published events/announcements is still valid.
6. Open the React portal in your browser and verify your own profile is the same. Check your registered event IDs on mobile and web if any exist.

### Testing a real event registration

Publishing a real event requires an **authorized verified Faculty or assigned Society Manager** account. If no such account is provisioned, do **not** grant yourself Admin/Faculty permissions merely to stage a demo. The automated isolated test above validates the publish/register/visibility flow safely.

Once an authorized organizer publishes a test event in a clearly identified development/staging environment, you can register from Flutter and verify the same event appears under **My registrations** in React. Seat totals should update and other students must not be able to view the private roster. Avoid modifying actual campus event records without authorization.

## Limits

- A green integration test proves the Express API contract under test fixtures; it is **not** equivalent to physically testing both applications against live infrastructure.
- Integration fixtures are isolated, but they assume the same repository source and server authorization checks are deployed.
- This milestone does not add any bypass for privileged roles or Admin-only routes.
