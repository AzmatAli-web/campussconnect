import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';
import '../services/study_plan.dart';

class StudyPlanner extends StatefulWidget {
  final String accountKey;
  const StudyPlanner({super.key,required this.accountKey});
  @override
  State<StudyPlanner> createState()=>_StudyPlannerState();
}

class _StudyPlannerState extends State<StudyPlanner> {
  DateTime week=studyWeek(DateTime.now());
  final title=TextEditingController();
  String? link;
  bool busy=false;
  StudyPlan? plan;
  String? error;

  @override
  void initState(){super.initState();load();}
  @override
  void dispose(){title.dispose();super.dispose();}

  Future<void> load() async {
    setState((){busy=true;error=null;});
    try {
      final data=await StudyPlan.read(widget.accountKey);
      if(mounted)setState(()=>plan=data);
    } catch (_) {
      if(mounted)setState(()=>error='Could not read study goals.');
    } finally {
      if(mounted)setState(()=>busy=false);
    }
  }

  Future<void> save(List<StudyGoal> goals,{bool added=false})async{
    if(busy)return;
    setState((){busy=true;error=null;});
    try{
      await StudyPlan.save(widget.accountKey,goals);
      if(!mounted)return;
      setState((){
        plan=StudyPlan(goals,plan!.assignments);
        if(added){title.clear();link=null;}
      });
    }catch(_){
      if(mounted)setState(()=>error='Could not save your change. Try again.');
    }finally{
      if(mounted)setState(()=>busy=false);
    }
  }

  @override
  Widget build(BuildContext context){
    final data=plan;
    final rows=data?.goals.where((g)=>g.week==week).toList()??[];
    final completed=rows.where((g)=>g.complete(data!.assignments)).length;
    final full=rows.length>=12 || (data?.goals.length??0)>=120;
    return Scaffold(appBar:AppBar(title:const Text('Weekly study planner')),body:ListView(
      padding:const EdgeInsets.all(16),children:[
        if(busy)const LinearProgressIndicator(),
        if(error!=null)Text(error!),
        if(data==null && !busy)TextButton(onPressed:load,child:const Text('Retry')),
        if(data!=null)...[
          Row(children:[
            IconButton(tooltip:'Previous week',onPressed:busy?null:()=>setState(()=>week=week.subtract(const Duration(days:7))),icon:const Icon(Icons.chevron_left)),
            Expanded(child:Text('Week of ${week.toIso8601String().substring(0,10)}')),
            IconButton(tooltip:'Next week',onPressed:busy?null:()=>setState(()=>week=week.add(const Duration(days:7))),icon:const Icon(Icons.chevron_right)),
          ]),
          TextButton(onPressed:busy?null:()=>setState(()=>week=studyWeek(DateTime.now())),child:const Text('This week')),
          Text('$completed of ${rows.length} goals complete'),
          LinearProgressIndicator(value:rows.isEmpty?0:completed/rows.length),
          TextField(controller:title,maxLength:100,decoration:const InputDecoration(labelText:'Study goal'),
            onChanged:(_)=>setState((){})),
          DropdownButtonFormField<String>(key:ValueKey(link),initialValue:link??'',isExpanded:true,
            decoration:const InputDecoration(labelText:'Linked assignment'),
            items:[const DropdownMenuItem(value:'',child:Text('Independent goal')),
              for(final a in data.assignments) DropdownMenuItem(value:a.id,child:Text(a.title,overflow:TextOverflow.ellipsis))],
            onChanged:busy?null:(id)=>setState(()=>link=id==''?null:id)),
          if(full)const Text('Planner limit reached. Remove a goal to add another.'),
          FilledButton(onPressed:busy||full||title.text.trim().isEmpty?null:()=>save([...data.goals,
            StudyGoal(const Uuid().v4(),title.text.trim(),week,link,false)],added:true),child:const Text('Add goal')),
          for(final g in rows)ListTile(title:Text(g.title),
            subtitle:g.assignmentId==null?null:Text('Linked: ${data.assignments.where((a)=>a.id==g.assignmentId).firstOrNull?.title??'Unavailable assignment'}'),
            leading:Checkbox(value:g.complete(data.assignments),onChanged:busy||g.assignmentId!=null?null:(_)=>save([
              for(final goal in data.goals)goal.id==g.id?goal.toggle():goal])),
            trailing:IconButton(tooltip:'Remove goal',icon:const Icon(Icons.delete_outline),onPressed:busy?null:()=>save(
              data.goals.where((goal)=>goal.id!=g.id).toList()))),
        ],
      ]));
  }
}
