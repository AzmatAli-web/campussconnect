import 'assignments.dart';
import '../models/campus_models.dart';

enum CalendarSource { classes, events, deadlines }

class AgendaItem {
  final CalendarSource source;
  final String title, detail, time;
  const AgendaItem(this.source, this.title, this.detail, this.time);
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
    if(sources.contains(CalendarSource.classes)){
      for(final slot in slots.where((s)=>s.dayOfWeek==date.weekday)){
        rows.add(AgendaItem(CalendarSource.classes,slot.courseTitle,
          '${slot.courseCode} · ${slot.room} · ${slot.startTime}–${slot.endTime}',slot.startTime));
      }
    }
    if(sources.contains(CalendarSource.events)){
      for(final event in events){
        final start=event.startsAt;
        if(start==null)continue;
        final firstDay=campusDate(start);
        final continuing=date.isAfter(firstDay);
        final midnight=date.subtract(const Duration(hours:5));
        if(date.isBefore(firstDay) || (continuing && !(event.endsAt?.isAfter(midnight) ?? false)))continue;
        final pkt=start.toUtc().add(const Duration(hours:5));
        final time='${pkt.hour.toString().padLeft(2,'0')}:${pkt.minute.toString().padLeft(2,'0')}';
        rows.add(AgendaItem(CalendarSource.events,event.title,
          [if(continuing) 'Continues from an earlier day',if(event.venue.isNotEmpty) event.venue].join(' · '),
          continuing ? '' : time));
      }
    }
    if(sources.contains(CalendarSource.deadlines)){
      for(final item in deadlines.where((a)=>!a.done && a.due==date)){
        rows.add(AgendaItem(CalendarSource.deadlines,item.title,item.course,''));
      }
    }
    final term=query.trim().toLowerCase();
    return rows.where((r)=>r.title.toLowerCase().contains(term)||r.detail.toLowerCase().contains(term)).toList()
      ..sort((a,b){
        final time=a.time.compareTo(b.time);
        return time!=0?time:a.title.compareTo(b.title);
      });
  }
}
