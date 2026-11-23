# Test LIVE CampusConnect on your USB-connected Android phone (Windows)

**No Android Studio or public deployment is required.** Flutter and the Android SDK are already installed on the development PC, and a USB-connected phone can access your local Express backend using `adb reverse`.

This procedure is **different from the offline preview APK**: it signs into your existing Firebase account and reads the real MongoDB profile through Express. Only test with accounts and data you are authorized to use.

## 1. Register the Android Firebase app (one-time)

1. Open [Firebase Console](https://console.firebase.google.com/) → project **campussconnect-12fdb** → ⚙️ **Project settings** → **Your apps**.
2. If an Android app with package `com.campusconnect.campusconnect_mobile` already exists, select it. Otherwise click **Add app → Android** and register it using that **exact Android package** (case sensitive).
3. Click **Download google-services.json**. Its contents are *public client configuration*, not a service-account private key.
4. Place the file at `C:\Users\azmii\Desktop\campussconnect\mobile\android\app\google-services.json`. Make sure it isn't accidentally named `.json.json` or `google-services (2).json`.
5. The repository ignores this file by default. **Do not commit Firebase Admin service account JSON, MongoDB URI or other private server credentials.**

The local launcher extracts the Android application ID, API key, sender number and project ID from that file and passes them as Flutter `--dart-define` values. It does not require Android Studio, the Firebase CLI or FlutterFire CLI.

**Important:** The mobile repo has its own build-time `firebase_options.dart` implementation. Do not overwrite that file using `flutterfire configure` for this workflow.

## 2. Keep Express running on the Windows PC

PowerShell terminal **A**:

```powershell
cd C:\Users\azmii\Desktop\campussconnect\backend
npm.cmd run dev
```

Optional check in a different terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/live
```

Keep your existing backend `.env` credentials as they are. The backend uses the existing Firebase Admin SDK and MongoDB Atlas.

## 3. Connect your phone, then run the script

- Unlock Android phone and keep USB cable attached.
- Turn on **Developer options → USB debugging** and approve the computer's debugging fingerprint prompt.
- Stop the currently running offline preview in its Flutter terminal (press `q` or `Ctrl+C`).

In PowerShell terminal **B**:

```powershell
cd C:\Users\azmii\Desktop\campussconnect
git fetch origin
git switch feature/usb-live-firebase-testing
git pull origin feature/usb-live-firebase-testing
cd mobile
flutter pub get
.\scripts\run-phone-live.ps1
```

If multiple Android phones/emulators are connected, supply `-DeviceId YOUR_DEVICE_ID` to the last command.

If the PowerShell execution policy blocks local scripts, **do not disable security globally**. Use this command for the current session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\run-phone-live.ps1
```

The script checks the backend, detects `adb`, runs `adb reverse tcp:4000 tcp:4000`, and launches the connected Flutter app with:

```text
API_BASE_URL=http://127.0.0.1:4000/api/v1
CAMPUSCONNECT_PREVIEW=false
```

Unlike an emulator's `10.0.2.2` address, the **phone's 127.0.0.1** reaches the PC only because the active USB ADB reverse rule forwards that port. This is a local **debug-only HTTP** workflow; release builds require a properly secured HTTPS backend.

## 4. Check the real login

1. You should see **Welcome back / Sign in**, not the offline Demo Student dashboard.
2. Use the **same verified @cuiatd.edu.pk Firebase email and password** as on the web app. Do not register another account.
3. Once signed in, your existing MongoDB student profile should load automatically.
4. Check **Events**, **My registrations**, **Announcements** and **Profile**. Empty lists are normal until a real authorized organizer has published content.
5. Registration is private: students see only their own record, and only aggregate seat counts are public.

The app does not need a real Admin account for sign-in, student profile or public event browsing.

## Troubleshooting

- **No authorized device:** run `flutter devices` and approve USB debugging on the phone. If `adb` isn't on PATH, the script searches the default Android SDK directory.
- **Backend unavailable:** check terminal A and `http://127.0.0.1:4000/api/v1/health/live`; run the launcher again after restarting Express.
- **Firebase initialization error:** confirm the Android app package and that `google-services.json` is for project `campussconnect-12fdb`, not its web app. Check that `FIREBASE_ANDROID_APP_ID` contains `:android:` (the launcher does this automatically).
- **Firebase sign-in fails on a phone without Google Play services:** some Android authentication/reCAPTCHA flows may require additional device-specific handling. Report the exact error code (never password or tokens).
- **401 on /me:** ensure both Android and web are registered inside the same Firebase project and that backend Firebase Admin credentials are valid. Sign out and back in to refresh token if appropriate.
- **App displays demo data:** stop Flutter and run this launcher, not `flutter run --dart-define=CAMPUSCONNECT_PREVIEW=true`.
- **USB disconnected:** `adb reverse` mapping may disappear. Reconnect and rerun the script.

## Notes

- The mobile app is still a **development client**. No production deployment or privileged test user is created.
- Google services JSON is ignored in the repository. Its API key is a client identifier, but do not share passwords or server Admin keys.
- When testing is done, you can remove the forwarding rule with `adb reverse --remove tcp:4000` (optionally `-s DEVICE_ID` if multiple are connected).
