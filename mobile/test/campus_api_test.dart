import 'dart:convert';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final demoEvent = CampusEvent.fromJson({
  'id': '65aabbccddeeff0011223344',
  'title': 'Engineering Meetup',
  'description': 'Join an engineering meetup on campus',
  'venue': 'Hall A',
  'capacity': 5,
  'confirmedCount': 0,
  'registrationOpen': true,
  'isFull': false,
});
const demoProfile = CampusProfile(
  id: 'student-1',
  name: 'Test Student',
  email: 'student@cuiatd.edu.pk',
  registrationNo: 'FA23-BSE-024',
  status: 'active',
  roles: ['student'],
);

void main() {
  test('student list requests send the ID token and target only own registrations', () async {
    final requested = <Uri>[];
    final client = MockClient((request) async {
      requested.add(request.url);
      expect(request.headers['authorization'], 'Bearer mock-firebase-token');
      expect(request.headers['cache-control'], 'no-store');
      return http.Response(jsonEncode({'data': [
        {'id': 'r1', 'eventId': demoEvent.id, 'status': 'confirmed'}
      ]}), 200);
    });
    final api = CampusApi(
      idTokenProvider: () async => 'mock-firebase-token',
      client: client,
      apiBaseUrl: 'http://10.0.2.2:4000/api/v1',
    );
    final registrations = await api.getMyRegistrations();
    expect(registrations, hasLength(1));
    expect(requested.single.path, '/api/v1/me/event-registrations');
    expect(requested.single.queryParameters['limit'], '100');
    api.dispose();
  });

  test('registration retries reuse identical idempotency keys after server error', () async {
    final keys = <String>[];
    var attempts = 0;
    final client = MockClient((request) async {
      attempts++;
      expect(request.url.path, '/api/v1/events/${demoEvent.id}/registrations');
      final key = request.headers['idempotency-key'];
      expect(key, isNotNull);
      keys.add(key!);
      final json = jsonDecode(request.body) as Map<String, dynamic>;
      expect(json['universityEmail'], demoProfile.email);
      expect(json['registrationNo'], demoProfile.registrationNo);
      if (attempts == 1) {
        return http.Response(jsonEncode({'error': {
          'code': 'RETRY_REGISTRATION', 'message': 'Retry same idempotency key'
        }}), 503);
      }
      return http.Response(jsonEncode({'data': {
        'id': 'registration-1',
        'eventId': demoEvent.id,
        'status': 'confirmed',
      }}), 201);
    });
    final api = CampusApi(
      idTokenProvider: () async => 'test-id-token',
      client: client,
      apiBaseUrl: 'http://10.0.2.2:4000/api/v1',
    );
    await expectLater(api.registerForEvent(demoEvent, demoProfile),
        throwsA(isA<CampusApiException>()));
    final confirmed = await api.registerForEvent(demoEvent, demoProfile);
    expect(confirmed.status, 'confirmed');
    expect(keys, hasLength(2));
    expect(keys[0], keys[1]);
    expect(keys[0].length, greaterThanOrEqualTo(8));
    api.dispose();
  });

  test('a Student cannot register with an inactive profile', () async {
    final api = CampusApi(idTokenProvider: () async => 'token',
      client: MockClient((request) async =>
          throw StateError('No HTTP request should be sent')));
    const suspended = CampusProfile(
      id: 'suspended',
      name: 'User',
      email: 'u@cuiatd.edu.pk',
      registrationNo: null,
      status: 'suspended',
      roles: ['student'],
    );
    await expectLater(api.registerForEvent(demoEvent, suspended),
        throwsA(isA<CampusApiException>()));
    api.dispose();
  });

  test('backend errors are shown without exposing Firebase tokens', () async {
    final api = CampusApi(
      idTokenProvider: () async => 'do-not-print-this-token',
      client: MockClient((request) async => http.Response(jsonEncode({
        'error': {'code': 'FORBIDDEN', 'message': 'Insufficient permissions'}
      }), 403)),
    );
    await expectLater(
      api.getEvents(),
      throwsA(isA<CampusApiException>()
          .having((e) => e.code, 'code', 'FORBIDDEN')
          .having((e) => e.message, 'message', isNot(contains('do-not-print')))),
    );
    api.dispose();
  });
}
