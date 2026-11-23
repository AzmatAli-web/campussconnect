// Android Firebase public client config via --dart-define.
// For GitHub cloud builds, set repository Actions Variables (see docs).
// Android app registration is REQUIRED. The existing Firebase WEB appId
// (with ':web:') is NOT valid as the Android app ID (with ':android:').
// Firebase Admin service-account credentials MUST NEVER go into a client.
import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static const _apiKey = String.fromEnvironment('FIREBASE_ANDROID_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'campussconnect-12fdb',
  );
  static const _storageBucket = String.fromEnvironment('FIREBASE_STORAGE_BUCKET');

  static FirebaseOptions get currentPlatform {
    if (_apiKey.isEmpty || _appId.isEmpty || _senderId.isEmpty ||
        _projectId.isEmpty || !_appId.contains(':android:')) {
      throw StateError('Missing valid Android Firebase app configuration. '
          'Build a preview APK, or register an Android Firebase app and '
          'configure the public GitHub Actions variables.');
    }
    return FirebaseOptions(
      apiKey: _apiKey,
      appId: _appId,
      messagingSenderId: _senderId,
      projectId: _projectId,
      storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
    );
  }
}
