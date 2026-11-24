import 'dart:convert';
import 'package:campusconnect_mobile/screens/study_planner.dart';
import 'package:campusconnect_mobile/services/assignments.dart';
import 'package:campusconnect_mobile/services/study_plan.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main(){
  test('PKT weeks start Monday and linked goals reflect completion and reopening',(){
    expect(studyWeek(DateTime.utc(2027,1,3,19)),DateTime.utc(2027,1,4));
    expect(studyWeek(DateTime.utc(2027,1,3,18,59)),DateTime.utc(2026,12,28));
    final a=Assignment('a','Lab','',DateTime.utc(2027,1,6),AssignmentPriority.high,false);
    final goal=StudyGoal('g','Finish lab',DateTime.utc(2027,1,4),a.id,false);
    expect(goal.complete([a]),isFalse);
    expect(goal.complete([a.toggle()]),isTrue);
    expect(goal.complete([a.toggle().toggle()]),isFalse);
    expect(goal.complete([]),isFalse);
  });

  testWidgets('weekly goals persist, support manual completion, and stay in the chosen week',(tester)async{
    SharedPreferences.setMockInitialValues({'assignments:student':jsonEncode([])});
    await tester.pumpWidget(const MaterialApp(home:StudyPlanner(accountKey:'student')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'Revise scheduling');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add goal'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(find.text('1 of 1 goals complete'),findsOneWidget);
    await tester.tap(find.byTooltip('Next week'));
    await tester.pumpAndSettle();
    expect(find.text('0 of 0 goals complete'),findsOneWidget);
    expect((await StudyPlan.read('student')).goals.single.done,isTrue);
    expect((await StudyPlan.read('other')).goals,isEmpty);
    await tester.tap(find.text('This week'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove goal'));
    await tester.pumpAndSettle();
    expect((await StudyPlan.read('student')).goals,isEmpty);
  });
}
