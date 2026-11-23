import 'dart:convert';

import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/screens/timetable_panel.dart';
import 'package:material_ui/material_ui.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('today follows PKT midnight and treats class end times as exclusive', () {
    CampusTimetableSlot slot(String id, String start, String end) =>
        CampusTimetableSlot.fromJson({'id':id,'startTime':start,'endTime':end,'dayOfWeek':1});
    final classes = [slot('later','09:00','10:00'), slot('first','08:00','09:00')];
    CampusDaySchedule at(String utc) => CampusDaySchedule.at(classes, DateTime.parse(utc));
    expect(at('2026-11-22T18:59:00Z').classes, isEmpty);
    expect(at('2026-11-22T19:00:00Z').next?.id, 'first');
    expect(at('2026-11-23T03:00:00Z').current?.id, 'first');
    expect(at('2026-11-23T04:00:00Z').current?.id, 'later');
    expect(at('2026-11-23T05:00:00Z').current, isNull);
    expect(at('2026-11-23T05:00:00Z').next, isNull);
  });

  testWidgets('student switches between today and the full timetable', (tester) async {
    final api = PreviewCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(
      child: TimetablePanel(api:api, previewMode:true),
    ))));
    await tester.pumpAndSettle();
    expect(find.textContaining('CSC494 ·'), findsOneWidget);
    expect(find.textContaining('CSC412 ·'), findsOneWidget);
    await tester.tap(find.text('Today'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Pakistan time (PKT)'), findsOneWidget);
    await tester.tap(find.text('Full week'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Pakistan time (PKT)'), findsNothing);
    expect(find.textContaining('CSC412 ·'), findsOneWidget);
  });

  test('list official class groups and fetch the chosen cohort', () async {
    final requests = <http.Request>[];
    final api = CampusApi(
      idTokenProvider: () async => 'campus-token',
      client: MockClient((request) async {
        requests.add(request);
        expect(request.headers['authorization'], 'Bearer campus-token');
        if (request.url.path.endsWith('/groups')) {
          return http.Response(jsonEncode({'data': [
            {'term':'Fall 2026','program':'BSE','semester':7,'section':'A'},
          ]}), 200);
        }
        return http.Response(jsonEncode({'data': [
          {'id':'class-one','dayOfWeek':1,'startTime':'08:00',
            'endTime':'09:30','courseCode':'CSC494',
            'courseTitle':'Software Project Management',
            'instructorName':'Test Instructor','room':'Room 201'}
        ]}), 200);
      }),
      apiBaseUrl: 'http://127.0.0.1:4000/api/v1',
    );
    final groups = await api.getTimetableGroups();
    expect(groups, hasLength(1));
    expect(groups.single.label, contains('BSE'));
    final slots = await api.getTimetableSlots(groups.single);
    expect(slots, hasLength(1));
    expect(slots.single.courseCode, 'CSC494');
    expect(requests[0].url.path, '/api/v1/timetable/groups');
    expect(requests[1].url.queryParameters['term'], 'Fall 2026');
    expect(requests[1].url.queryParameters['program'], 'BSE');
    expect(requests[1].url.queryParameters['semester'], '7');
    expect(requests[1].url.queryParameters['section'], 'A');
    api.dispose();
  });

  test('the preview timetable is fictional and does not access Firebase', () async {
    final api = PreviewCampusApi();
    final groups = await api.getTimetableGroups();
    expect(groups.single.term, contains('Demo'));
    final slots = await api.getTimetableSlots(groups.single);
    expect(slots, hasLength(2));
    expect(slots.first.room, contains('Demo'));
    api.dispose();
  });
}
