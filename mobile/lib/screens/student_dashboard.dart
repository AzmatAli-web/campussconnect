import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _navy = Color(0xFF142A3F);
const _teal = Color(0xFF10AC99);
const _muted = Color(0xFF73889B);
const _line = Color(0xFFE1EAEE);

String _date(DateTime? date) {
  if (date == null) return 'Date to be announced';
  String two(int value) => value.toString().padLeft(2, '0');
  final hours = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final period = date.hour >= 12 ? 'PM' : 'AM';
  return '${two(date.day)}/${two(date.month)}/${date.year} · '
      '${two(hours)}:${two(date.minute)} $period';
}

class StudentDashboard extends StatefulWidget {
  final CampusApi api;
  final CampusProfile profile;
  const StudentDashboard({
    super.key,
    required this.api,
    required this.profile,
  });

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  int _tab = 0;
  bool _loading = true;
  String? _error;
  String? _busyEvent;
  List<CampusEvent> _events = const [];
  List<CampusRegistration> _registrations = const [];
  List<CampusAnnouncement> _announcements = const [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() { _loading = true; _error = null; });
    try {
      // No user directory or attendee-list endpoint is requested by students.
      final events = await widget.api.getEvents();
      final regs = widget.profile.canRegister
          ? await widget.api.getMyRegistrations()
          : <CampusRegistration>[];
      final announcements = await widget.api.getAnnouncements();
      if (!mounted) return;
      setState(() {
        _events = events;
        _registrations = regs;
        _announcements = announcements;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _register(CampusEvent event) async {
    if (_busyEvent != null) return;
    setState(() => _busyEvent = event.id);
    try {
      await widget.api.registerForEvent(event, widget.profile);
      if (!mounted) return;
      _snack('Registration confirmed. Your identity remains private.');
      await _reload();
    } catch (error) {
      if (!mounted) return;
      final message = error.toString();
      if (error is CampusApiException && error.statusCode == 409) {
        // May have succeeded in another request/device: re-read ONLY this
        // student's own registrations before telling them the outcome.
        await _reload();
      }
      if (mounted) _snack(message, error: true);
    } finally {
      if (mounted) setState(() => _busyEvent = null);
    }
  }

  void _snack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: error ? const Color(0xFF9C394B) : _navy,
      ));
  }

  void _selectTab(int value) => setState(() => _tab = value);

  @override
  Widget build(BuildContext context) {
    const pages = ['Overview', 'Campus events', 'My registrations', 'Announcements', 'My profile'];
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 37,
              height: 37,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(11),
                color: _teal,
              ),
              child: const Center(
                child: Text('C·', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
            ),
            const SizedBox(width: 10),
            const Text('CampusConnect',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh campus data',
            onPressed: _loading ? null : _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 7),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _Failure(message: _error!, retry: _reload)
              : RefreshIndicator(
                  onRefresh: _reload,
                  child: SafeArea(
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 750),
                        child: ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
                          children: [
                            _topBlock(pages[_tab]),
                            const SizedBox(height: 22),
                            switch (_tab) {
                              0 => _overview(),
                              1 => _eventList(),
                              2 => _myRegistrations(),
                              3 => _announcementList(),
                              _ => _profilePage(),
                            },
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        onDestinationSelected: _selectTab,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.event_outlined), selectedIcon: Icon(Icons.event), label: 'Events'),
          NavigationDestination(icon: Icon(Icons.verified_outlined), selectedIcon: Icon(Icons.verified), label: 'Mine'),
          NavigationDestination(icon: Icon(Icons.campaign_outlined), selectedIcon: Icon(Icons.campaign), label: 'Notices'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  Widget _topBlock(String title) => Container(
        padding: const EdgeInsets.all(23),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF18384D), Color(0xFF0A7780)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('COMSATS ABBOTTABAD / STUDENT',
                style: TextStyle(color: Colors.teal.shade50, fontSize: 10, letterSpacing: 1.7, fontWeight: FontWeight.w800)),
            const SizedBox(height: 13),
            Text(title,
                style: const TextStyle(color: Colors.white, fontSize: 27, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            const Text('Campus information, with student privacy built in.',
                style: TextStyle(color: Color(0xFFCCEDE8), fontSize: 12)),
          ],
        ),
      );

  Widget _overview() {
    final upcoming = _events.where((e) =>
      e.startsAt == null || e.startsAt!.isAfter(DateTime.now())).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Hello, ${widget.profile.name.split(' ').first} 👋',
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800, color: _navy)),
        const SizedBox(height: 4),
        const Text('Your campus at a glance', style: TextStyle(color: _muted)),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: _Metric(label: 'Upcoming events', value: upcoming.length.toString(), icon: Icons.event_note)),
            const SizedBox(width: 12),
            Expanded(child: _Metric(label: 'My registrations', value: _registrations.length.toString(), icon: Icons.verified_user_outlined)),
          ],
        ),
        const SizedBox(height: 22),
        _SectionHeader(
          title: 'Upcoming events',
          trailing: TextButton(onPressed: () => _selectTab(1), child: const Text('View all →')),
        ),
        const SizedBox(height: 10),
        if (upcoming.isEmpty)
          const _EmptyView(title: 'No events published yet', detail: 'Verified Faculty and Society Managers will publish campus events here.')
        else
          ...upcoming.take(3).map(_eventCard),
        const SizedBox(height: 19),
        _SectionHeader(
          title: 'Latest announcements',
          trailing: TextButton(onPressed: () => _selectTab(3), child: const Text('View all →')),
        ),
        const SizedBox(height: 10),
        if (_announcements.isEmpty)
          const _EmptyView(title: 'No announcements yet', detail: 'Official campus updates will appear here.')
        else
          ..._announcements.take(2).map(_announcementCard),
      ],
    );
  }

  Widget _eventList() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionHeader(title: 'Published events'),
          const Padding(
            padding: EdgeInsets.only(top: 5, bottom: 18),
            child: Text('Everyone can see seat totals. Names of attendees stay private.',
                style: TextStyle(color: _muted, fontSize: 12)),
          ),
          if (_events.isEmpty)
            const _EmptyView(title: 'No events yet', detail: 'Organizers have not published an event.')
          else
            ..._events.map(_eventCard),
        ],
      );

  Widget _eventCard(CampusEvent event) {
    final registered = studentIsRegistered(event.id, _registrations);
    final canRegister = widget.profile.canRegister &&
        !registered && event.registrationOpen && !event.isFull;
    final progress = event.capacity <= 0
        ? 0.0
        : (event.confirmedCount / event.capacity).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 13),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(19),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(_date(event.startsAt),
                      style: const TextStyle(color: _teal, fontSize: 11, fontWeight: FontWeight.w800))),
                  _StatusTag(
                    title: registered ? 'Confirmed' : event.isFull ? 'Full' : event.registrationOpen ? 'Open' : 'Closed',
                    positive: registered || (!event.isFull && event.registrationOpen),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(event.title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _navy)),
              const SizedBox(height: 7),
              Text(event.description,
                  style: const TextStyle(color: _muted, fontSize: 12, height: 1.5)),
              const SizedBox(height: 13),
              Text('📍 ${event.venue}', style: const TextStyle(color: _muted, fontSize: 12)),
              const SizedBox(height: 17),
              Row(
                children: [
                  Expanded(child: Text('${event.confirmedCount} / ${event.capacity} confirmed',
                      style: const TextStyle(color: _muted, fontSize: 11))),
                  Text('${event.seatsRemaining} seats available',
                      style: const TextStyle(color: _muted, fontSize: 11)),
                ],
              ),
              const SizedBox(height: 7),
              LinearProgressIndicator(
                value: progress,
                minHeight: 6,
                backgroundColor: const Color(0xFFE6EEF0),
                borderRadius: BorderRadius.circular(8),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: canRegister && _busyEvent == null
                      ? () => _register(event)
                      : null,
                  child: Text(
                    _busyEvent == event.id
                        ? 'Registering...'
                        : registered ? '✓ You are registered'
                        : event.isFull ? 'Event full'
                        : event.registrationOpen ? 'Register for event' : 'Registration unavailable',
                  ),
                ),
              ),
              if (registered)
                const Padding(
                  padding: EdgeInsets.only(top: 9),
                  child: Text(
                    'Your personal registration is private to you and authorized organizers.',
                    style: TextStyle(fontSize: 10, color: Color(0xFF398477)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _myRegistrations() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionHeader(title: 'My confirmed registrations'),
          const Padding(
            padding: EdgeInsets.only(top: 5, bottom: 17),
            child: Text(
              'Only your authenticated student account can retrieve this list.',
              style: TextStyle(color: _muted, fontSize: 12),
            ),
          ),
          if (_registrations.isEmpty)
            const _EmptyView(
              title: 'No registrations yet',
              detail: 'Browse events and register during an open registration window.',
            )
          else
            ..._registrations.map((registration) {
              final matching = _events.where((event) =>
                  event.id == registration.eventId).toList();
              final event = matching.isEmpty ? null : matching.first;
              return Padding(
                padding: const EdgeInsets.only(bottom: 11),
                child: Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(16),
                    leading: const CircleAvatar(
                      backgroundColor: Color(0xFFE0F8F1),
                      child: Icon(Icons.check_circle, color: Color(0xFF168F7D)),
                    ),
                    title: Text(event?.title ?? 'Event unavailable or cancelled',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('Confirmed ${_date(registration.confirmedAt)}\n'
                        '${event == null ? 'Contact organizer for details' : _date(event.startsAt)}'),
                    isThreeLine: true,
                  ),
                ),
              );
            }),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: () => _selectTab(1),
            child: const Text('Explore campus events'),
          ),
        ],
      );

  Widget _announcementList() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionHeader(title: 'Official campus updates'),
          const SizedBox(height: 14),
          if (_announcements.isEmpty)
            const _EmptyView(
              title: 'No announcements',
              detail: 'You will see relevant campus notices here once published.',
            )
          else
            ..._announcements.map(_announcementCard),
        ],
      );

  Widget _announcementCard(CampusAnnouncement announcement) => Padding(
        padding: const EdgeInsets.only(bottom: 13),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(19),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  _StatusTag(title: announcement.scope.toUpperCase(), positive: true),
                  const Spacer(),
                  Text(_date(announcement.publishedAt),
                      style: const TextStyle(fontSize: 10, color: _muted)),
                ]),
                const SizedBox(height: 12),
                Text(announcement.title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                const SizedBox(height: 10),
                Text(announcement.body, style: const TextStyle(color: _muted, height: 1.65)),
              ],
            ),
          ),
        ),
      );

  Widget _profilePage() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionHeader(title: 'Your verified identity'),
          const SizedBox(height: 13),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(21),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: const Color(0xFFDEF7F1),
                    child: Text(widget.profile.name.isEmpty
                        ? 'S' : widget.profile.name[0].toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF168E81))),
                  ),
                  const SizedBox(height: 14),
                  Text(widget.profile.name,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 7),
                  Text(widget.profile.email, style: const TextStyle(color: _muted)),
                  const SizedBox(height: 14),
                  const Divider(color: _line),
                  _ProfileField('Account', widget.profile.status),
                  _ProfileField('Role', widget.profile.roles.join(', ')),
                  _ProfileField('Registration no.', widget.profile.registrationNo ?? 'Not provided'),
                  const SizedBox(height: 15),
                  const Text(
                    'Only the university Admin can approve privileged roles. '
                    'Your event registrations are not published to other students.',
                    style: TextStyle(fontSize: 11, color: _muted, height: 1.6),
                  ),
                  const SizedBox(height: 17),
                  OutlinedButton.icon(
                    onPressed: () => FirebaseAuth.instance.signOut(),
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
}

class _Metric extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _Metric({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: _teal, size: 23),
              const SizedBox(height: 16),
              Text(label, style: const TextStyle(color: _muted, fontSize: 11)),
              const SizedBox(height: 7),
              Text(value, style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      );
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const _SectionHeader({required this.title, this.trailing});

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(child: Text(title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: _navy))),
          if (trailing != null) trailing!,
        ],
      );
}

class _StatusTag extends StatelessWidget {
  final String title;
  final bool positive;
  const _StatusTag({required this.title, required this.positive});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: positive ? const Color(0xFFE6F8F1) : const Color(0xFFFFF0DA),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Text(title,
            style: TextStyle(
              fontSize: 10,
              color: positive ? const Color(0xFF16846C) : const Color(0xFF916C22),
              fontWeight: FontWeight.w800,
            )),
      );
}

class _EmptyView extends StatelessWidget {
  final String title;
  final String detail;
  const _EmptyView({required this.title, required this.detail});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 34),
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: _line),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(children: [
          const Icon(Icons.layers_clear_outlined, size: 39, color: _teal),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(detail, textAlign: TextAlign.center,
              style: const TextStyle(color: _muted, fontSize: 12, height: 1.6)),
        ]),
      );
}

class _ProfileField extends StatelessWidget {
  final String label;
  final String value;
  const _ProfileField(this.label, this.value);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 9),
        child: Row(
          children: [
            SizedBox(width: 113, child: Text(label, style: const TextStyle(color: _muted))),
            Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700))),
          ],
        ),
      );
}

class _Failure extends StatelessWidget {
  final String message;
  final VoidCallback retry;
  const _Failure({required this.message, required this.retry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off_rounded, color: Color(0xFFBF5362), size: 41),
              const SizedBox(height: 17),
              const Text('Cannot load campus content',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(height: 9),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 17),
              FilledButton(onPressed: retry, child: const Text('Try again')),
            ],
          ),
        ),
      );
}
