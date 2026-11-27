import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
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

    return _sendEnvelope(request);
  }

  Future<dynamic> _sendEnvelope(http.BaseRequest request,{
    String fallbackCode='REQUEST_FAILED',String fallbackMessage='Request failed.',
  }) async {
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

    late Json envelope;
    try {
      final content = await response.stream.bytesToString().timeout(requestTimeout);
      envelope = asJson(jsonDecode(content));
    } on TimeoutException {
      throw const CampusApiException('NETWORK_TIMEOUT', 'Backend response timed out.');
    } on http.ClientException {
      throw const CampusApiException('NETWORK_FAILURE','Backend response was interrupted.');
    } on FormatException {
      if(response.statusCode<200||response.statusCode>=300){
        throw CampusApiException(fallbackCode,fallbackMessage,response.statusCode);
      }
      throw const CampusApiException(
        'INVALID_RESPONSE',
        'Backend returned an invalid response.',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = envelope['error'] is Map ? asJson(envelope['error']) : <String, dynamic>{};
      throw CampusApiException(
        stringField(error, 'code', fallbackCode),
        stringField(error, 'message', fallbackMessage),
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

  Future<List<CampusEvent>> calendarEventPage(DateTime from,DateTime to,int page) async {
    String date(DateTime value)=>value.toIso8601String().substring(0,10);
    final query=Uri(queryParameters:{'from':date(from),'to':date(to),'page':'$page','limit':'100'}).query;
    return asJsonList(await _request('/events?$query')).map(CampusEvent.fromJson).toList();
  }

  Future<List<CampusEvent>> searchEvents(String keyword, String when) async {
    final query = Uri(queryParameters: {
      'limit':'100', 'when':when, if (keyword.trim().isNotEmpty) 'q':keyword.trim(),
    }).query;
    return asJsonList(await _request('/events?$query')).map(CampusEvent.fromJson).toList();
  }

  Future<CampusProfile> updateProfile(String name, String registration) async =>
      CampusProfile.fromJson(asJson(await _request('/me', method: 'PATCH', body: {
        'fullName': name.trim(),
        'registrationNo': registration.trim().isEmpty ? null : registration.trim(),
      })));

  Future<List<Json>> conversationPage({String? threadId, String? before}) async {
    final path = threadId == null ? '/conversations' : '/conversations/$threadId/messages';
    return asJsonList(await _request(before == null ? path : '$path?before=$before'));
  }

  Future<Json> askCampus(String question) async =>
      asJson(await _request('/knowledge-sources/answer', method: 'POST', body: {'question': question}));

  Future<Json> citedSource(String id) async => asJson(await _request('/knowledge-sources/$id'));

  Future<Json> conversationState(String id) async =>
      asJson(await _request('/conversations/$id'));

  Future<void> blockConversation(String id, bool blocked) async {
    await _request('/conversations/$id/block', method: 'PATCH', body: {'blocked': blocked});
  }

  Future<void> reportConversation(String id, String reason, String? messageId) async {
    await _request('/conversations/$id/reports', method: 'POST',
        body: {'reason': reason, 'messageId': messageId});
  }

  Future<void> readMessages(String id, List<String> ids) async {
    await _request('/conversations/$id/read', method: 'PATCH', body: {'ids': ids});
  }

  Future<Json> requestConversation(String email) async =>
      asJson(await _request('/conversations', method: 'POST', body: {'email': email}));

  Future<Json> decideConversation(String id, String status) async =>
      asJson(await _request('/conversations/$id', method: 'PATCH', body: {'status': status}));

  Future<void> sendMessage(String id, String text, String clientId) async {
    await _request('/conversations/$id/messages', method: 'POST',
        body: {'body': text, 'clientId': clientId});
  }

  Future<Json> issueEventTicket(String id) async =>
      asJson(await _request('/me/event-registrations/${Uri.encodeComponent(id)}/ticket',method:'POST'));

  Future<List<CampusRegistration>> getMyRegistrations() async =>
      asJsonList(await _request('/me/event-registrations?limit=100&includeEvent=1'))
          .map(CampusRegistration.fromJson)
          .toList();

  Future<List<CampusAnnouncement>> getAnnouncements() => searchAnnouncements('');

  Future<List<CampusAnnouncement>> searchAnnouncements(String keyword, {String scope = 'all'}) async {
    final query = Uri(queryParameters: {
      'limit': '100',
      if (keyword.trim().isNotEmpty) 'q': keyword.trim(),
      if (scope != 'all') 'scope': scope,
    }).query;
    return asJsonList(await _request('/announcements?$query'))
        .map(CampusAnnouncement.fromJson).toList(growable: false);
  }

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
    String? program, int? semester, String? courseCode, String? keyword,
  }) async {
    final query=Uri(queryParameters: {
      'limit': '100',
      if (keyword != null && keyword.trim().isNotEmpty) 'q': keyword.trim(),
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
    if(!RegExp(r'^[a-f0-9]{24}$').hasMatch(resource.id)) {
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


  Future<List<CampusComplaint>> getMyComplaints() async =>
      asJsonList(await _request('/me/complaints?limit=100'))
        .map(CampusComplaint.fromJson).toList(growable:false);

  /// Identity is derived from Firebase, never accepted from the client.
  Future<CampusComplaint> submitComplaint({
    required String category, required String title,
    required String description,
  }) async =>
      CampusComplaint.fromJson(asJson(await _request('/complaints',
        method:'POST',body:{
          'category':category,
          'title':title.trim(),
          'description':description.trim(),
        })));


  /// Read-only finance for Students; Staff record offline receipts.
  Future<List<CampusFeeInvoice>> getMyFees() async =>
      asJsonList(await _request('/me/fees?limit=100'))
          .map(CampusFeeInvoice.fromJson).toList(growable:false);

  Future<List<CampusFeePayment>> getMyFeePayments(
      CampusFeeInvoice invoice) async {
    if(invoice.id.length!=24 || RegExp(r'[^a-f0-9]').hasMatch(invoice.id)){
      throw const CampusApiException('INVALID_FEE','Invalid fee identifier.');
    }
    return asJsonList(await _request('/me/fees/${invoice.id}/payments'))
        .map(CampusFeePayment.fromJson).toList(growable:false);
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



  /// All Marketplace calls enforce identity, tenant scope and ownership on Express.
  Future<List<CampusMarketplaceItem>> getMarketplace({
    String? query,String? category,int? minPrice,int? maxPrice,
  }) async {
    final q=Uri(queryParameters:{
      'limit':'100',
      if(minPrice!=null)'minPrice':'$minPrice',
      if(maxPrice!=null)'maxPrice':'$maxPrice',
      if(query!=null && query.trim().isNotEmpty)'q':query.trim(),
      if(category!=null && category.isNotEmpty)'category':category,
    }).query;
    return asJsonList(await _request('/marketplace?$q'))
      .map(CampusMarketplaceItem.fromJson).toList(growable:false);
  }

  Future<List<CampusMarketplaceItem>> getMyMarketplace() async =>
    asJsonList(await _request('/me/marketplace?limit=100'))
      .map(CampusMarketplaceItem.fromJson).toList(growable:false);

  Future<CampusMarketplaceItem> createMarketplaceItem({
    required String title,required String description,
    required String category,required String condition,
    required int pricePkr,required bool contactConsent,
  }) async => CampusMarketplaceItem.fromJson(asJson(await _request('/marketplace',
    method:'POST',body:{
      'title':title.trim(),'description':description.trim(),
      'category':category,'condition':condition,'pricePkr':pricePkr,
      'contactConsent':contactConsent,
    })));

  Future<CampusMarketplaceItem> updateMarketplaceItem(
    String id,Json body,
  ) async => CampusMarketplaceItem.fromJson(asJson(await _request(
    '/marketplace/${Uri.encodeComponent(id)}',method:'PATCH',body:body)));

  Future<CampusMarketplaceItem> setMarketplaceStatus(
    String id,String status,
  ) async => CampusMarketplaceItem.fromJson(asJson(await _request(
    '/marketplace/${Uri.encodeComponent(id)}/status',
    method:'POST',body:{'status':status})));

  Future<String> getMarketplaceContact(String id) async {
    final data=asJson(await _request(
      '/marketplace/${Uri.encodeComponent(id)}/contact'));
    return stringField(data,'email');
  }

  Future<void> reportMarketplaceItem(
    String id,{required String reason,String detail='',
  }) async {
    await _request('/marketplace/${Uri.encodeComponent(id)}/reports',
      method:'POST',body:{'reason':reason,'detail':detail.trim()});
  }

  /// Authenticated binary image, not an open URL.
  Future<Uint8List> downloadMarketplacePhoto(String id) async {
    final token=await idTokenProvider();
    if(token.isEmpty)throw const CampusApiException('AUTH_REQUIRED','Sign in again.');
    late http.Response response;
    try{
      response=await client.get(_endpoint('/marketplace/${Uri.encodeComponent(id)}/image'),
        headers:{'Authorization':'Bearer $token','Cache-Control':'no-store'})
        .timeout(requestTimeout);
    }on TimeoutException{
      throw const CampusApiException('NETWORK_TIMEOUT','Photo request timed out.');
    }on http.ClientException{
      throw const CampusApiException('NETWORK_FAILURE','Cannot reach the photo server.');
    }
    if(response.statusCode!=200){
      throw CampusApiException(
        'IMAGE_UNAVAILABLE','Photo is unavailable.',response.statusCode);
    }
    final mime=(response.headers['content-type']??'').split(';').first;
    if(!['image/jpeg','image/png','image/webp'].contains(mime)||
      response.bodyBytes.length>2*1024*1024){
      throw const CampusApiException('INVALID_MARKET_IMAGE','Unexpected image response.');
    }
    return response.bodyBytes;
  }

  Future<void> uploadMarketplacePhoto(
    String id,Uint8List bytes,String filename,
  ) async {
    if(bytes.isEmpty||bytes.length>2*1024*1024){
      throw const CampusApiException('INVALID_MARKET_IMAGE',
        'Choose an image up to 2 MB.');
    }
    final fileName=filename.split(RegExp(r'[/\\]')).last;
    final name=fileName.toLowerCase();
    final mime=name.endsWith('.jpg')||name.endsWith('.jpeg')?'image/jpeg':
      name.endsWith('.png')?'image/png':
      name.endsWith('.webp')?'image/webp':null;
    if(mime==null){
      throw const CampusApiException(
        'INVALID_MARKET_IMAGE','Choose JPEG, PNG or WebP.');
    }
    final token=await idTokenProvider();
    if(token.isEmpty)throw const CampusApiException('AUTH_REQUIRED','Sign in again.');
    final request=http.MultipartRequest('POST',
      _endpoint('/marketplace/${Uri.encodeComponent(id)}/image'));
    request.headers['Authorization']='Bearer $token';
    request.files.add(http.MultipartFile.fromBytes('file',bytes,
      filename:fileName,contentType:MediaType.parse(mime)));
    await _sendEnvelope(request,fallbackCode:'UPLOAD_FAILED',fallbackMessage:'Image upload failed.');
  }


  /// Public-to-campus lost/found items. Reporter identity is not part of responses.
  Future<List<CampusLostFoundItem>> getLostFoundItems({
    String? query,String? kind,String? category,
  }) async {
    final params=Uri(queryParameters:{
      'limit':'100',
      if(query!=null&&query.trim().isNotEmpty)'q':query.trim(),
      if(kind!=null&&kind.isNotEmpty)'kind':kind,
      if(category!=null&&category.isNotEmpty)'category':category,
    }).query;
    return asJsonList(await _request('/lost-found-items?$params'))
      .map(CampusLostFoundItem.fromJson).toList(growable:false);
  }

  Future<List<CampusLostFoundItem>> getMyLostFoundItems() async =>
    asJsonList(await _request('/me/lost-found-items?limit=100'))
      .map(CampusLostFoundItem.fromJson).toList(growable:false);

  Future<List<CampusLostFoundMatch>> getLostFoundMatches(String reportId) async {
    final rows = await _request('/me/lost-found-items/${Uri.encodeComponent(reportId)}/matches');
    return asJsonList(rows).map(CampusLostFoundMatch.fromJson).toList(growable: false);
  }

  Future<CampusLostFoundItem> createLostFoundItem({
    required String kind,required String title,required String description,
    required String category,required String locationText,
    required String contactPreference,String? occurredAt,
  }) async => CampusLostFoundItem.fromJson(asJson(
    await _request('/lost-found-items',method:'POST',body:{
      'kind':kind,'title':title.trim(),
      'description':description.trim(),'category':category,
      'locationText':locationText.trim(),
      'contactPreference':contactPreference,
      'occurredAt': ?occurredAt,
    })));

  Future<CampusLostFoundItem> updateLostFoundItem(
    String id,Json changes,
  ) async => CampusLostFoundItem.fromJson(asJson(await _request(
    '/lost-found-items/${Uri.encodeComponent(id)}',method:'PATCH',body:changes)));


  /// Authenticated campus society directory; permissions remain enforced by Express.
  Future<List<CampusSociety>> getSocieties({String query = ''}) async {
    final params = Uri(queryParameters: {
      'limit': '100',
      if (query.trim().isNotEmpty) 'q': query.trim(),
    }).query;
    return asJsonList(await _request('/societies?$params'))
        .map(CampusSociety.fromJson).toList(growable: false);
  }

  Future<List<CampusSocietyMembership>> getMySocietyMemberships() async =>
    asJsonList(await _request('/me/society-memberships?limit=100&includeSociety=1'))
      .map(CampusSocietyMembership.fromJson).toList(growable:false);

  Future<CampusSocietyMembership> requestSocietyMembership(String societyId) async =>
    CampusSocietyMembership.fromJson(asJson(await _request(
      '/societies/${Uri.encodeComponent(societyId)}/membership-requests',
      method:'POST',body:<String,dynamic>{},
    )));

  Future<CampusSocietyMembership> withdrawSocietyMembership(String membershipId) async =>
    CampusSocietyMembership.fromJson(asJson(await _request(
      '/me/society-memberships/${Uri.encodeComponent(membershipId)}/withdraw',
      method:'POST',body:<String,dynamic>{},
    )));


  /// Loads a bounded inbox page only on demand, not during dashboard startup.
  Future<CampusNotificationPage> getNotificationPage({
    String? cursor,int limit=20,
  }) async {
    if(limit<1||limit>40){
      throw const CampusApiException('INVALID_LIMIT','Notification limit must be 1-40.');
    }
    final query=Uri(queryParameters:{
      'limit':'$limit',if(cursor!=null&&cursor.isNotEmpty)'cursor':cursor,
    }).query;
    return CampusNotificationPage.fromJson(asJson(
      await _request('/notifications?$query')));
  }

  Future<DateTime> markNotificationRead(CampusNotification item) async {
    final result=asJson(await _request(
      '/notifications/${Uri.encodeComponent(item.kind)}/${Uri.encodeComponent(item.id)}/read',
      method:'POST',body:<String,dynamic>{}));
    return parseDate(result['readAt'])??DateTime.now();
  }

  Future<bool> hasRegisteredPushDevice() async {
    final status=asJson(await _request('/notifications/push-status'));
    return status['enabled']==true;
  }

  Future<void> registerPushDevice(String fid) async {
    await _request('/notifications/push-devices',method:'POST',
      body:{'fid':fid,'consent':true});
  }

  Future<void> revokePushDevice(String fid) async {
    await _request('/notifications/push-devices/revoke',method:'POST',
      body:{'fid':fid});
  }

  void dispose() => client.close();
}
