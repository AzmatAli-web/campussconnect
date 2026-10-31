import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/screens/student_dashboard.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class StubCampusApi extends CampusApi {
  StubCampusApi() : super(
    idTokenProvider: () async => 'stub-token',
    client: MockClient((request) async => http.Response('{}', 200)),
  );

  @override
  Future<List<CampusEvent>> getEvents() async => [
        CampusEvent.fromJson({
          'id': 'event-1',
          'title': 'Campus Workshop',
          'description': 'Teaching secure web development',
          'venue': 'Auditorium',
          'capacity': 2,
          'confirmedCount': 1,
          'registrationOpen': true,
        }),
      ];

  @override
  Future<List<CampusRegistration>> getMyRegistrations() async => [];

  @override
  Future<List<CampusAnnouncement>> getAnnouncements() async => [];
}

void main() {
  testWidgets('real student UI exposes event seats, never other attendee names', (tester) async {
    tester.view.physicalSize = const Size(1200, 1900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = StubCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: Text('loading')),
    ));
    await tester.pumpWidget(MaterialApp(
      home: StudentDashboard(
        api: api,
        profile: const CampusProfile(
          id: 'student-1',
          name: 'Test Student',
          email: 'student@cuiatd.edu.pk',
          registrationNo: null,
          status: 'active',
          roles: ['student'],
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Campus Workshop'), findsOneWidget);
    expect(find.textContaining('1 / 2 confirmed'), findsOneWidget);
    expect(find.textContaining('Attendee names'), findsNothing);
  });
}
