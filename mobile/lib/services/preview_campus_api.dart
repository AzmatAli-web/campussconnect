import 'dart:typed_data';

import '../models/campus_models.dart';
import 'campus_api.dart';

/// Completely local preview data. No Firebase initialization, MongoDB writes,
/// or HTTP requests are made from this client.
class PreviewCampusApi extends CampusApi {
  final List<CampusRegistration> _registrations = [];
  final List<CampusEvent> _seedEvents = [
    CampusEvent.fromJson({
      'id': 'preview-dev-meetup',
      'title': 'Campus Developer Meetup',
      'description': 'A sample event to demonstrate the student registration flow. No real seat is reserved.',
      'venue': 'CS Auditorium (demo)',
      'capacity': 3,
      'confirmedCount': 1,
      'registrationOpen': true,
      'isFull': false,
      'startsAt': DateTime.now().add(const Duration(days: 5)).toUtc().toIso8601String(),
      'endsAt': DateTime.now().add(const Duration(days: 5, hours: 2)).toUtc().toIso8601String(),
    }),
    CampusEvent.fromJson({
      'id': 'preview-workshop',
      'title': 'AI & Robotics Workshop',
      'description': 'Explore campus learning events in a fully offline demonstration.',
      'venue': 'Innovation Lab (demo)',
      'capacity': 25,
      'confirmedCount': 8,
      'registrationOpen': true,
      'isFull': false,
      'startsAt': DateTime.now().add(const Duration(days: 10)).toUtc().toIso8601String(),
      'endsAt': DateTime.now().add(const Duration(days: 10, hours: 3)).toUtc().toIso8601String(),
    }),
  ];
  PreviewCampusApi() : super(idTokenProvider: () async => '');

  @override
  Future<List<CampusEvent>> getEvents() async => _seedEvents.map((event) {
    final added = _registrations.where((r) => r.eventId == event.id).length;
    final occupied = event.confirmedCount + added;
    return CampusEvent(
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      capacity: event.capacity,
      confirmedCount: occupied,
      registrationOpen: occupied < event.capacity && event.registrationOpen,
      isFull: occupied >= event.capacity,
    );
  }).toList(growable: false);

  @override
  Future<List<CampusRegistration>> getMyRegistrations() async =>
      List.unmodifiable(_registrations);

  @override
  Future<List<CampusAnnouncement>> getAnnouncements() async => [
        CampusAnnouncement.fromJson({
          'id': 'preview-announcement-1',
          'title': 'Welcome to the CampusConnect Preview',
          'body': 'This APK is a UI demonstration. All event and registration data is fictional and stays on this device.',
          'scope': 'university',
          'publishedAt': DateTime.now().toUtc().toIso8601String(),
        }),
        CampusAnnouncement.fromJson({
          'id': 'preview-announcement-2',
          'title': 'Developer Community Session',
          'body': 'The real CampusConnect app will connect through verified university accounts once Firebase Android and a reachable backend are configured.',
          'scope': 'university',
          'publishedAt': DateTime.now().toUtc().toIso8601String(),
        }),
      ];


  @override
  Future<List<CampusTimetableGroup>> getTimetableGroups() async => [
    const CampusTimetableGroup(
      term: 'Fall 2026 (Demo)', program: 'BSE', semester: 7, section: 'A'),
  ];

  @override
  Future<List<CampusTimetableSlot>> getTimetableSlots(
      CampusTimetableGroup group) async => [
    const CampusTimetableSlot(
      id: 'demo-slot-1', dayOfWeek: 1, startTime: '08:00',
      endTime: '09:30', courseCode: 'CSC494',
      courseTitle: 'Software Project Management',
      instructorName: 'Sample Lecturer', room: 'Demo Room 201'),
    const CampusTimetableSlot(
      id: 'demo-slot-2', dayOfWeek: 2, startTime: '10:00',
      endTime: '11:30', courseCode: 'CSC412',
      courseTitle: 'Advanced Programming',
      instructorName: 'Sample Lecturer', room: 'Demo Lab'),
  ];

  @override
  Future<List<CampusAcademicResource>> getAcademicResources({
    String? program, int? semester, String? courseCode,
  }) async {
    const demo=CampusAcademicResource(
      id: 'offline-demo-resource',
      title: 'Introduction to Software Engineering',
      description: 'Fictional notes displayed for offline preview only.',
      program: 'BSE', semester: 7, courseCode: 'CSC494',
      fileName: 'demo-notes.pdf', sizeBytes: 128000,
      status: 'published', createdAt: null,
    );
    if(program != null && program.trim().isNotEmpty &&
        program.trim().toUpperCase()!=demo.program) {
      return [];
    }
    if(semester != null && semester!=demo.semester) {
      return [];
    }
    if(courseCode != null && courseCode.trim().isNotEmpty &&
        courseCode.trim().toUpperCase()!=demo.courseCode) {
      return [];
    }
    return [demo];
  }

  @override
  Future<Uint8List> downloadAcademicPdf(CampusAcademicResource resource) async {
    throw const CampusApiException('OFFLINE_PREVIEW',
      'Offline demo has no PDF download.');
  }


  final List<CampusComplaint> _demoComplaints=[];

  @override
  Future<List<CampusComplaint>> getMyComplaints() async =>
      List.unmodifiable(_demoComplaints);

  @override
  Future<CampusComplaint> submitComplaint({
    required String category, required String title,
    required String description,
  }) async {
    final item=CampusComplaint(
      id:'preview-complaint-${_demoComplaints.length+1}',
      category:category,title:title.trim(),description:description.trim(),
      status:'submitted',staffResponse:'',createdAt:DateTime.now(),
    );
    _demoComplaints.insert(0,item);
    return item;
  }


  @override
  Future<List<CampusFeeInvoice>> getMyFees() async => [
    const CampusFeeInvoice(
      id:'offline-demo-fee',invoiceNo:'DEMO-2026-001',
      title:'Sample semester fee (not a real invoice)',
      term:'Fall 2026',dueDate:'2027-01-15',currency:'PKR',
      amountPkr:18000,paidPkr:5000,outstandingPkr:13000,
      status:'partially_recorded',overdue:false,
    ),
  ];
  @override
  Future<List<CampusFeePayment>> getMyFeePayments(
      CampusFeeInvoice invoice) async => [
    const CampusFeePayment(
      id:'demo-receipt',invoiceId:'offline-demo-fee',amountPkr:5000,
      receiptRef:'DEMO-RECEIPT-ONLY',recordedAt:null,
    ),
  ];

  @override
  Future<CampusRegistration> registerForEvent(
    CampusEvent event,
    CampusProfile profile,
  ) async {
    if (!profile.canRegister) {
      throw const CampusApiException('FORBIDDEN', 'Only active Students can register.');
    }
    if (_registrations.any((r) => r.eventId == event.id)) {
      throw const CampusApiException('ALREADY_REGISTERED', 'Already registered in this demo.');
    }
    final currentEvent = (await getEvents()).where((e) => e.id == event.id);
    if (currentEvent.isEmpty || !currentEvent.first.registrationOpen ||
        currentEvent.first.isFull) {
      throw const CampusApiException(
        'REGISTRATION_UNAVAILABLE', 'This demo event is full or closed.');
    }
    final registration = CampusRegistration(
      id: 'preview-registration-${_registrations.length + 1}',
      eventId: event.id,
      confirmedAt: DateTime.now(),
      status: 'confirmed',
    );
    _registrations.add(registration);
    return registration;
  }

  final List<CampusMarketplaceItem> _demoMarketplace=[
    const CampusMarketplaceItem(
      id:'preview-item-1',title:'Sample second-hand textbook',
      description:'Fictional textbook listing for the offline CampusConnect Marketplace demo.',
      category:'books',condition:'good',pricePkr:1200,
      status:'published',hasImage:false,contactAvailable:false,createdAt:null,
    ),
  ];
  final List<String> _ownMarketplaceIds=[];

  @override
  Future<List<CampusMarketplaceItem>> getMarketplace({
    String? query,String? category,
  }) async => _demoMarketplace.where((item)=>
    item.status=='published' &&
    (category==null||category.isEmpty||item.category==category) &&
    (query==null||query.trim().isEmpty||
      item.title.toLowerCase().contains(query.trim().toLowerCase())||
      item.description.toLowerCase().contains(query.trim().toLowerCase()))
  ).toList(growable:false);

  @override
  Future<List<CampusMarketplaceItem>> getMyMarketplace() async =>
    _demoMarketplace.where((item)=>_ownMarketplaceIds.contains(item.id))
      .toList(growable:false);

  @override
  Future<CampusMarketplaceItem> createMarketplaceItem({
    required String title,required String description,
    required String category,required String condition,
    required int pricePkr,required bool contactConsent,
  }) async {
    final item=CampusMarketplaceItem(
      id:'preview-market-${_demoMarketplace.length+1}',title:title,
      description:description,category:category,condition:condition,
      pricePkr:pricePkr,status:'published',hasImage:false,
      contactAvailable:contactConsent,createdAt:DateTime.now(),
    );
    _demoMarketplace.insert(0,item);
    _ownMarketplaceIds.add(item.id);
    return item;
  }
  @override
  Future<CampusMarketplaceItem> updateMarketplaceItem(
    String id,Json body,
  ) async {
    if(!_ownMarketplaceIds.contains(id)) {
      throw const CampusApiException('FORBIDDEN','Not your demo listing.');
    }
    final i=_demoMarketplace.indexWhere((item)=>item.id==id);
    if(i<0||_demoMarketplace[i].status!='published') {
      throw const CampusApiException('NOT_FOUND','Demo listing unavailable.');
    }
    final old=_demoMarketplace[i];
    final updated=CampusMarketplaceItem(
      id:old.id,title:body['title'] as String? ?? old.title,
      description:body['description'] as String? ?? old.description,
      category:body['category'] as String? ?? old.category,
      condition:body['condition'] as String? ?? old.condition,
      pricePkr:body['pricePkr'] as int? ?? old.pricePkr,
      status:old.status,hasImage:false,
      contactAvailable:body['contactConsent'] as bool? ?? old.contactAvailable,
      createdAt:old.createdAt,
    );
    _demoMarketplace[i]=updated;
    return updated;
  }
  @override
  Future<CampusMarketplaceItem> setMarketplaceStatus(String id,String status) async {
    if(!_ownMarketplaceIds.contains(id)||!['sold','archived'].contains(status)){
      throw const CampusApiException('FORBIDDEN','Invalid demo listing update.');
    }
    final i=_demoMarketplace.indexWhere((item)=>item.id==id);
    if(i<0)throw const CampusApiException('NOT_FOUND','Demo listing unavailable.');
    final old=_demoMarketplace[i];
    final updated=CampusMarketplaceItem(
      id:old.id,title:old.title,description:old.description,category:old.category,
      condition:old.condition,pricePkr:old.pricePkr,status:status,
      hasImage:false,contactAvailable:old.contactAvailable,createdAt:old.createdAt,
    );
    _demoMarketplace[i]=updated;
    return updated;
  }
  @override
  Future<String> getMarketplaceContact(String id) async {
    throw const CampusApiException('OFFLINE_PREVIEW',
      'Fictional listings do not have real seller contacts.');
  }
  @override
  Future<void> reportMarketplaceItem(
    String id,{required String reason,String detail='',
  }) async {
    // Preview intentionally does not send a real report.
  }
  @override
  Future<Uint8List> downloadMarketplacePhoto(String id) async {
    throw const CampusApiException('OFFLINE_PREVIEW','No photo in offline preview.');
  }
  @override
  Future<void> uploadMarketplacePhoto(
    String id,Uint8List bytes,String filename,
  ) async {
    throw const CampusApiException('OFFLINE_PREVIEW','No photo upload in preview.');
  }
}
