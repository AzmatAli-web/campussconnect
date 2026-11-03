import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../config/app_config.dart';
import '../models/campus_models.dart';

typedef IdTokenProvider = Future<String> Function();

class CampusApiException implements Exception {
  final String code;
  final String message;
  final int? statusCode;
  const CampusApiException(this.code, this.message, [this.statusCode]);

  @override
  String toString() => message;
}


class CampusReadiness {
  final bool ready;
  const CampusReadiness({required this.ready});
}

class CampusApi {
  final Uri baseUri;
  final IdTokenProvider idTokenProvider;
  final http.Client client;
  final Duration requestTimeout;
  final Map<String, String> _registrationAttempts = {};
  final Uuid _uuid = const Uuid();

  CampusApi({
    required this.idTokenProvider,
    http.Client? client,
    String apiBaseUrl = AppConfig.apiBaseUrl,
    this.requestTimeout = const Duration(seconds: 15),
  })  : client = client ?? http.Client(),
        baseUri = Uri.parse(apiBaseUrl.endsWith('/')
            ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
            : apiBaseUrl);

  Uri _endpoint(String path) => Uri.parse(
        '${baseUri.toString()}${path.startsWith('/') ? path : '/$path'}',
      );

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Json? body,
    Map<String, String> extraHeaders = const {},
  }) async {
    final token = await idTokenProvider();
    if (token.isEmpty) {
      throw const CampusApiException('AUTH_REQUIRED', 'Please sign in again.');
    }
    final request = http.Request(method, _endpoint(path));
    request.headers.addAll({
      'Authorization': 'Bearer $token',
      'Accept': 'application/json',
      'Cache-Control': 'no-store',
      if (body != null) 'Content-Type': 'application/json',
      ...extraHeaders,
    });
    if (body != null) request.body = jsonEncode(body);

    http.StreamedResponse response;
    try {
      response = await client.send(request).timeout(requestTimeout);
    } on TimeoutException {
      throw const CampusApiException(
        'NETWORK_TIMEOUT',
        'Request timed out. Check the backend connection and retry.',
      );
    } on http.ClientException {
      throw const CampusApiException(
        'NETWORK_FAILURE',
        'Cannot reach CampusConnect. Check the backend address and network.',
      );
    }

    dynamic decoded;
    try {
      final content = await response.stream.bytesToString().timeout(requestTimeout);
      decoded = jsonDecode(content);
    } on TimeoutException {
      throw const CampusApiException('NETWORK_TIMEOUT', 'Backend response timed out.');
    } on FormatException {
      throw const CampusApiException(
        'INVALID_RESPONSE',
        'Backend returned an invalid response.',
      );
    }
    final envelope = asJson(decoded);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = envelope['error'] is Map ? asJson(envelope['error']) : <String, dynamic>{};
      throw CampusApiException(
        stringField(error, 'code', 'REQUEST_FAILED'),
        stringField(error, 'message', 'Request failed.'),
        response.statusCode,
      );
    }
    if (!envelope.containsKey('data')) {
      throw const CampusApiException('INVALID_RESPONSE', 'Backend response is missing data.');
    }
    return envelope['data'];
  }

  /// Public, read-only endpoint. No Firebase token or private record is sent.
  Future<CampusReadiness> getReadiness() async {
    http.Response response;
    try {
      response = await client.get(
        _endpoint('/health/ready'),
        headers: const {'Accept': 'application/json', 'Cache-Control': 'no-store'},
      ).timeout(requestTimeout);
    } on TimeoutException {
      throw const CampusApiException(
        'NETWORK_TIMEOUT', 'Campus backend did not respond in time.');
    } on http.ClientException {
      throw const CampusApiException(
        'NETWORK_FAILURE', 'Campus backend is unreachable.');
    }

    try {
      final envelope = asJson(jsonDecode(response.body));
      final data = asJson(envelope['data']);
      final status = stringField(data, 'status');
      return CampusReadiness(
        ready: response.statusCode == 200 && status == 'ready',
      );
    } on FormatException {
      throw const CampusApiException(
        'INVALID_RESPONSE', 'Backend health response was invalid.');
    }
  }

  Future<CampusProfile> getProfile() async =>
      CampusProfile.fromJson(asJson(await _request('/me')));

  Future<CampusProfile> createProfile({
    required String fullName,
    String? registrationNo,
  }) async =>
      CampusProfile.fromJson(asJson(await _request(
        '/auth/bootstrap-profile',
        method: 'POST',
        body: {
          'fullName': fullName.trim(),
          'registrationNo': registrationNo?.trim().isEmpty == true
              ? null
              : registrationNo?.trim(),
          'requestedRole': 'student',
        },
      )));

  Future<List<CampusEvent>> getEvents() async =>
      asJsonList(await _request('/events?limit=100'))
          .map(CampusEvent.fromJson)
          .toList();

  Future<List<CampusRegistration>> getMyRegistrations() async =>
      asJsonList(await _request('/me/event-registrations?limit=100'))
          .map(CampusRegistration.fromJson)
          .toList();

  Future<List<CampusAnnouncement>> getAnnouncements() async =>
      asJsonList(await _request('/announcements?limit=100'))
          .map(CampusAnnouncement.fromJson)
          .toList();

  /// University-published groups, never a student-editable schedule.
  Future<List<CampusTimetableGroup>> getTimetableGroups() async =>
      asJsonList(await _request('/timetable/groups'))
          .map(CampusTimetableGroup.fromJson)
          .toList(growable: false);

  Future<List<CampusTimetableSlot>> getTimetableSlots(
      CampusTimetableGroup group) async {
    final query = Uri(queryParameters: {
      'term': group.term,
      'program': group.program,
      'semester': group.semester.toString(),
      'section': group.section,
    }).query;
    return asJsonList(await _request('/timetable/slots?$query'))
        .map(CampusTimetableSlot.fromJson)
        .toList(growable: false);
  }

  Future<List<CampusAcademicResource>> getAcademicResources({
    String? program, int? semester, String? courseCode,
  }) async {
    final query=Uri(queryParameters: {
      'limit': '100',
      if(program != null && program.trim().isNotEmpty)
        'program': program.trim(),
      if(semester != null) 'semester': semester.toString(),
      if(courseCode != null && courseCode.trim().isNotEmpty)
        'courseCode': courseCode.trim(),
    }).query;
    return asJsonList(await _request('/resources?$query'))
        .map(CampusAcademicResource.fromJson)
        .toList(growable: false);
  }

  /// Authenticated file transfer. Never expose a token in a shareable URL.
  Future<Uint8List> downloadAcademicPdf(CampusAcademicResource resource) async {
    if(!RegExp(r'^[a-f0-9]{24}\$').hasMatch(resource.id)) {
      throw const CampusApiException('INVALID_RESOURCE', 'Invalid resource identifier.');
    }
    final token = await idTokenProvider();
    if(token.isEmpty) {
      throw const CampusApiException('AUTH_REQUIRED', 'Sign in again to download notes.');
    }
    http.Response response;
    try {
      response=await client.get(_endpoint('/resources/${resource.id}/file'),
        headers: {'Authorization': 'Bearer $token',
          'Accept': 'application/pdf', 'Cache-Control': 'no-store'})
        .timeout(requestTimeout);
    } on TimeoutException {
      throw const CampusApiException('NETWORK_TIMEOUT', 'Resource download timed out.');
    } on http.ClientException {
      throw const CampusApiException('NETWORK_FAILURE', 'Cannot reach CampusConnect.');
    }
    if(response.statusCode!=200) {
      throw CampusApiException('RESOURCE_DOWNLOAD_FAILED',
        'This PDF is unavailable or your campus access has changed.',
        response.statusCode);
    }
    final type=response.headers['content-type'] ?? '';
    final bytes=response.bodyBytes;
    if(!type.contains('application/pdf') || bytes.length>8*1024*1024 ||
        bytes.length<8 || String.fromCharCodes(bytes.take(5))!='%PDF-') {
      throw const CampusApiException('INVALID_PDF', 'Backend returned an invalid PDF.');
    }
    return bytes;
  }

  /// Stable per-event attempt key is reused on timeout/retry.
  /// A new attempt begins only after the server confirms completion.
  Future<CampusRegistration> registerForEvent(
    CampusEvent event,
    CampusProfile profile,
  ) async {
    if (!profile.canRegister) {
      throw const CampusApiException('FORBIDDEN', 'Only active students can register.');
    }
    if (!event.registrationOpen || event.isFull) {
      throw const CampusApiException('REGISTRATION_UNAVAILABLE', 'Registration is closed or full.');
    }
    final key = _registrationAttempts.putIfAbsent(event.id, () => _uuid.v4());
    final registration = CampusRegistration.fromJson(asJson(await _request(
      '/events/${Uri.encodeComponent(event.id)}/registrations',
      method: 'POST',
      extraHeaders: {'Idempotency-Key': key},
      body: {
        'universityEmail': profile.email,
        if (profile.registrationNo != null && profile.registrationNo!.isNotEmpty)
          'registrationNo': profile.registrationNo,
      },
    )));
    _registrationAttempts.remove(event.id);
    return registration;
  }

  void dispose() => client.close();
}
