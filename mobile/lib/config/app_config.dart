class AppConfig {
  static const String universityDomain = String.fromEnvironment(
    'UNIVERSITY_EMAIL_DOMAIN',
    defaultValue: 'cuiatd.edu.pk',
  );

  // 10.0.2.2 is the host machine from inside the standard Android emulator.
  // A physical device needs a reachable HTTPS backend or your computer's LAN IP.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );

  static bool isCampusEmail(String value) {
    final normalized = value.trim().toLowerCase();
    final domain = universityDomain.trim().toLowerCase();
    if (domain.isEmpty || normalized.contains(' ') || normalized.contains('\n')) {
      return false;
    }
    final at = normalized.indexOf('@');
    return at > 0 && normalized.substring(at + 1) == domain &&
        normalized.indexOf('@', at + 1) == -1;
  }
}
