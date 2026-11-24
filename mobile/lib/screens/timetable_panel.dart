import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:material_ui/material_ui.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _deep = Color(0xFF142A3F);
const _sea = Color(0xFF0DAF9C);
const _muted = Color(0xFF73889B);
const _days = <String>[
  '', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

class CampusDaySchedule {
  final int weekday;
  final List<CampusTimetableSlot> classes;
  final CampusTimetableSlot? current;
  final CampusTimetableSlot? next;

  CampusDaySchedule._(this.weekday, this.classes, this.current, this.next);

  factory CampusDaySchedule.at(List<CampusTimetableSlot> slots, DateTime instant) {
    final campus = instant.toUtc().add(const Duration(hours: 5));
    final time = '${campus.hour.toString().padLeft(2, '0')}:${campus.minute.toString().padLeft(2, '0')}';
    final classes = slots.where((s) => s.dayOfWeek == campus.weekday).toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    final validTime = RegExp(r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');
    CampusTimetableSlot? current, next;
    for (final slot in classes) {
      if (!validTime.hasMatch(slot.startTime) || !validTime.hasMatch(slot.endTime) ||
          slot.startTime.compareTo(slot.endTime) >= 0) {
        continue;
      }
      if (slot.startTime.compareTo(time) <= 0 && slot.endTime.compareTo(time) > 0) {
        current ??= slot;
      } else if (slot.startTime.compareTo(time) > 0) {
        next ??= slot;
      }
    }
    return CampusDaySchedule._(campus.weekday, classes, current, next);
  }
}

class TimetablePanel extends StatefulWidget {
  final CampusApi api;
  final bool previewMode;
  final String accountKey;
  const TimetablePanel({
    super.key, required this.api, this.previewMode = false, this.accountKey = '',
  });

  @override
  State<TimetablePanel> createState() => _TimetablePanelState();
}

class _TimetablePanelState extends State<TimetablePanel> {
  List<CampusTimetableGroup> _groups = const [];
  List<CampusTimetableSlot> _slots = const [];
  String? _selected;
  bool _loadingGroups = true;
  bool _loadingSlots = false;
  String? _error;
  int _requestSequence = 0;
  bool _today = false;
  Timer? _clock;

  void _updateClock() {
    _clock?.cancel();
    if (!_today) return;
    final now = DateTime.now();
    _clock = Timer(Duration(milliseconds: 60000 - now.millisecondsSinceEpoch % 60000), () {
      if (!mounted) return;
      setState(() {});
      _updateClock();
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() { _loadingGroups = true; _error = null; });
    try {
      final result = await widget.api.getTimetableGroups();
      if (!mounted) return;
      var preferred = _selected;
      if(preferred == null && widget.accountKey.isNotEmpty){
        try {
          final prefs = await SharedPreferences.getInstance();
          preferred = prefs.getString('timetable-group:${widget.accountKey}');
        } catch (_) { /* Timetables also work without device storage. */ }
      }
      if (!mounted) return;
      final selected = result.any((g) => g.key == preferred)
          ? preferred : result.isNotEmpty ? result.first.key : null;
      setState(() {
        _groups = result;
        _selected = selected;
        _loadingGroups = false;
        if (selected == null) _slots = const [];
      });
      final matches = result.where((g) => g.key == selected);
      if (matches.isNotEmpty) {
        await _loadSlots(matches.first);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Cannot load timetables. Check USB connection and backend.';
          _loadingGroups = false;
        });
      }
    }
  }

  Future<void> _chooseGroup(CampusTimetableGroup group) async {
    final key = 'timetable-group:${widget.accountKey}';
    _loadSlots(group);
    if(widget.accountKey.isEmpty)return;
    try {
      final prefs = await SharedPreferences.getInstance();
      if(!mounted || _selected!=group.key)return;
      if(!await prefs.setString(key,group.key))throw StateError('Write failed');
    } catch (_) {
      if(mounted){
        ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Could not remember the group on this device.')));
      }
    }
  }

  Future<void> _loadSlots(CampusTimetableGroup group) async {
    final sequence = ++_requestSequence;
    setState(() {
      _selected = group.key;
      _loadingSlots = true;
      _error = null;
    });
    try {
      final rows = await widget.api.getTimetableSlots(group);
      if (!mounted || sequence != _requestSequence) return;
      setState(() => _slots = rows);
    } catch (_) {
      if (!mounted || sequence != _requestSequence) return;
      setState(() => _error = 'Cannot load timetable classes. Try Refresh.');
    } finally {
      if (mounted && sequence == _requestSequence) {
        setState(() => _loadingSlots = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final today = CampusDaySchedule.at(_slots, DateTime.now());
    final visible = _today ? today.classes : _slots;
    final selectedGroup = _groups.where((g) => g.key == _selected);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Expanded(child: Text('Weekly class schedule',
          style: TextStyle(fontSize: 19, color: _deep,
            fontWeight: FontWeight.w900))),
        IconButton(
          tooltip: 'Refresh timetable',
          onPressed: _loadingGroups ? null : _refresh,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ]),
      const SizedBox(height: 6),
      Text(widget.previewMode
          ? 'OFFLINE DEMO — fictional class schedule'
          : 'Published by authorized campus staff. Times are local to campus.',
        style: const TextStyle(fontSize: 12, color: _muted)),
      const SizedBox(height: 18),
      if (_loadingGroups)
        const Center(child: Padding(
          padding: EdgeInsets.all(30),
          child: CircularProgressIndicator(),
        ))
      else if (_error != null && _groups.isEmpty)
        _notice(_error!)
      else if (_groups.isEmpty)
        _notice('No official timetable has been published yet. '
          'Your university staff will add schedules here.')
      else ...[
        Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('PROGRAM / SEMESTER / SECTION',
              style: TextStyle(fontSize: 11, color: _muted,
                letterSpacing: 0.7, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            DropdownButton<String>(
              isExpanded: true,
              value: _selected,
              underline: const SizedBox.shrink(),
              items: _groups.map((g) => DropdownMenuItem(
                value: g.key,
                child: Text(g.label, maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: (value) {
                if (value == null) return;
                for (final g in _groups) {
                  if (g.key == value) { _chooseGroup(g); return; }
                }
              },
            ),
          ]),
        )),
        const SizedBox(height: 14),
        if (_loadingSlots)
          const LinearProgressIndicator()
        else if (_error != null)
          _notice(_error!)
        else if (_slots.isEmpty)
          _notice('No classes in this timetable.')
        else ...[
          Wrap(spacing: 8, children: [
            for (final mode in [false, true])
              ChoiceChip(label: Text(mode ? 'Today' : 'Full week'), selected: _today == mode,
                onSelected: (_) {
                  setState(() => _today = mode);
                  _updateClock();
                }),
          ]),
          if (_today) ...[
            Text('${_days[today.weekday]} · Pakistan time (PKT)'),
            if (visible.isEmpty) _notice('No classes scheduled for this group today.')
            else ...[
              Text(today.current == null ? 'No class in progress.'
                  : 'In progress: ${today.current!.courseTitle}'),
              Text(today.next == null ? 'No more classes start today.'
                  : 'Up next: ${today.next!.courseTitle} at ${today.next!.startTime}'),
            ],
          ],
          if (selectedGroup.isNotEmpty)
            Padding(padding: const EdgeInsets.only(bottom: 12),
              child: Text(selectedGroup.first.label,
                style: const TextStyle(color: _deep, fontSize: 12,
                  fontWeight: FontWeight.w700))),
          for (var day = 1; day <= 7; day++)
            if (visible.any((slot) => slot.dayOfWeek == day))
              Padding(
                padding: const EdgeInsets.only(bottom: 15),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(_days[day],
                        style: const TextStyle(fontSize: 15,
                          fontWeight: FontWeight.w900, color: _sea)),
                    ),
                    for (final slot in visible.where((s) => s.dayOfWeek == day))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 9),
                        child: Card(child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${slot.startTime} – ${slot.endTime}',
                                style: const TextStyle(fontSize: 12,
                                  color: _sea, fontWeight: FontWeight.w900)),
                              const SizedBox(height: 8),
                              Text('${slot.courseCode} · ${slot.courseTitle}',
                                style: const TextStyle(fontWeight: FontWeight.w800,
                                  color: _deep, fontSize: 15)),
                              const SizedBox(height: 6),
                              Text('${slot.instructorName} · ${slot.room}',
                                style: const TextStyle(fontSize: 12,
                                  color: _muted)),
                            ],
                          ),
                        )),
                      ),
                  ],
                ),
              ),
        ]
      ],
    ]);
  }

  Widget _notice(String message) => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 18),
      child: Text(message, textAlign: TextAlign.center,
        style: const TextStyle(color: _muted, fontSize: 13, height: 1.6)),
    ),
  );
}
