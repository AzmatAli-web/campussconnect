import 'dart:async';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/dashboard_feeds.dart';
import 'package:flutter_test/flutter_test.dart';

class _ControlledApi extends CampusApi {
  _ControlledApi() : super(idTokenProvider: () async => 'not-needed');
  final calls = <String>[];
  final events = Completer<List<CampusEvent>>();
  final registrations = Completer<List<CampusRegistration>>();
  final announcements = Completer<List<CampusAnnouncement>>();

  @override
  Future<List<CampusEvent>> getEvents() {
    calls.add('events');
    return events.future;
  }

  @override
  Future<List<CampusRegistration>> getMyRegistrations() {
    calls.add('registrations');
    return registrations.future;
  }

  @override
  Future<List<CampusAnnouncement>> getAnnouncements() {
    calls.add('announcements');
    return announcements.future;
  }
}

void main() {
  test('starts all three requests without awaiting one before the next', () async {
    final api = _ControlledApi();
    final future = loadDashboardFeeds(api, canRegister: true);
    expect(api.calls, ['events', 'registrations', 'announcements']);

    api.announcements.complete(<CampusAnnouncement>[]);
    api.events.complete(<CampusEvent>[]);
    api.registrations.complete(<CampusRegistration>[]);
    final data = await future;
    expect(data.events, isEmpty);
    expect(data.registrations, isEmpty);
    expect(data.announcements, isEmpty);
    expect(data.hasErrors, false);
    api.dispose();
  });

  test('keeps successful feeds when another endpoint fails', () async {
    final api = _ControlledApi();
    final future = loadDashboardFeeds(api, canRegister: true);
    api.events.completeError(StateError('temporary network problem'));
    api.registrations.complete(<CampusRegistration>[]);
    api.announcements.complete(<CampusAnnouncement>[]);
    final data = await future;

    expect(data.failures, ['Events unavailable']);
    expect(data.registrations, isEmpty);
    expect(data.announcements, isEmpty);
    api.dispose();
  });

  test('does not request student registration endpoint for non-student profile', () async {
    final api = _ControlledApi();
    final future = loadDashboardFeeds(api, canRegister: false);
    expect(api.calls, ['events', 'announcements']);
    api.events.complete(<CampusEvent>[]);
    api.announcements.complete(<CampusAnnouncement>[]);
    final data = await future;
    expect(data.registrations, isEmpty);
    expect(data.failures, isEmpty);
    api.dispose();
  });
}
