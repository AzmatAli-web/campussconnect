import 'dart:convert';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../services/assignments.dart';

class AssignmentTracker extends StatefulWidget {
  final String accountKey;
  const AssignmentTracker({super.key, required this.accountKey});
  @override
  State<AssignmentTracker> createState()=>_AssignmentTrackerState();
}

class _AssignmentTrackerState extends State<AssignmentTracker> {
  List<Assignment> items=[];
  bool busy=true, failed=false;
  String get keyName=>'assignments:${widget.accountKey}';

  @override
  void initState(){super.initState();load();}

  void message(String text){
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(text)));
  }

  Future<void> load() async {
    setState((){busy=true;failed=false;});
    try {
      final prefs=await SharedPreferences.getInstance();
      final rows=jsonDecode(prefs.getString(keyName)??'[]') as List;
      final loaded=rows.map((r)=>Assignment.fromJson(r as Map<String,dynamic>)).toList();
      if(mounted)setState(()=>items=loaded);
    } catch (_) {
      if(mounted)setState(()=>failed=true);
    } finally {
      if(mounted)setState(()=>busy=false);
    }
  }

  Future<void> save(List<Assignment> next) async {
    if(busy||failed)return;
    setState(()=>busy=true);
    try {
      final prefs=await SharedPreferences.getInstance();
      if(!await prefs.setString(keyName,jsonEncode(next)))throw StateError('Write failed');
      if(mounted)setState(()=>items=next);
    } catch (_) {
      message('Could not save the assignment change.');
    } finally {
      if(mounted)setState(()=>busy=false);
    }
  }

  Future<void> edit([Assignment? old]) async {
    final item=await showDialog<Assignment>(context:context,builder:(_)=>_Editor(item:old));
    if(item==null||!mounted)return;
    await save([for(final row in items) if(row.id!=item.id)row,item]);
  }

  Future<void> export() async {
    final calendar=assignmentCalendar(items,DateTime.now());
    if(calendar==null)return;
    try {
      final directory=await getTemporaryDirectory();
      final file=File('${directory.path}/deadlines-${const Uuid().v4()}.ics');
      await file.writeAsString(calendar,flush:true);
      final result=await OpenFilex.open(file.path,type:'text/calendar',uti:'com.apple.ical.ics');
      if(result.type!=ResultType.done)message('A compatible calendar app is required to open this file.');
    } catch (_) {
      message('Could not open the deadline calendar.');
    }
  }

  @override
  Widget build(BuildContext context){
    final today=campusDate(DateTime.now());
    final open=items.where((r)=>!r.done);
    final overdue=open.where((r)=>r.due.isBefore(today)).length;
    final week=open.where((r){final days=r.due.difference(today).inDays;return days>=0&&days<7;}).length;
    return Scaffold(appBar:AppBar(title:const Text('My assignments')),body:ListView(
      padding:const EdgeInsets.all(16),children:[
        const Text('Personal deadlines saved on this device. Dates follow Pakistan time.'),
        if(busy)const LinearProgressIndicator(),
        if(failed)TextButton(onPressed:load,child:const Text('Could not load assignments. Retry'))
        else ...[
          Text('$overdue overdue · $week due in the next 7 days · ${open.where((r)=>r.priority==AssignmentPriority.high).length} high priority'),
          Wrap(spacing:8,children:[
            FilledButton(onPressed:busy?null:()=>edit(),child:const Text('Add assignment')),
            OutlinedButton(onPressed:busy||open.isEmpty?null:export,child:const Text('Export open deadlines')),
          ]),
          if(!busy&&items.isEmpty)const Text('No assignments yet.'),
          for(final row in sortedAssignments(items)) Card(child:ListTile(
            leading:Checkbox(value:row.done,onChanged:busy?null:(_)=>save([
              for(final item in items)item.id==row.id?item.toggle():item])),
            title:Text(row.title),
            subtitle:Text([if(row.course.isNotEmpty)row.course,row.due.toIso8601String().substring(0,10),
              row.priority.name,if(row.done)'Completed' else if(row.due.isBefore(today))'Overdue'].join(' · ')),
            trailing:IconButton(tooltip:'Edit assignment',icon:const Icon(Icons.edit),onPressed:busy?null:()=>edit(row)),
          )),
        ],
      ]));
  }
}

class _Editor extends StatefulWidget {
  final Assignment? item;
  const _Editor({this.item});
  @override
  State<_Editor> createState()=>_EditorState();
}

class _EditorState extends State<_Editor> {
  late String title=widget.item?.title??'', course=widget.item?.course??'';
  late DateTime due=widget.item?.due??campusDate(DateTime.now());
  late AssignmentPriority priority=widget.item?.priority??AssignmentPriority.medium;
  @override
  Widget build(BuildContext context)=>AlertDialog(
    title:Text(widget.item==null?'New assignment':'Edit assignment'),
    content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
      TextFormField(initialValue:title,maxLength:120,decoration:const InputDecoration(labelText:'Assignment title'),
        onChanged:(v)=>setState(()=>title=v)),
      TextFormField(initialValue:course,maxLength:80,decoration:const InputDecoration(labelText:'Course (optional)'),onChanged:(v)=>course=v),
      TextButton(onPressed:() async {
        final picked=await showDatePicker(context:context,initialDate:due,firstDate:DateTime(2000),lastDate:DateTime(2100,12,31));
        if(picked!=null&&mounted)setState(()=>due=DateTime.utc(picked.year,picked.month,picked.day));
      },child:Text('Due ${due.toIso8601String().substring(0,10)}')),
      DropdownButtonFormField<AssignmentPriority>(initialValue:priority,decoration:const InputDecoration(labelText:'Priority'),
        items:AssignmentPriority.values.map((p)=>DropdownMenuItem(value:p,child:Text(p.name))).toList(),
        onChanged:(p){if(p!=null)setState(()=>priority=p);}),
    ])),
    actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Cancel')),
      FilledButton(onPressed:title.trim().isEmpty?null:()=>Navigator.pop(context,Assignment(
        widget.item?.id??const Uuid().v4(),title.trim(),course.trim(),due,priority,widget.item?.done??false)),child:const Text('Save'))],
  );
}
