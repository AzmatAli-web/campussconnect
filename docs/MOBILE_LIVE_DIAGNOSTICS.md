# Milestone 9 — Live mobile connectivity diagnostics

The real CampusConnect Flutter app has a new **Profile → Check live connections** button. It performs **read-only** checks against the local Express/MongoDB environment using the currently signed-in Firebase account.

## How to try it

1. Keep the Node backend running in the first PowerShell terminal:
   `cd C:\Users\azmii\Desktop\campussconnect\backend; npm.cmd run dev`
2. Keep your authorized Android phone connected by USB with debugging enabled.
3. Checkout this branch and use the same live launcher:

```powershell
cd C:\Users\azmii\Desktop\campussconnect
git fetch origin
git switch feature/mobile-live-diagnostics
git pull origin feature/mobile-live-diagnostics

cd mobile
flutter pub get
.\scripts\run-phone-live.ps1
```

The Android Firebase app must still be registered in project `campussconnect-12fdb`, and the downloaded `google-services.json` must exist **locally** at `mobile/android/app/google-services.json` (gitignored). Do not share or commit Admin keys, passwords or tokens.

4. Sign in with the **same verified student account** used on the React website.
5. Open **Profile**, tap **Check live connections**.
6. Confirm the five statuses: backend readiness, Firebase + student profile, private registration list, event endpoint and announcement endpoint.
7. Green events/announcements checks with **0 records** are expected if no authorized organizer has published content. Empty data is not the same as a failed connection.

If backend readiness fails but Firebase works, check `adb reverse --list` and make sure port 4000 is forwarded. Disconnecting USB can remove that rule. The PowerShell launcher recreates it when run again.

## Privacy / permissions

- Diagnostics use `GET /api/v1/health/ready` (public), `GET /api/v1/me`, `GET /api/v1/me/event-registrations`, `GET /api/v1/events` and `GET /api/v1/announcements`.
- `/me` and `/me/event-registrations` are protected server-side. The app does not call any private attendee roster or Admin endpoints.
- Diagnostic results include status and aggregate counts only; no attendee names, Firebase tokens or student IDs are shown.
- No database records are modified. No Admin account or fake role is created.
- A fully green result checks the current session and routes, **not** all production access-control behavior or real device conditions.

## Further validation

Before calling the system end-to-end complete, run one approved organizer event in a nonproduction environment, register from the mobile app using a Student fixture, and confirm that **only that student** can read the private registration. The backend integration suite tests this without needing real Admin identities.

The branch is a draft until manual physical-phone validation and security review.
