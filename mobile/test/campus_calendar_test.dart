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
