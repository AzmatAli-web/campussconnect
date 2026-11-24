import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/screens/campus_calendar.dart';
import 'package:campusconnect_mobile/services/assignments.dart';
import 'package:campusconnect_mobile/services/campus_calendar.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  testWidgets('student navigates month and searches the selected week', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize=const Size(800,1600);
    tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api=PreviewCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:CampusCalendar(api:api,accountKey:'preview')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Month'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Next period'));
    await tester.pumpAndSettle();
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
