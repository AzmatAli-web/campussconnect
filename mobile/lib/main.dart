import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'firebase_options.dart';
import 'preview_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const previewMode = bool.fromEnvironment('CAMPUSCONNECT_PREVIEW', defaultValue: false);
  if (previewMode) {
    // Deliberate offline-only preview: no Firebase or Express initialization.
    runApp(const CampusConnectPreviewApp());
    return;
  }
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    runApp(const CampusConnectApp());
  } catch (error) {
    // A fresh checkout deliberately has no valid Firebase mobile app config.
    // Show setup instructions rather than crashing or using a hard-coded key.
    runApp(MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFFF2F7F8),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.settings_suggest_rounded,
                    size: 58, color: Color(0xFF168F82)),
                const SizedBox(height: 20),
                const Text('Mobile Firebase setup required',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
                const SizedBox(height: 14),
                const Text(
                  'This connected APK needs the public Android Firebase app configuration '
                  'and a reachable HTTPS CampusConnect backend. Build it using '
                  'GitHub Actions repository variables, or use the separate '
                  'offline preview APK. Never use a Firebase Admin private key.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    ));
  }
}
