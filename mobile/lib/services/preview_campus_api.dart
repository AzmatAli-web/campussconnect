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
}
