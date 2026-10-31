# CampusConnect Web — Student Authentication Milestone

A minimal React + Firebase student registration/login test client; not yet the complete role-based dashboards.

## Requirements
Node.js 22+, running backend on localhost:4000, Firebase Email/Password enabled, officially approved university email domain, Firebase Web app registered, backend configuration and credentials.

## Setup (PowerShell)
```powershell
cd web
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Edit **web/.env** first. In Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration → **Config**, copy `apiKey`, `authDomain`, `projectId` and `appId` into corresponding `VITE_` values. Firebase Web SDK config contains identifiers exposed to the browser; **never** put Admin SDK service account keys, MongoDB passwords or a backend `.env` into the web app.

Open http://127.0.0.1:5173/ (or the URL printed by Vite). Backend CORS currently allows http://localhost:5173, so use http://localhost:5173/ if you encounter a CORS error; alternatively update backend CORS_ORIGIN to the exact browser origin and restart.

### Test
1. Register with an **email you control** on the verified university domain and a test password.
2. Open the Firebase verification email.
3. Sign in after verification.
4. Complete the student profile form; inspect `campusconnect_dev.users` in Atlas.
5. Verify unknown emails, unverified users and privilege fields cannot bootstrap profiles.

**Important:** Don't invent an address or create a Firebase user without mailbox access; verification is required. Users with a faculty email must not be granted faculty role by this student UI. Student backend bootstrap currently validates that the email is verified and domain-approved.

## Known limitations
- The Express readiness endpoint only checks initialized configuration, not live Firebase token validation or university document existence.
- Faculty, Society Manager, Staff and Admin workflows are not implemented here.
- Browser UI and cloud end-to-end flow still need manual testing. No claim of successful live registration yet.
- University email validation is on the server, even though the UI also provides early guidance.

## Isolated browser test lab — no Admin account required

To try the new interactive UI locally, add to **web/.env**:

```dotenv
VITE_ENABLE_TEST_LAB=true
```

Restart Vite with `npm.cmd run dev`, and open **http://localhost:5173/?test-lab=1**.
The test lab exposes *fictional* Admin/Faculty/Manager/Student personas **only in local development**. Data lives in React memory; reloading or clicking Reset clears it. There are **no Firebase Auth logins, no privileged API requests, and no MongoDB writes** from the lab.

Walkthrough:
1. As Demo Administrator, select **Role management**, approve Faculty and assign the Society Manager.
2. Select Faculty or Society Manager from sidebar and publish a test event / announcement.
3. Select Demo Student 1, 2 and 3, open Events, register for the seeded three-seat meetup.
4. Select Demo Student 4; verify **Capacity reached**. Switch to Student 1; verify **Already registered**.
5. Return to real `/` to use your existing Firebase student account.

This interactive lab is **not** a replacement for integration tests. Actual server race protection and role restrictions are verified with `npm.cmd run test:integration` from `backend`. For local isolation, test fixture email addresses end in `.test` and are never used with your campus identity.

Frontend tests: `npm.cmd test`, then `npm.cmd run build` from `web`.

## Security note

The browser demo is hard-disabled in production builds by `import.meta.env.DEV`. Never use browser UI role switching to grant live privileges.
