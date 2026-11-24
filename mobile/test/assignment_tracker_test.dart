import 'package:campusconnect_mobile/screens/assignment_tracker.dart';
import 'package:campusconnect_mobile/services/assignments.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main(){
  test('PKT rollover, priority tie breaks and all-day deadline calendar',(){
    final due=campusDate(DateTime.utc(2028,2,28,19));
    expect(due,DateTime.utc(2028,2,29));
    final a=Assignment('a','Project, part 1','Lab',due,AssignmentPriority.high,false);
    final b=Assignment('b','Revision','',due,AssignmentPriority.low,false);
    expect(sortedAssignments([b,a]).first,a);
    final output=assignmentCalendar([a,b.toggle()],due)!;
    expect(output,contains('DTSTART;VALUE=DATE:20280229'));
    expect(output,contains('DTEND;VALUE=DATE:20280301'));
    expect(output,contains(r'SUMMARY:Project\, part 1'));
    expect(output,isNot(contains('Revision')));
    expect(assignmentCalendar([a.toggle()],due),isNull);
  });
  testWidgets('a personal deadline can be added, completed, reopened and isolated by account',(tester) async {
    SharedPreferences.setMockInitialValues({});
    Future<void> open(String id) async {
      await tester.pumpWidget(MaterialApp(home:AssignmentTracker(key:ValueKey(id),accountKey:id)));
      await tester.pumpAndSettle();
    }
    await open('one');
    await tester.tap(find.text('Add assignment'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first,'Lab report');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Lab report'),findsOneWidget);
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(find.textContaining('Completed'),findsOneWidget);
    await open('two');
    expect(find.text('Lab report'),findsNothing);
    await open('one');
    expect(find.textContaining('Completed'),findsOneWidget);
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(find.textContaining('Completed'),findsNothing);
  });
}
