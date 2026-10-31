# CampusConnect Mobile — Flutter Student Application

Android-first Flutter client connected to the **existing** Firebase project (`campussconnect-12fdb`) and Express/MongoDB API.

**Features:** verified university email login, student profile, events, automatic capacity-protected registrations, private "My registrations", announcements, and profile.

**Local setup:** [Complete Windows/Android/FlutterFire setup](../docs/MOBILE_STUDENT_APP.md).

Quick commands:

```powershell
flutter create --platforms=android --org=com.campusconnect --project-name=campusconnect_mobile .
flutter pub get
# Then configure Firebase using FlutterFire CLI (see full guide).
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

The source includes a placeholder `lib/firebase_options.dart`; run `flutterfire configure --project=campussconnect-12fdb --platforms=android` to replace it before launching the app. **Do not paste an Admin SDK key into mobile files.**

Run tests: `flutter analyze` and `flutter test`.
