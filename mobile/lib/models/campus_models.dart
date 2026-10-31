typedef Json = Map<String, dynamic>;

Json asJson(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.map((key, item) => MapEntry(key.toString(), item));
  throw const FormatException('Expected a JSON object');
}

List<Json> asJsonList(dynamic value) {
  if (value is! List) throw const FormatException('Expected a JSON list');
  return value.map(asJson).toList(growable: false);
}

String stringField(Json data, String name, [String fallback = '']) =>
    data[name] is String ? data[name] as String : fallback;

DateTime? parseDate(dynamic raw) =>
    raw is String ? DateTime.tryParse(raw)?.toLocal() : null;

int numberField(Json json, String field) =>
    json[field] is num ? (json[field] as num).toInt() : 0;

class CampusProfile {
  final String id;
  final String name;
  final String email;
  final String? registrationNo;
  final String status;
  final List<String> roles;

  const CampusProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.registrationNo,
    required this.status,
    required this.roles,
  });

  factory CampusProfile.fromJson(Json data) => CampusProfile(
        id: stringField(data, '_id'),
        name: stringField(data, 'fullName'),
        email: stringField(data, 'emailNormalized'),
        registrationNo: data['registrationNo'] is String
            ? data['registrationNo'] as String
            : null,
        status: stringField(data, 'status'),
        roles: data['activeRoles'] is List
            ? (data['activeRoles'] as List).whereType<String>().toList()
            : const [],
      );

  bool get canRegister => status == 'active' && roles.contains('student');
}

class CampusEvent {
  final String id;
  final String title;
  final String description;
  final String venue;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int capacity;
  final int confirmedCount;
  final bool registrationOpen;
  final bool isFull;

  const CampusEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.venue,
    required this.startsAt,
    required this.endsAt,
    required this.capacity,
    required this.confirmedCount,
    required this.registrationOpen,
    required this.isFull,
  });

  factory CampusEvent.fromJson(Json data) => CampusEvent(
        id: stringField(data, 'id'),
        title: stringField(data, 'title'),
        description: stringField(data, 'description'),
        venue: stringField(data, 'venue'),
        startsAt: parseDate(data['startsAt']),
        endsAt: parseDate(data['endsAt']),
        capacity: numberField(data, 'capacity'),
        confirmedCount: numberField(data, 'confirmedCount'),
        registrationOpen: data['registrationOpen'] == true,
        isFull: data['isFull'] == true ||
            numberField(data, 'confirmedCount') >= numberField(data, 'capacity'),
      );

  int get seatsRemaining => (capacity - confirmedCount).clamp(0, 1000000).toInt();
}

class CampusRegistration {
  final String id;
  final String eventId;
  final DateTime? confirmedAt;
  final String status;

  const CampusRegistration({
    required this.id,
    required this.eventId,
    required this.confirmedAt,
    required this.status,
  });

  factory CampusRegistration.fromJson(Json data) => CampusRegistration(
        id: stringField(data, 'id'),
        eventId: stringField(data, 'eventId'),
        confirmedAt: parseDate(data['confirmedAt']),
        status: stringField(data, 'status'),
      );
}

class CampusAnnouncement {
  final String id;
  final String title;
  final String body;
  final String scope;
  final DateTime? publishedAt;

  const CampusAnnouncement({
    required this.id,
    required this.title,
    required this.body,
    required this.scope,
    required this.publishedAt,
  });

  factory CampusAnnouncement.fromJson(Json data) => CampusAnnouncement(
        id: stringField(data, 'id'),
        title: stringField(data, 'title'),
        body: stringField(data, 'body'),
        scope: stringField(data, 'scope'),
        publishedAt: parseDate(data['publishedAt']),
      );
}

/// Only a confirmation for THIS signed-in student is evidence of registration.
/// The public event's confirmedCount MUST NEVER be used to infer student identity.
bool studentIsRegistered(
  String eventId,
  Iterable<CampusRegistration> myRegistrations,
) => myRegistrations.any(
  (registration) => registration.eventId == eventId &&
      registration.status == 'confirmed',
);
