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

class CampusTimetableGroup {
  final String term;
  final String program;
  final int semester;
  final String section;
  const CampusTimetableGroup({
    required this.term, required this.program,
    required this.semester, required this.section,
  });
  factory CampusTimetableGroup.fromJson(Json json) => CampusTimetableGroup(
    term: stringField(json, 'term'),
    program: stringField(json, 'program'),
    semester: numberField(json, 'semester'),
    section: stringField(json, 'section'),
  );
  String get key => '$term|$program|$semester|$section';
  String get label => '$term · $program · Sem $semester · $section';
}

class CampusTimetableSlot {
  final String id;
  final int dayOfWeek;
  final String startTime;
  final String endTime;
  final String courseCode;
  final String courseTitle;
  final String instructorName;
  final String room;
  const CampusTimetableSlot({
    required this.id, required this.dayOfWeek,
    required this.startTime, required this.endTime,
    required this.courseCode, required this.courseTitle,
    required this.instructorName, required this.room,
  });
  factory CampusTimetableSlot.fromJson(Json json) => CampusTimetableSlot(
    id: stringField(json, 'id'),
    dayOfWeek: numberField(json, 'dayOfWeek'),
    startTime: stringField(json, 'startTime'),
    endTime: stringField(json, 'endTime'),
    courseCode: stringField(json, 'courseCode'),
    courseTitle: stringField(json, 'courseTitle'),
    instructorName: stringField(json, 'instructorName'),
    room: stringField(json, 'room'),
  );
}

class CampusAcademicResource {
  final String id;
  final String title;
  final String description;
  final String program;
  final int semester;
  final String courseCode;
  final String fileName;
  final int sizeBytes;
  final String status;
  final DateTime? createdAt;

  const CampusAcademicResource({
    required this.id, required this.title, required this.description,
    required this.program, required this.semester, required this.courseCode,
    required this.fileName, required this.sizeBytes, required this.status,
    required this.createdAt,
  });

  factory CampusAcademicResource.fromJson(Json data) => CampusAcademicResource(
    id: stringField(data, 'id'),
    title: stringField(data, 'title'),
    description: stringField(data, 'description'),
    program: stringField(data, 'program'),
    semester: numberField(data, 'semester'),
    courseCode: stringField(data, 'courseCode'),
    fileName: stringField(data, 'fileName'),
    sizeBytes: numberField(data, 'sizeBytes'),
    status: stringField(data, 'status'),
    createdAt: parseDate(data['createdAt']),
  );
}

class CampusComplaint {
  final String id;
  final String category;
  final String title;
  final String description;
  final String status;
  final String staffResponse;
  final DateTime? createdAt;

  const CampusComplaint({
    required this.id, required this.category, required this.title,
    required this.description, required this.status,
    required this.staffResponse, required this.createdAt,
  });
  factory CampusComplaint.fromJson(Json json)=>CampusComplaint(
    id:stringField(json,'id'),category:stringField(json,'category'),
    title:stringField(json,'title'),description:stringField(json,'description'),
    status:stringField(json,'status'),
    staffResponse:stringField(json,'staffResponse'),
    createdAt:parseDate(json['createdAt']),
  );
}

class CampusFeeInvoice {
  final String id;
  final String invoiceNo;
  final String title;
  final String term;
  final String dueDate;
  final String currency;
  final int amountPkr;
  final int paidPkr;
  final int outstandingPkr;
  final String status;
  final bool overdue;
  const CampusFeeInvoice({
    required this.id,required this.invoiceNo,required this.title,
    required this.term,required this.dueDate,required this.currency,
    required this.amountPkr,required this.paidPkr,required this.outstandingPkr,
    required this.status,required this.overdue,
  });
  factory CampusFeeInvoice.fromJson(Json data)=>CampusFeeInvoice(
    id:stringField(data,'id'),
    invoiceNo:stringField(data,'invoiceNo'),
    title:stringField(data,'title'),
    term:stringField(data,'term'),
    dueDate:stringField(data,'dueDate'),
    currency:stringField(data,'currency','PKR'),
    amountPkr:numberField(data,'amountPkr'),
    paidPkr:numberField(data,'paidPkr'),
    outstandingPkr:numberField(data,'outstandingPkr'),
    status:stringField(data,'status'),
    overdue:data['overdue']==true,
  );
}
class CampusFeePayment {
  final String id;
  final String invoiceId;
  final int amountPkr;
  final String receiptRef;
  final DateTime? recordedAt;
  const CampusFeePayment({
    required this.id,required this.invoiceId,required this.amountPkr,
    required this.receiptRef,required this.recordedAt,
  });
  factory CampusFeePayment.fromJson(Json json)=>CampusFeePayment(
    id:stringField(json,'id'),invoiceId:stringField(json,'invoiceId'),
    amountPkr:numberField(json,'amountPkr'),
    receiptRef:stringField(json,'receiptRef'),
    recordedAt:parseDate(json['recordedAt']),
  );
}


class CampusMarketplaceItem {
  final String id;
  final String title;
  final String description;
  final String category;
  final String condition;
  final int pricePkr;
  final String status;
  final bool hasImage;
  final bool contactAvailable;
  final DateTime? createdAt;

  const CampusMarketplaceItem({
    required this.id,required this.title,required this.description,
    required this.category,required this.condition,required this.pricePkr,
    required this.status,required this.hasImage,required this.contactAvailable,
    required this.createdAt,
  });
  factory CampusMarketplaceItem.fromJson(Json data) => CampusMarketplaceItem(
    id:stringField(data,'id'),title:stringField(data,'title'),
    description:stringField(data,'description'),category:stringField(data,'category'),
    condition:stringField(data,'condition'),pricePkr:numberField(data,'pricePkr'),
    status:stringField(data,'status'),hasImage:data['hasImage']==true,
    contactAvailable:data['contactAvailable']==true,createdAt:parseDate(data['createdAt']),
  );
}


class CampusLostFoundItem {
  final String id;
  final String kind;
  final String title;
  final String description;
  final String category;
  final String locationText;
  final DateTime? occurredAt;
  final String contactPreference;
  final String status;
  final DateTime? createdAt;

  const CampusLostFoundItem({
    required this.id, required this.kind, required this.title,
    required this.description, required this.category,
    required this.locationText, required this.occurredAt,
    required this.contactPreference, required this.status,
    required this.createdAt,
  });
  factory CampusLostFoundItem.fromJson(Json data) => CampusLostFoundItem(
    id:stringField(data,'id'),kind:stringField(data,'kind'),
    title:stringField(data,'title'),description:stringField(data,'description'),
    category:stringField(data,'category'),
    locationText:stringField(data,'locationText'),
    occurredAt:parseDate(data['occurredAt']),
    contactPreference:stringField(data,'contactPreference','helpdesk'),
    status:stringField(data,'status'),
    createdAt:parseDate(data['createdAt']),
  );
}


class CampusSociety {
  final String id;
  final String name;
  final String slug;
  final String description;
  final String status;
  const CampusSociety({
    required this.id,required this.name,required this.slug,
    required this.description,required this.status,
  });
  factory CampusSociety.fromJson(Json data)=>CampusSociety(
    id:stringField(data,'id'),
    name:stringField(data,'name'),
    slug:stringField(data,'slug'),
    description:stringField(data,'description'),
    status:stringField(data,'status'),
  );
}

class CampusSocietyMembership {
  final String id;
  final String societyId;
  final String status;
  final DateTime? requestedAt;
  final DateTime? reviewedAt;
  final String reviewNote;
  const CampusSocietyMembership({
    required this.id,required this.societyId,required this.status,
    required this.requestedAt,required this.reviewedAt,
    required this.reviewNote,
  });
  factory CampusSocietyMembership.fromJson(Json data)=>CampusSocietyMembership(
    id:stringField(data,'id'),
    societyId:stringField(data,'societyId'),
    status:stringField(data,'status'),
    requestedAt:parseDate(data['requestedAt']),
    reviewedAt:parseDate(data['reviewedAt']),
    reviewNote:stringField(data,'reviewNote'),
  );
}


class CampusNotification {
  final String id;
  final String kind;
  final String type;
  final String title;
  final String body;
  final String sourceId;
  final DateTime? createdAt;
  final DateTime? readAt;

  const CampusNotification({
    required this.id,required this.kind,required this.type,
    required this.title,required this.body,required this.sourceId,
    required this.createdAt,required this.readAt,
  });
  factory CampusNotification.fromJson(Json value)=>CampusNotification(
    id:stringField(value,'id'),kind:stringField(value,'kind'),
    type:stringField(value,'type'),title:stringField(value,'title'),
    body:stringField(value,'body'),sourceId:stringField(value,'sourceId'),
    createdAt:parseDate(value['createdAt']),
    readAt:parseDate(value['readAt']),
  );
  CampusNotification markRead(DateTime when)=>CampusNotification(
    id:id,kind:kind,type:type,title:title,body:body,sourceId:sourceId,
    createdAt:createdAt,readAt:when,
  );
}

class CampusNotificationPage {
  final List<CampusNotification> items;
  final String? nextCursor;
  final bool hasMore;
  final int unreadOnPage;
  const CampusNotificationPage({
    required this.items,required this.nextCursor,
    required this.hasMore,required this.unreadOnPage,
  });
  factory CampusNotificationPage.fromJson(Json data)=>CampusNotificationPage(
    items:asJsonList(data['items']).map(CampusNotification.fromJson)
      .toList(growable:false),
    nextCursor:data['nextCursor'] is String?data['nextCursor'] as String:null,
    hasMore:data['hasMore']==true,
    unreadOnPage:numberField(data,'unreadOnPage'),
  );
}
