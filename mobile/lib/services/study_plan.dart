import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'assignments.dart';

DateTime studyWeek(DateTime instant) {
  final date = campusDate(instant);
  return date.subtract(Duration(days: date.weekday - 1));
}

class StudyGoal {
  final String id, title;
  final DateTime week;
  final String? assignmentId;
  final bool done;
  const StudyGoal(this.id,this.title,this.week,this.assignmentId,this.done);

  bool complete(List<Assignment> assignments) => assignmentId == null ? done :
      assignments.any((item)=>item.id==assignmentId && item.done);
  StudyGoal toggle() => StudyGoal(id,title,week,assignmentId,!done);
  Map<String,dynamic> toJson()=>{'id':id,'title':title,'week':week.toIso8601String(),
    'assignment':assignmentId,'done':done};
  factory StudyGoal.fromJson(Map<String,dynamic> row)=>StudyGoal(
    row['id'],row['title'],DateTime.parse(row['week']),row['assignment'],row['done']);
}

class StudyPlan {
  final List<StudyGoal> goals;
  final List<Assignment> assignments;
  const StudyPlan(this.goals,this.assignments);

  static Future<StudyPlan> read(String account) async {
    final prefs=await SharedPreferences.getInstance();
    final goals=jsonDecode(prefs.getString('study-goals:$account')??'[]') as List;
    final assignments=jsonDecode(prefs.getString('assignments:$account')??'[]') as List;
    return StudyPlan([for(final row in goals) StudyGoal.fromJson(row)],
      [for(final row in assignments) Assignment.fromJson(row)]);
  }

  static Future<void> save(String account,List<StudyGoal> goals) async {
    final prefs=await SharedPreferences.getInstance();
    if(!await prefs.setString('study-goals:$account',jsonEncode(goals))){
      throw StateError('Could not save study goals.');
    }
  }
}
