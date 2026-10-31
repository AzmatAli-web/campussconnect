# Build an Android APK without Flutter SDK or Android Studio on your PC

GitHub Actions builds CampusConnect on a GitHub-hosted Ubuntu runner. Your Windows laptop needs **only a browser and Git**. No local Flutter, Android Studio, Java or Android SDK installation.

## A. Offline preview APK (available now)

1. Open [GitHub → CampusConnect APK workflow](https://github.com/AzmatAli-web/campussconnect/actions/workflows/build-android-apk.yml).
2. Select the workflow run for `feature/cloud-android-apk`. The first run is automatically triggered by the GitHub commit.
3. Once its job is **green**, open that run and scroll to **Artifacts**.
4. Click `CampusConnect-preview-Android-APK`. GitHub downloads a ZIP containing `CampusConnect-preview-debug.apk` and a SHA-256 checksum.
5. Extract the ZIP. Copy the APK to your Android phone and tap it to install, permitting installs from that file manager temporarily if Android requests it.
6. Open the app. It is clearly marked **DEMO / FICTIONAL DATA**. Browse events, simulate registering and check *My registrations* and *Announcements*.

**Important:** This demo intentionally has **no real login**, sends **no requests** to Firebase/MongoDB, and registers **no real seats**. Registrations are in-memory and reset when the app is restarted. Do not present it as a production or real-connected app. This is a debug APK for trusted testing only, not a Play Store package.

GitHub Actions artifacts normally require a signed-in GitHub account and expire after 14 days (configured in this workflow).

## B. Connected Android APK (later, once real Firebase Android app + HTTPS backend exist)

A device cannot reach the Windows backend at `localhost:4000` or the emulator alias `10.0.2.2`. Before running the *connected* workflow, deploy a **secured HTTPS staging API** or choose another reliably reachable HTTPS development backend.

Register the **Android** app in the **existing Firebase project** `campussconnect-12fdb` under project settings. Use application ID `com.campusconnect.campusconnect_mobile`. This is a different app from the previously configured Firebase **web** app. Never reuse the web App ID.

Then in the repository GitHub **Settings → Secrets and variables → Actions → Variables → New repository variable**, set the following public configuration (not Admin credentials):

| GitHub Actions Variable | Value |
| --- | --- |
| `CAMPUSCONNECT_FIREBASE_ANDROID_API_KEY` | Firebase Android app's Web API key |
| `CAMPUSCONNECT_FIREBASE_ANDROID_APP_ID` | Firebase Android app ID containing `:android:` |
| `CAMPUSCONNECT_FIREBASE_SENDER_ID` | Firebase project's sender number |
| `CAMPUSCONNECT_API_BASE_URL` | HTTPS backend URL, for example `https://your-staging-domain.example/api/v1` |

Do not add `GOOGLE_APPLICATION_CREDENTIALS`, service-account JSON, JWT secrets, MongoDB URI, or any private credentials.

After this workflow file exists on the repository's **default branch**, GitHub's **Run workflow** control can select `connected`. On a non-default feature branch, GitHub might not show manual dispatch until the workflow is merged into default. The push-triggered **preview** build on this feature branch works independently.

The connected build uses the same account and server as the React app. Before sharing, verify Firebase Android registration, server permission checks, HTTPS, app functionality, and security. This workflow builds an unsigned-for-distribution **debug-signed APK**; release signing and production deployment are later work.

## No Android device?

The preview APK requires a real Android phone to install. You can still review the existing [React browser Test Lab](http://localhost:5173/?test-lab=1) on your PC without any Android tools.

## Source and tests

- `mobile/lib/preview_app.dart`: offline UI that never initializes Firebase
- `mobile/lib/services/preview_campus_api.dart`: fictional in-memory data
- `mobile/lib/firebase_options.dart`: Android public configuration from build-time values, validated before Firebase init
- `.github/workflows/build-android-apk.yml`: APK and checksum build

Every workflow runs `flutter analyze` and `flutter test` before building an APK.
