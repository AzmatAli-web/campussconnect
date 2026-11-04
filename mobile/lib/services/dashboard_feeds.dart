import '../models/campus_models.dart';
import 'campus_api.dart';

/// Loads the three independent student feeds concurrently. A slow or failing
/// feed does not prevent the other feed results from being shown.
class DashboardFeeds {
  final List<CampusEvent> events;
  final List<CampusRegistration> registrations;
  final List<CampusAnnouncement> announcements;
  final List<String> failures;

  const DashboardFeeds({
    required this.events,
    required this.registrations,
    required this.announcements,
    required this.failures,
  });

  bool get hasErrors => failures.isNotEmpty;
}

Future<DashboardFeeds> loadDashboardFeeds(
  CampusApi api, {
  required bool canRegister,
}) async {
  List<CampusEvent> events = const [];
  List<CampusRegistration> registrations = const [];
  List<CampusAnnouncement> announcements = const [];
  final failures = <String>[];

  await Future.wait<void>([
    () async {
      try {
        events = await api.getEvents();
      } catch (_) {
        failures.add('Events unavailable');
      }
    }(),
    if (canRegister)
      () async {
        try {
          registrations = await api.getMyRegistrations();
        } catch (_) {
          failures.add('Registrations unavailable');
        }
      }(),
    () async {
      try {
        announcements = await api.getAnnouncements();
      } catch (_) {
        failures.add('Announcements unavailable');
      }
    }(),
  ]);

  return DashboardFeeds(
    events: events,
    registrations: registrations,
    announcements: announcements,
    failures: failures,
  );
}
