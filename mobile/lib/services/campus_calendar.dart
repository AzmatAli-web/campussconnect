import 'event_calendar.dart';
import 'assignments.dart';
import '../models/campus_models.dart';

enum CalendarSource { classes, events, deadlines }

class AgendaItem {
  final CalendarSource source;
  final String title, detail, time;
  final DateTime? start,end;
  bool conflict=false;
  AgendaItem(this.source, this.title, this.detail, this.time,{this.start,this.end});
}

DateTime calendarMonday(DateTime date) => date.subtract(Duration(days:date.weekday-1));

DateTime shiftCalendarMonth(DateTime date, int offset) {
  final lastDay=DateTime.utc(date.year,date.month+offset+1,0).day;
  return DateTime.utc(date.year,date.month+offset,date.day.clamp(1,lastDay));
}

class CalendarFeeds {
  final List<CampusTimetableSlot> slots;
  final List<CampusEvent> events;
  final List<Assignment> deadlines;
  const CalendarFeeds(this.slots,this.events,this.deadlines);

  List<AgendaItem> agenda(DateTime date, Set<CalendarSource> sources, {String query=''}) {
    final rows=<AgendaItem>[];
    final day=date.toIso8601String().substring(0,10);
    final midnight=date.subtract(const Duration(hours:5));
    final tomorrow=midnight.add(const Duration(days:1));
    if(sources.contains(CalendarSource.classes)){
      for(final slot in slots.where((s)=>s.dayOfWeek==date.weekday)){
        rows.add(AgendaItem(CalendarSource.classes,slot.courseTitle,
          '${slot.courseCode} · ${slot.room} · ${slot.startTime}–${slot.endTime}',slot.startTime,
          start:DateTime.tryParse('${day}T${slot.startTime}:00+05:00'),end:DateTime.tryParse('${day}T${slot.endTime}:00+05:00')));
      }
    }
    if(sources.contains(CalendarSource.events)){
      for(final event in events){
        final start=event.startsAt;
        if(start==null)continue;
        final firstDay=campusDate(start);
        final continuing=date.isAfter(firstDay);
        final end=event.endsAt;
        if(date.isBefore(firstDay) || (continuing && !(event.endsAt?.isAfter(midnight) ?? false)))continue;
        final pkt=start.toUtc().add(const Duration(hours:5));
        final time='${pkt.hour.toString().padLeft(2,'0')}:${pkt.minute.toString().padLeft(2,'0')}';
        rows.add(AgendaItem(CalendarSource.events,event.title,
          [if(continuing) 'Continues from an earlier day',if(event.venue.isNotEmpty) event.venue].join(' · '),
          continuing ? '' : time,start:continuing?midnight:start,end:end!=null&&end.isAfter(tomorrow)?tomorrow:end));
      }
    }
    if(sources.contains(CalendarSource.deadlines)){
      for(final item in deadlines.where((a)=>!a.done && a.due==date)){
        rows.add(AgendaItem(CalendarSource.deadlines,item.title,item.course,''));
      }
    }
    final timed=rows.where((r)=>r.start!=null && (r.end?.isAfter(r.start!)??false)).toList()
      ..sort((a,b)=>a.start!.compareTo(b.start!));
    AgendaItem? latestEnd;
    for(final item in timed){
      if(latestEnd!=null && item.start!.isBefore(latestEnd.end!)){
        latestEnd.conflict=true;
        item.conflict=true;
      }
      if(latestEnd==null || item.end!.isAfter(latestEnd.end!))latestEnd=item;
    }
    final term=query.trim().toLowerCase();
    return rows.where((r)=>r.title.toLowerCase().contains(term)||r.detail.toLowerCase().contains(term)).toList()
      ..sort((a,b){
        final time=a.time.compareTo(b.time);
        return time!=0?time:a.title.compareTo(b.title);
      });
  }
}

String? weeklyCalendar(DateTime selected,CalendarFeeds feeds,Set<CalendarSource> sources,DateTime now){
  final monday=calendarMonday(selected),rows=<String>[],seen=<String>{};
  final start=monday.subtract(const Duration(hours:5)),end=start.add(const Duration(days:7));
  String day(DateTime value)=>value.toIso8601String().substring(0,10);
  void entry(String id,String domain,String title,List<String> times,[String location='']){
    final uid='$id@$domain.campusconnect.invalid';
    if(!RegExp(r'^[-\w]+$').hasMatch(id)||title.isEmpty||!seen.add(uid))return;
    rows.addAll(['BEGIN:VEVENT','UID:$uid','DTSTAMP:${calendarStamp(now)}',...times,
      'SUMMARY:${calendarEscape(title)}',if(location.isNotEmpty)'LOCATION:${calendarEscape(location)}','END:VEVENT']);
  }
  if(sources.contains(CalendarSource.classes)){
    for(final slot in feeds.slots){
      if(slot.dayOfWeek<1||slot.dayOfWeek>7||slot.id.isEmpty)continue;
      final date=day(monday.add(Duration(days:slot.dayOfWeek-1)));
      final from=DateTime.tryParse('${date}T${slot.startTime}:00+05:00');
      final to=DateTime.tryParse('${date}T${slot.endTime}:00+05:00');
      if(from!=null&&to!=null&&to.isAfter(from)){
        entry('${slot.id}-$date','classes',slot.courseTitle.isEmpty?slot.courseCode:slot.courseTitle,
          ['DTSTART:${calendarStamp(from)}','DTEND:${calendarStamp(to)}'],slot.room);
      }
    }
  }
  if(sources.contains(CalendarSource.events)){
    for(final event in feeds.events){
      final from=event.startsAt,to=event.endsAt;
      if(from!=null&&to!=null&&from.isBefore(end)&&to.isAfter(start)&&to.isAfter(from)){
        entry(event.id,'events',event.title,['DTSTART:${calendarStamp(from)}','DTEND:${calendarStamp(to)}'],event.venue);
      }
    }
  }
  if(sources.contains(CalendarSource.deadlines)){
    for(final task in feeds.deadlines){
      if(!task.done&&!task.due.isBefore(monday)&&task.due.isBefore(monday.add(const Duration(days:7)))){
        entry(task.id,'assignments',task.title,['DTSTART;VALUE=DATE:${day(task.due).replaceAll('-','')}',
          'DTEND;VALUE=DATE:${day(task.due.add(const Duration(days:1))).replaceAll('-','')}']);
      }
    }
  }
  if(rows.isEmpty)return null;
  return calendarLines(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusConnect//Weekly Agenda//EN',...rows,'END:VCALENDAR']);
}
