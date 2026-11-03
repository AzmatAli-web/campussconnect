import 'campus_api.dart';
import '../models/campus_models.dart';

class CampusDiagnosticCheck {
  final String label;
  final bool passed;
  final String detail;

  const CampusDiagnosticCheck(this.label, this.passed, this.detail);
}

/// Runs read-only connectivity checks. Does not return student identifiers,
/// session tokens or individual registration records to the UI.
Future<List<CampusDiagnosticCheck>> runCampusDiagnostics(
  CampusApi api,
  CampusProfile expectedProfile,
) async {
  final checks = <CampusDiagnosticCheck>[];

  try {
    final health = await api.getReadiness();
    checks.add(CampusDiagnosticCheck(
      'Express + MongoDB readiness',
      health.ready,
      health.ready
          ? 'Backend, university setup and database are ready.'
          : 'Backend is reachable but not ready. Check backend logs.',
    ));
  } catch (error) {
    checks.add(CampusDiagnosticCheck(
      'Express + MongoDB readiness',
      false,
      _safeError(error),
    ));
  }

  try {
    // Authenticated endpoint: requires the current Firebase ID token.
    final actual = await api.getProfile();
    final matches = actual.id.isNotEmpty &&
        actual.id == expectedProfile.id &&
        actual.email.trim().toLowerCase() ==
            expectedProfile.email.trim().toLowerCase();
    checks.add(CampusDiagnosticCheck(
      'Firebase + student profile',
      matches,
      matches
          ? 'Authenticated and matched to your own MongoDB profile.'
          : 'Authenticated profile does not match this session. Sign out and report this.',
    ));
  } catch (error) {
    checks.add(CampusDiagnosticCheck(
      'Firebase + student profile',
      false,
      _safeError(error),
    ));
  }

  if (expectedProfile.canRegister) {
    try {
      final ownRegistrations = await api.getMyRegistrations();
      checks.add(CampusDiagnosticCheck(
        'Private My Registrations',
        true,
        'Authenticated private endpoint works. '
            '${ownRegistrations.length} personal record(s).',
      ));
    } catch (error) {
      checks.add(CampusDiagnosticCheck(
        'Private My Registrations',
        false,
        _safeError(error),
      ));
    }
  } else {
    checks.add(const CampusDiagnosticCheck(
      'Private My Registrations',
      false,
      'Current account does not have an active Student role.',
    ));
  }

  try {
    final events = await api.getEvents();
    checks.add(CampusDiagnosticCheck(
      'Campus events API',
      true,
      'Endpoint available: ${events.length} published event(s).',
    ));
  } catch (error) {
    checks.add(CampusDiagnosticCheck('Campus events API', false, _safeError(error)));
  }

  try {
    final announcements = await api.getAnnouncements();
    checks.add(CampusDiagnosticCheck(
      'Campus announcements API',
      true,
      'Endpoint available: ${announcements.length} visible notice(s).',
    ));
  } catch (error) {
    checks.add(CampusDiagnosticCheck(
      'Campus announcements API',
      false,
      _safeError(error),
    ));
  }

  return List.unmodifiable(checks);
}

String _safeError(Object error) {
  if (error is CampusApiException) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
      case 'UNAUTHORIZED':
      case 'INVALID_TOKEN':
        return 'Firebase session was not accepted. Sign in again.';
      case 'NETWORK_TIMEOUT':
      case 'NETWORK_FAILURE':
        return 'Cannot reach the local API. Check USB forwarding and backend.';
      case 'SERVICE_NOT_READY':
        return 'Backend database or university setup is unavailable.';
      case 'FORBIDDEN':
        return 'This account does not have access to the endpoint.';
      default:
        // Only display server-generated error code, not raw response or tokens.
        return 'Request failed (${error.code}). Check backend console.';
    }
  }
  return 'Unexpected error. See the debug console for diagnostics.';
}
