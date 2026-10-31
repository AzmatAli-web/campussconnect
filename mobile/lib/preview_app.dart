import 'package:flutter/material.dart';

import 'models/campus_models.dart';
import 'screens/student_dashboard.dart';
import 'services/preview_campus_api.dart';

/// Demo app for cloud-built Android preview APKs. Does not initialize Firebase.
class CampusConnectPreviewApp extends StatefulWidget {
  const CampusConnectPreviewApp({super.key});

  @override
  State<CampusConnectPreviewApp> createState() =>
      _CampusConnectPreviewAppState();
}

class _CampusConnectPreviewAppState extends State<CampusConnectPreviewApp> {
  late final PreviewCampusApi _api;

  @override
  void initState() {
    super.initState();
    _api = PreviewCampusApi();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const profile = CampusProfile(
      id: 'preview-student',
      name: 'Demo Student',
      email: 'preview@example.test',
      registrationNo: null,
      status: 'active',
      roles: ['student'],
    );
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'CampusConnect — Offline Preview',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF3F7F9),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0DAF9C)),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            side: const BorderSide(color: Color(0xFFE2EAEE)),
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
      home: StudentDashboard(
        api: _api,
        profile: profile,
        previewMode: true,
      ),
    );
  }
}
