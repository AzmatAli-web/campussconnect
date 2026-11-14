import 'package:campusconnect_mobile/config/app_config.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('University identity', () {
    test('requires the exact approved email domain', () {
      expect(AppConfig.isCampusEmail('fa23-bse-024@cuiatd.edu.pk'), isTrue);
      expect(AppConfig.isCampusEmail(' FA23-BSE-024@CUIATD.EDU.PK '), isTrue);
      expect(AppConfig.isCampusEmail('student@evilcuiatd.edu.pk'), isFalse);
      expect(AppConfig.isCampusEmail('student@gmail.com'), isFalse);
      expect(AppConfig.isCampusEmail('student@cuiatd.edu.pk.evil.com'), isFalse);
      expect(AppConfig.isCampusEmail('student@@cuiatd.edu.pk'), isFalse);
    });
  });

  group('Public event privacy', () {
    test('aggregates never establish the signed-in student identity', () {
      final event = CampusEvent.fromJson({
        'id': 'event-1',
        'title': 'Workshop',
        'capacity': 3,
        'confirmedCount': 2,
        'registrationOpen': true,
      });
      expect(event.confirmedCount, 2);
      expect(event.seatsRemaining, 1);
      expect(studentIsRegistered(event.id, []), isFalse);
      expect(studentIsRegistered(event.id, [
        const CampusRegistration(
          id: 'r1', eventId: 'other', confirmedAt: null, status: 'confirmed'),
      ]), isFalse);
    });

    test('only a personal confirmed registration changes own status', () {
      final personal = CampusRegistration.fromJson({
        'id': 'mine',
        'eventId': 'event-1',
        'status': 'confirmed',
        'confirmedAt': '2026-11-01T10:00:00Z',
      });
      expect(studentIsRegistered('event-1', [personal]), isTrue);
      expect(studentIsRegistered('event-2', [personal]), isFalse);
      expect(personal.confirmedAt, isNotNull);
    });

    test('server event payload never becomes a student roster model', () {
      final event = CampusEvent.fromJson({
        'id': 'event-3',
        'title': 'Event',
        'capacity': 3,
        'confirmedCount': 3,
        'isFull': true,
        'studentNameSnapshot': 'Should not appear in this model',
        'universityEmailNormalized': 'student@cuiatd.edu.pk',
      });
      expect(event.isFull, isTrue);
      expect(event.seatsRemaining, 0);
      expect(event.title, 'Event');
    });
  });
}
