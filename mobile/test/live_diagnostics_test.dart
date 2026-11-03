import 'dart:convert';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/live_diagnostics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const student = CampusProfile(
  id: '507f1f77bcf86cd799439011',
  name: 'Test Student',
  email: 'test@cuiatd.edu.pk',
  registrationNo: 'FA23-BSE-001',
  status: 'active',
  roles: ['student'],
);

class StubDiagnosticsApi extends CampusApi {
  bool backendReady = true;
  bool mismatch = false;
  bool failRegistration = false;

  StubDiagnosticsApi()
      : super(
          idTokenProvider: () async => 'fixture-token',
          client: MockClient((request) async => http.Response('{}', 200)),
        );

  @override
  Future<CampusReadiness> getReadiness() async =>
      CampusReadiness(ready: backendReady);

  @override
  Future<CampusProfile> getProfile() async =>
      CampusProfile(
        id: mismatch ? 'unexpected-id' : student.id,
        name: student.name,
        email: student.email,
        registrationNo: student.registrationNo,
        status: student.status,
        roles: student.roles,
      );

  @override
  Future<List<CampusRegistration>> getMyRegistrations() async {
    if (failRegistration) {
      throw const CampusApiException(
        'FORBIDDEN', 'Mock failure containing a secret fixture-token', 403);
    }
    return [
      const CampusRegistration(
        id: 'registration-private',
        eventId: 'event-test',
        confirmedAt: null,
        status: 'confirmed',
      ),
    ];
  }

  @override
  Future<List<CampusEvent>> getEvents() async => [];

  @override
  Future<List<CampusAnnouncement>> getAnnouncements() async => [];
}

void main() {
  test('readiness check is a public endpoint, no Firebase ID token in request', () async {
    final requests = <http.Request>[];
    final api = CampusApi(
      idTokenProvider: () async => throw StateError('Never read token for health'),
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode({'data': {
          'status': 'ready',
          'checks': {'database': true, 'firebase': true, 'university': true},
        }}), 200);
      }),
      apiBaseUrl: 'http://127.0.0.1:4000/api/v1',
    );
    final status = await api.getReadiness();
    expect(status.ready, isTrue);
    expect(requests.single.url.path, '/api/v1/health/ready');
    expect(requests.single.headers.keys
        .any((key) => key.toLowerCase() == 'authorization'), isFalse);
    api.dispose();
  });

  test('unready backend produces a non-green readiness status', () async {
    final api = CampusApi(
      idTokenProvider: () async => '',
      client: MockClient((request) async => http.Response(
        '{"data":{"status":"not_ready"}}', 503)),
    );
    expect((await api.getReadiness()).ready, isFalse);
    api.dispose();
  });

  test('full live diagnostic validates auth and private student routes', () async {
    final api = StubDiagnosticsApi();
    final checks = await runCampusDiagnostics(api, student);
    expect(checks, hasLength(5));
    expect(checks.every((check) => check.passed), isTrue);
    expect(checks[2].detail, contains('1 personal record'));
    expect(checks.join(' '), isNot(contains(student.email)));
    api.dispose();
  });

  test('failed readiness and incorrect profile are marked as failures', () async {
    final api = StubDiagnosticsApi()
      ..backendReady = false
      ..mismatch = true;
    final checks = await runCampusDiagnostics(api, student);
    expect(checks[0].passed, isFalse);
    expect(checks[1].passed, isFalse);
    expect(checks[2].passed, isTrue);
    api.dispose();
  });

  test('diagnostic messages do not expose backend error details or Firebase token', () async {
    final api = StubDiagnosticsApi()..failRegistration = true;
    final checks = await runCampusDiagnostics(api, student);
    expect(checks[2].passed, isFalse);
    expect(checks[2].detail, contains('does not have access'));
    expect(checks[2].detail, isNot(contains('fixture-token')));
    api.dispose();
  });
}
