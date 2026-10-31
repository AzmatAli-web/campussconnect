# CampusConnect — Flutter Student App (Milestone 6)

**Branch:** `feature/flutter-student-app` (stacked on real React dashboard PR #5).

This is an Android-first Flutter student client. It talks to the **same** Firebase project and Node.js/Express/MongoDB backend as the web application. Students use their existing `@cuiatd.edu.pk` Firebase account and MongoDB campus profile, without a new app-specific login. No real Admin account is required.

## Implemented

- Firebase Email/Password sign-up and sign-in, university-domain check, verification email/resend, refresh verification, sign out.
- Server-backed student profile loading and profile creation through `POST /api/v1/auth/bootstrap-profile`.
- Student dashboard with Overview, campus events, **My registrations** (private per-user), announcements and Profile.
- Automatic event registration using a reusable `Idempotency-Key` for network retries; the backend alone enforces capacity and duplicate protection.
- Client-side identity privacy: event cards expose seat totals and the signed-in student's **own** registration status, never other attendee names.
- Robust API errors, timeouts, loading and empty states. Student role checks stay enforced by Express.
- Unit tests, mocked HTTP tests and a widget smoke test. A CI workflow runs Flutter analyze/tests without real secrets.

## Prerequisites (Windows 11)

1. Install the [Flutter SDK](https://docs.flutter.dev/get-started/install) and Android Studio (including SDK and Android emulator).
2. Install Git, Node.js 22+ and Firebase CLI if not already installed.
3. Open PowerShell and verify:

```powershell
flutter doctor
flutter devices
node --version
```

You **do not** need Android Studio's iOS tools on Windows.

## 1. Checkout the mobile branch

```powershell
cd C:\Users\azmii\Desktop\campussconnect
git fetch origin
git switch feature/flutter-student-app
git pull origin feature/flutter-student-app
cd mobile
```

## 2. Generate Android platform runner (first time only)

The repository includes Flutter app source and tests. The native Android scaffold is generated with your installed Flutter version:

```powershell
flutter create --platforms=android --org=com.campusconnect --project-name=campusconnect_mobile .
flutter pub get
```

The Android application ID should be `com.campusconnect.campusconnect_mobile`. The debug manifest permits localhost HTTP for development only. **Release deployments must use HTTPS** and go through a proper security review.

## 3. Register the mobile application with the EXISTING Firebase project

The earlier React web application and Firebase project `campussconnect-12fdb` are already working. **Reuse that project**. Android is a separate registered Firebase application under the same project.

From the `mobile` directory:

```powershell
npm.cmd install -g firebase-tools
firebase.cmd login
dart pub global activate flutterfire_cli
flutterfire configure --project=campussconnect-12fdb --platforms=android
```

If PowerShell says `flutterfire` is not recognized, use the path reported by `dart pub global activate flutterfire_cli` or restart the terminal after adding your Dart Pub cache bin directory to PATH.

- Select/register the Android application with package ID `com.campusconnect.campusconnect_mobile` if prompted.
- The CLI generates/replaces `lib/firebase_options.dart` with the **public Android app configuration**. This source repository deliberately includes a placeholder in that path, so a fresh checkout compiles but displays a setup screen until you configure it.
- Firebase Console → Authentication → Sign-in method: Email/Password must be enabled (as it already is for the web app).
- **NEVER copy the Firebase Admin service-account JSON**, JWT secret, MongoDB URI or `backend/.env` into `mobile`. Those stay exclusively on the server.
- Do not commit real Android signing keys, private Firebase/Google service files, or other credentials.

Firebase setup: https://firebase.google.com/docs/flutter/setup

## 4. Run backend on your PC

In another terminal:

```powershell
cd C:\Users\azmii\Desktop\campussconnect\backend
npm.cmd install
npm.cmd run dev
```

Ensure `http://localhost:4000/api/v1/health/ready` returns ready.

## 5. Run on Android emulator

Launch an Android emulator using Android Studio → Device Manager. From the mobile folder:

```powershell
cd C:\Users\azmii\Desktop\campussconnect\mobile
flutter devices
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

**Why not localhost?** Inside the official Android emulator, `localhost` refers to the emulator itself. `10.0.2.2` accesses the development PC. This is not the same for physical phones.

For a physical Android phone on the same Wi-Fi, use your PC's actual reachable **LAN IP** and open firewall port 4000 appropriately, or use a properly secured staging HTTPS API. Example of shape only: `flutter run --dart-define=API_BASE_URL=http://YOUR_PC_LAN_IP:4000/api/v1`. Do not literally use `YOUR_PC_LAN_IP`. A deployed public release should use HTTPS and must not enable cleartext traffic.

## 6. Test using your EXISTING student account

1. Sign in with your already-verified `@cuiatd.edu.pk` email and Firebase password.
2. The app should load your existing student profile (you should **not** need to create it again).
3. Open **Events**. Empty lists are normal until a real, authorized Faculty/Society Manager publishes content.
4. Open **My registrations**. It only requests `GET /api/v1/me/event-registrations`, scoped on the backend to the signed-in student.
5. Open **Announcements**, then **Profile** and check your email, status and roles.
6. For event registration tests, a published future event is needed. Don't manually grant Admin role to test this; use the separate isolated backend test suite or the existing browser Test Lab for roles/capacity.

## Tests

```powershell
cd C:\Users\azmii\Desktop\campussconnect\mobile
flutter pub get
flutter analyze
flutter test
```

`flutter test` uses mocked HTTP responses and local test widgets only. It does not modify your real Firebase/MongoDB data.

## Known limitations

- **Flutter source scaffold is generated locally.** Platform launch was not tested on a real device in ChatGPT's environment; CI proves source analysis and tests only.
- Mobile app is **student-focused**. Admin/Faculty/Society Manager management is handled on the React web dashboard.
- Backend pagination currently limits each collection to 100 items per request; cursor/page navigation needs to be added for larger campuses.
- No push notifications, Flutter image upload, offline cache, QR check-in, or platform deep-link verification yet.
- Student signup is still restricted by the backend verified university email domain and Firebase verification status.
- The personal registration list is not an attendee directory. Organizers use restricted backend endpoints; students cannot browse who else registered.
- Mobile release APK and production backend deployment are **not** part of this milestone.
