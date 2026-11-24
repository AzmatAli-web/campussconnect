import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/screens/student_dashboard.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:material_ui/material_ui.dart';
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

class HistoryPreview extends PreviewCampusApi {
  @override
  Future<List<CampusRegistration>> getMyRegistrations() async => [
    CampusRegistration.fromJson({'id':'receipt','eventId':'archived','status':'confirmed',
      'event':{'title':'Previous seminar','venue':'Alumni Hall','status':'cancelled',
        'startsAt':'2026-08-01T09:00:00Z'}}),
  ];
}

void main() {
  testWidgets('students filter events and notices and read a receipt outside the public feed', (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = HistoryPreview();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: StudentDashboard(api:api,previewMode:true,
      profile:CampusProfile.fromJson({'status':'active','activeRoles':['student']}))));
    await tester.pumpAndSettle();
    Future<void> pick(String current, String value) async {
      await tester.tap(find.text(current).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(value).last);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byIcon(Icons.event_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'HALL');
    await pick('All dates','Past');
    expect(find.text('Campus Science Fair'),findsOneWidget);
    expect(find.text('AI & Robotics Workshop'),findsNothing);
    await pick('Past','Upcoming');
    expect(find.text('No matching events'),findsOneWidget);
    await tester.tap(find.byIcon(Icons.campaign_outlined));
    await tester.pumpAndSettle();
    await pick('All audiences','Society');
    expect(find.text('Developer Community Session'),findsOneWidget);
    expect(find.text('Welcome to the CampusConnect Preview'),findsNothing);
    await tester.tap(find.byIcon(Icons.verified_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Previous seminar'),findsOneWidget);
    expect(find.textContaining('Event cancelled'),findsOneWidget);
    expect(find.textContaining('Alumni Hall'),findsOneWidget);
    await tester.enterText(find.byType(TextFormField),'no such venue');
    await tester.pumpAndSettle();
    expect(find.text('No matching registrations.'),findsOneWidget);
    await tester.enterText(find.byType(TextFormField),'ALUMNI');
    await tester.pumpAndSettle();
    expect(find.text('Previous seminar'),findsOneWidget);
  });

  test('mobile search sends combined filters to the authenticated endpoints', () async {
    final requests=<http.Request>[];
    final api=CampusApi(idTokenProvider:() async=>'fixture',client:MockClient((req) async {
      requests.add(req);
      return http.Response('{"data":[]}',200);
    }));
    addTearDown(api.dispose);
    await api.searchEvents(' Hall & A ','past');
    await api.searchAnnouncements(' meeting ',scope:'department');
    expect(requests.first.url.queryParameters,{'q':'Hall & A','limit':'100','when':'past'});
    expect(requests.last.url.queryParameters,{'q':'meeting','limit':'100','scope':'department'});
    expect(requests.every((req)=>req.headers['authorization']=='Bearer fixture'),isTrue);
  });

  test('notice search sends a literal encoded keyword with the student token', () async {
    final api = CampusApi(idTokenProvider: () async => 'fixture', client: MockClient((req) async {
      expect(req.url.path, endsWith('/announcements'));
      expect(req.url.queryParameters, {'q':'Arts & Crafts','limit':'100'});
      expect(req.headers['authorization'], 'Bearer fixture');
      return http.Response('{"data":[]}', 200);
    }));
    addTearDown(api.dispose);
    expect(await api.searchAnnouncements('  Arts & Crafts '), isEmpty);
  });

  testWidgets('student searches notice messages and clears an empty result', (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = PreviewCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: StudentDashboard(
      api: api, previewMode: true, profile: CampusProfile.fromJson({'roles':['student']}),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.campaign_outlined));
    await tester.pumpAndSettle();
    Future<void> search(String term) async {
      await tester.enterText(find.byType(TextField), term);
      await tester.tap(find.widgetWithText(FilledButton, 'Search'));
      await tester.pumpAndSettle();
    }
    await search('FIREBASE');
    expect(find.text('Developer Community Session'), findsOneWidget);
    expect(find.text('Welcome to the CampusConnect Preview'), findsNothing);
    await search('no-such-notice');
    expect(find.text('No matching notices'), findsOneWidget);
    await tester.tap(find.text('Clear'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to the CampusConnect Preview'), findsOneWidget);
  });

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
