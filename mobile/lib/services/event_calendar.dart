import 'dart:convert';

import '../models/campus_models.dart';

String? eventCalendar(CampusEvent event, DateTime now) {
  final start = event.startsAt, end = event.endsAt;
  if (start == null || end == null || !start.isAfter(now) ||
      end.millisecondsSinceEpoch ~/ 1000 <= start.millisecondsSinceEpoch ~/ 1000 ||
      event.title.trim().isEmpty || !RegExp(r'^[\w-]+$').hasMatch(event.id)) {
    return null;
  }
  final lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusConnect//Campus Events//EN',
    'BEGIN:VEVENT','UID:${event.id}@events.campusconnect.invalid','DTSTAMP:${calendarStamp(now)}',
    'DTSTART:${calendarStamp(start)}','DTEND:${calendarStamp(end)}','SUMMARY:${calendarEscape(event.title)}',
    if(event.venue.trim().isNotEmpty) 'LOCATION:${calendarEscape(event.venue)}','END:VEVENT','END:VCALENDAR',
  ];
  return calendarLines(lines);
}

String calendarStamp(DateTime time) {
    final seconds = time.toUtc().toIso8601String().split('.').first;
    return "${seconds.replaceAll('-', '').replaceAll(':', '')}Z";
  }
String calendarEscape(String text) => text.replaceAll(RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'), '')
      .replaceAll('\\', r'\\').replaceAll(RegExp(r'\r\n|\r|\n'), r'\n')
      .replaceAll(',', r'\,').replaceAll(';', r'\;');

String calendarLines(List<String> lines) {
  final output = StringBuffer();
  for (final line in lines) {
    var length = 0;
    for (final rune in line.runes) {
      final char = String.fromCharCode(rune);
      final bytes = utf8.encode(char).length;
      if (length + bytes > 75) {
        output.write('\r\n ');
        length = 1;
      }
      output.write(char);
      length += bytes;
    }
    output.write('\r\n');
  }
  return output.toString();
}
