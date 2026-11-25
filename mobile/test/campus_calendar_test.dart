import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/screens/campus_calendar.dart';
import 'package:campusconnect_mobile/services/assignments.dart';
import 'package:campusconnect_mobile/services/campus_calendar.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PagedEvents extends PreviewCampusApi {
  final requests=<(DateTime,DateTime,int)>[];
  @override
  Future<List<CampusEvent>> calendarEventPage(DateTime from,DateTime to,int page) async {
    requests.add((from,to,page));
    return List.generate(page==1?100:1,(i)=>CampusEvent.fromJson({
      'id':'$page-$i','title':page==2?'Second page event':'Sample event',
      'startsAt':from.toIso8601String(),
    }));
  }
}

void main(){
  test('agenda combines recurring classes, PKT event dates and open deadlines',(){
    final monday=DateTime.utc(2027,1,4);
    final assignment=Assignment('a','Report','Networks',monday,AssignmentPriority.medium,false);
    final feeds=CalendarFeeds([CampusTimetableSlot.fromJson({'dayOfWeek':1,'startTime':'09:00',
      'endTime':'10:00','courseTitle':'Algorithms','courseCode':'CS101','room':'Lab 2'})],
      [CampusEvent.fromJson({'title':'Workshop','startsAt':'2027-01-03T19:30:00Z','venue':'Main hall'})],
      [assignment,assignment.toggle()]);
    final sources=CalendarSource.values.toSet();
    expect(feeds.agenda(monday,sources).map((r)=>r.title),['Report','Workshop','Algorithms']);
    expect(feeds.agenda(monday,sources,query:'HALL').single.time,'00:30');
    expect(feeds.agenda(monday,{CalendarSource.classes},query:'cs101').single.title,'Algorithms');
    expect(feeds.agenda(monday.add(const Duration(days:7)),sources).single.title,'Algorithms');
    expect(calendarMonday(DateTime.utc(2027,1,3)),DateTime.utc(2026,12,28));
    expect(shiftCalendarMonth(DateTime.utc(2028,1,31),1),DateTime.utc(2028,2,29));
  });

  test('overnight events continue until their exclusive PKT end',(){
    final feeds=CalendarFeeds([], [CampusEvent.fromJson({'title':'Festival',
      'startsAt':'2026-12-31T16:00:00Z','endsAt':'2027-01-02T19:00:00Z'})], []);
    final sources={CalendarSource.events};
    expect(feeds.agenda(DateTime.utc(2026,12,31),sources).single.time,'21:00');
    for(final day in [1,2]){
      expect(feeds.agenda(DateTime.utc(2027,1,day),sources).single.detail,contains('Continues'));
    }
    expect(feeds.agenda(DateTime.utc(2027,1,3),sources),isEmpty);
  });

  test('weekly export includes each selected item once with campus-local class times',(){
    final monday=DateTime.utc(2027,1,4);
    final event=CampusEvent.fromJson({'id':'e','title':'Festival','startsAt':'2027-01-02T12:00:00Z','endsAt':'2027-01-05T12:00:00Z'});
    final task=Assignment('a','Essay','',monday,AssignmentPriority.medium,false);
    final feeds=CalendarFeeds([CampusTimetableSlot.fromJson({'id':'s','dayOfWeek':1,
      'courseTitle':'Algorithms','startTime':'09:00','endTime':'10:00'})],[event,event],[task,task.toggle()]);
    final file=weeklyCalendar(monday,feeds,CalendarSource.values.toSet(),monday)!;
    expect('BEGIN:VEVENT'.allMatches(file).length,3);
    expect(file,contains('DTSTART:20270104T040000Z'));
    expect(file,contains('DTSTART:20270102T120000Z'));
    expect(file,contains('DTEND;VALUE=DATE:20270105'));
    expect(weeklyCalendar(monday,feeds,{},monday),isNull);
  });

  test('overnight overlap marks both entries and permits back-to-back classes',(){
    final date=DateTime.utc(2027,1,4);
    final slots=[for(final start in ['09:00','10:00'])CampusTimetableSlot.fromJson({
      'dayOfWeek':1,'courseTitle':start,'startTime':start,'endTime':start=='09:00'?'10:00':'11:00'})];
    final event=CampusEvent.fromJson({'title':'Overnight','startsAt':'2027-01-03T16:00:00Z','endsAt':'2027-01-04T04:30:00Z'});
    final feeds=CalendarFeeds(slots,[event],[]);
    expect(feeds.agenda(date,CalendarSource.values.toSet()).where((item)=>item.conflict)
      .map((item)=>item.title),['Overnight','09:00']);
    expect(feeds.agenda(date,{CalendarSource.classes}).any((item)=>item.conflict),isFalse);
  });

  test('conflict details and summaries count triple bookings once',(){
    final day=DateTime.utc(2027,1,4);
    AgendaItem row(String title,int from,int to)=>AgendaItem(CalendarSource.events,title,'','',
      start:day.add(Duration(minutes:from)),end:day.add(Duration(minutes:to)));
    final a=row('A',0,60),b=row('B',10,50),c=row('C',20,40),d=row('D',60,80);
    final rows=[a,b,c,d];
    final pairs=overlapDetails(a,rows);
    expect(pairs.map((pair)=>pair.other.title),['B','C']);
    expect(pairs.first.end.difference(pairs.first.start).inMinutes,40);
    expect(conflictSummary(rows),(milliseconds:2400000,peak:3));
    expect(conflictSummary([a,d]),(milliseconds:0,peak:1));
    expect(durationLabel(90500),'1 min 31 sec');
  });

  test('free gaps clip overnight bookings, merge overlaps and include exact thresholds',(){
    final day=DateTime.utc(2027,1,4);
    DateTime at(int n)=>day.add(Duration(minutes:n));
    AgendaItem busy(int a,int b)=>AgendaItem(CalendarSource.events,'Event','','',start:at(a),end:at(b));
    final items=[busy(-600,10),busy(5,20),busy(50,65),busy(65,80),busy(115,180)];
    expect(freeWindows(items,day,at(120),30),[(start:at(20),end:at(50)),(start:at(80),end:at(115))]);
    expect(freeWindows(items,day,at(120),60),isEmpty);
    expect(freeWindows([],day,at(120),30),[(start:day,end:at(120))]);
  });

  test('a saved study block removes only its reserved time from a free gap',(){
    final day=DateTime.utc(2027,1,4,3);
    final end=day.add(const Duration(hours:1));
    final reservation=(start:day,end:day.add(const Duration(minutes:15)));
    expect(freeWindows([],day,end,30,reservations:[reservation]),[(start:reservation.end,end:end)]);
    expect(freeWindows([],day,end,30),[(start:day,end:end)]);
  });

  testWidgets('student navigates month and searches the selected week', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize=const Size(800,1600);
    tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api=PagedEvents();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:CampusCalendar(api:api,accountKey:'preview')));
    await tester.pumpAndSettle();
    expect(api.requests.map((r)=>r.$3),[1,2]);
    expect(api.requests.first.$2.difference(api.requests.first.$1).inDays,6);
    await tester.tap(find.text('Month'));
    await tester.pumpAndSettle();
    expect(api.requests.last.$2.difference(api.requests.last.$1).inDays,41);
    final monthStart=api.requests.last.$1;
    await tester.tap(find.byTooltip('Next period'));
    await tester.pumpAndSettle();
    expect(api.requests.last.$1.isAfter(monthStart),isTrue);
    await tester.tap(find.text('Today'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Search whole week'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'CSC494');
    await tester.pumpAndSettle();
    expect(find.text('Software Project Management'),findsOneWidget);
    await tester.tap(find.text('Classes'));
    await tester.pumpAndSettle();
    expect(find.text('No matching items for this period.'),findsOneWidget);
  });
}
