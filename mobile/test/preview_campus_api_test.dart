import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const demo = CampusProfile(
    id: 'demo', name: 'Demo Student', email: 'preview@example.test',
    registrationNo: null, status: 'active', roles: ['student'],
  );

  test('preview data is offline and does not expose any attendee names', () async {
    final api = PreviewCampusApi();
    final events = await api.getEvents();
    expect(events, isNotEmpty);
    expect(events.first.confirmedCount, 1);
    expect(studentIsRegistered(events.first.id, await api.getMyRegistrations()),
      isFalse);
    final notices = await api.getAnnouncements();
    expect(notices, isNotEmpty);
    expect(notices.first.body, contains('fictional'));
    api.dispose();
  });

  test('preview registration affects only current demo student', () async {
    final api = PreviewCampusApi();
    final event = (await api.getEvents()).first;
    final confirmed = await api.registerForEvent(event, demo);
    expect(confirmed.eventId, event.id);
    expect(studentIsRegistered(event.id, await api.getMyRegistrations()), isTrue);
    expect((await api.getEvents()).first.confirmedCount, 2);
    await expectLater(api.registerForEvent(event, demo),
      throwsA(isA<CampusApiException>()));
    api.dispose();
  });
}
