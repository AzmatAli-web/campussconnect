# Live React workspace — Milestone 5 development

Branch: `feature/real-campus-dashboards`, stacked on `feature/isolated-role-and-event-tests`.

## Live versus simulated

- **Real signed-in workspace**: `http://localhost:5173/` — Firebase Authentication + Express + Atlas. Student navigation is shown using the account's stored `activeRoles`; the API independently enforces permissions.
- **Isolated Test Lab**: `http://localhost:5173/?test-lab=1` if `VITE_ENABLE_TEST_LAB=true`. Fictional personas in browser memory, no Firebase or Atlas writes.

## Real Student walkthrough

1. Start `backend` with `npm.cmd run dev` (port 4000) and `web` with `npm.cmd run dev` (port 5173), keeping existing `.env` files.
2. Sign in using your **existing** verified `@cuiatd.edu.pk` account. Do not create another account.
3. The new workspace shows Overview, Explore events, My registrations, Announcements. If there are no events yet, this is expected: we have not provisioned real Faculty or Admin users.
4. `GET /events` exposes aggregate capacity only. `GET /me/event-registrations` returns the current student's **own** confirmed registrations only. No public Activity Feed lists student names.
5. Register for an open event. A UUID `Idempotency-Key` is retained for an event if the request errors; retrying cannot accidentally double-book.

## Organizer workflows (only once server-provisioned)

- Verified Faculty can publish university events and notices; assigned Society Managers can publish through their own approved societies.
- `GET /me/managed-societies` returns only active assigned societies.
- `GET /me/organized-events` returns only events belonging to the current authorized organizer.
- `GET /events/:id/registrations` returns student names and emails **only** to the active organizer of that event or an Admin. A revoked manager loses access.
- All changes require valid Firebase tokens and backend role checks. UI navigation is not authorization.

## Admin workflows (real authorized account needed later)

A live Admin panel is implemented for viewing accounts, faculty evidence approval, society creation and manager assignment, Staff invitation records, account moderation, audit history and private event rosters. The existing Demo Administrator **cannot** access it. No real Admin is provisioned as part of this branch.

**Important limitations:** Student account may legitimately see empty event/announcement lists until an authorized organizer publishes data. Staff invitation does not send email. No production Admin setup, complete Staff activation UI, Flutter client or push notifications yet. Backend integration suite uses a disposable MongoDB replica set and simulated Firebase IDs; do not confuse CI success with live Atlas end-to-end verification.

## Tests

```powershell
cd C:\Users\azmii\Desktop\campussconnect\backend
npm.cmd install
npm.cmd test
npm.cmd run test:integration

cd ..\web
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

PR is a **draft**, not merged. Do not deploy production before security review, staging tests, and approval of privileged identity provisioning.
