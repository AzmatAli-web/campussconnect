import 'event_calendar.dart';

enum AssignmentPriority { high, medium, low }

class Assignment {
  final String id, title, course;
  final DateTime due;
  final AssignmentPriority priority;
  final bool done;
  const Assignment(this.id, this.title, this.course, this.due, this.priority, this.done);

  Map<String,dynamic> toJson() => {'id':id,'title':title,'course':course,
    'due':due.toIso8601String(),'priority':priority.name,'done':done};
  factory Assignment.fromJson(Map<String,dynamic> data) => Assignment(
    data['id'],data['title'],data['course'],DateTime.parse(data['due']).toUtc(),
    AssignmentPriority.values.byName(data['priority'] ?? 'medium'),data['done']);
  Assignment toggle() => Assignment(id,title,course,due,priority,!done);
}

DateTime campusDate(DateTime instant) {
  final local = instant.toUtc().add(const Duration(hours:5));
  return DateTime.utc(local.year,local.month,local.day);
}

List<Assignment> sortedAssignments(List<Assignment> items) => [...items]..sort((a,b){
  if(a.done != b.done)return a.done ? 1 : -1;
  final days=a.due.compareTo(b.due);
  if(days!=0)return days;
  final priority=a.priority.index.compareTo(b.priority.index);
  return priority!=0 ? priority : a.title.compareTo(b.title);
});

String? assignmentCalendar(List<Assignment> items, DateTime now) {
  final open=sortedAssignments(items).where((item)=>!item.done);
  if(open.isEmpty)return null;
  String day(DateTime date)=>date.toIso8601String().substring(0,10).replaceAll('-','');
  return calendarLines([
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusConnect//Assignments//EN',
    for(final item in open)...[
      'BEGIN:VEVENT','UID:${item.id}@assignments.campusconnect.invalid','DTSTAMP:${calendarStamp(now)}',
      'DTSTART;VALUE=DATE:${day(item.due)}','DTEND;VALUE=DATE:${day(item.due.add(const Duration(days:1)))}',
      'SUMMARY:${calendarEscape(item.title)}',if(item.course.isNotEmpty)'DESCRIPTION:${calendarEscape(item.course)}',
      'END:VEVENT',
    ],
    'END:VCALENDAR',
  ]);
}
