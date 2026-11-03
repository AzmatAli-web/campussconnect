# CampusConnect Mobile — Flutter Student Application

The same Firebase and Express backend serve both the React website and Flutter student app.

## Android phone with USB (recommended for development)

You can test the LIVE Flutter app on a USB-connected Android phone **without Android Studio or deploying a backend**. This uses `adb reverse` to connect the phone to the Express API on your Windows laptop. You only need to register the Android app with the existing Firebase project.

**[Follow the step-by-step USB live testing guide](../docs/USB_ANDROID_LIVE_TEST.md).**

Quick launch after the one-time Firebase Android registration and starting Express:

```powershell
cd C:\Users\azmii\Desktop\campussconnect\mobile
.\scripts\run-phone-live.ps1
```

This reads public Firebase Android config from the locally downloaded and gitignored `android/app/google-services.json`. No Admin SDK JSON should ever be placed in the mobile app.

## Offline preview (fictional data)

```powershell
flutter run --dart-define=CAMPUSCONNECT_PREVIEW=true
```

Offline preview has no Firebase login, Express calls or real student registrations.

## CI builds without local Flutter

GitHub Actions can build an offline preview APK. Instructions: [Cloud Android APK](../docs/CLOUD_ANDROID_APK.md).

## Verification

```powershell
flutter analyze
flutter test
```

Production builds must use authenticated Firebase sessions and a deployed HTTPS API; the USB HTTP forwarding approach is only for local debug builds.


## Verify the real phone connection

In the **real** Firebase-connected app (not the offline preview), open **Profile → Check live connections**. This checks the Express backend, verifies the current user's own MongoDB profile, tests private registrations, and checks events/announcements availability.

All checks are read-only and use only your existing student identity. Full instructions: [Live diagnostics guide](../docs/MOBILE_LIVE_DIAGNOSTICS.md).

