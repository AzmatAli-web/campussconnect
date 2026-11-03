import 'dart:convert';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
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
