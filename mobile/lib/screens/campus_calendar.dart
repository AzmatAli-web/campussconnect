import 'dart:convert';
import 'dart:io';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/campus_models.dart';
import '../services/assignments.dart';
import '../services/campus_api.dart';
import '../services/campus_calendar.dart';

const _labels={CalendarSource.classes:'Classes',CalendarSource.events:'Events',CalendarSource.deadlines:'Deadlines'};
const _days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
String _label(DateTime day)=>day.toIso8601String().substring(0,10);

typedef StudyBlock=({String id,String title,FreeWindow window});

List<StudyBlock> moveStudyBlock(List<StudyBlock> current,StudyBlock source,DateTime start,List<AgendaItem> campus){
  if(!current.contains(source))throw StateError('Original reservation changed');
  final end=start.add(source.window.end.difference(source.window.start));
  final available=freeWindows(campus,start,end,0,
    reservations:current.where((row)=>row.id!=source.id).map((row)=>row.window));
  if(available.length!=1||available.single!=(start:start,end:end))throw StateError('Destination occupied');
  return [for(final row in current)if(row.id==source.id)
    (id:row.id,title:row.title,window:(start:start,end:end)) else row];
}

List<StudyBlock> readStudyBlocks(SharedPreferences prefs,String key){
  final rows=jsonDecode(prefs.getString(key)??'[]') as List;
  return [for(final row in rows)(id:row['id'] as String,title:row['title'] as String,
    window:(start:DateTime.parse(row['start'] as String).toUtc(),end:DateTime.parse(row['end'] as String).toUtc()))];
}

class CampusCalendar extends StatefulWidget {
  final CampusApi api;
  final String accountKey;
  const CampusCalendar({super.key,required this.api,required this.accountKey});
  @override
  State<CampusCalendar> createState()=>_CampusCalendarState();
}

class _CampusCalendarState extends State<CampusCalendar> {
  DateTime selected=campusDate(DateTime.now());
  bool conflictsOnly=false;
  int minimumGap=30,blockMinutes=30;
  final topic=TextEditingController();
  List<StudyBlock> studyBlocks=[];
  bool savingBlock=false;
  String get blockKey=>'study-blocks:${widget.accountKey}';
  (int,int) searchHours=(8,18);
  bool month=false, weeklyAgenda=false, loading=true;
  final sources=CalendarSource.values.toSet();
  final search=TextEditingController();
  int eventRequest=0;
  bool eventLoading=true,eventFailed=false;
  String group='', warning='';
  CalendarFeeds feeds=const CalendarFeeds([],[],[]);

  @override
  void initState(){super.initState();load();}
  @override
  void dispose(){search.dispose();topic.dispose();super.dispose();}

  Future<void> load() async {
    setState(()=>loading=true);
    List<CampusTimetableSlot> slots=[];
    loadEvents();
    List<Assignment> deadlines=[];
    String groupLabel='';
    final errors=<String>[];
    await Future.wait([
      () async {
        try{studyBlocks=readStudyBlocks(await SharedPreferences.getInstance(),blockKey);}
        catch(_){errors.add('Saved study blocks unavailable.');}
      }(),
      () async {
        try{
          final groups=await widget.api.getTimetableGroups();
          if(groups.isEmpty)return;
          final prefs=await SharedPreferences.getInstance();
          final key=prefs.getString('timetable-group:${widget.accountKey}');
          final selectedGroup=groups.where((g)=>g.key==key).firstOrNull??groups.first;
          groupLabel=selectedGroup.label;
          slots=await widget.api.getTimetableSlots(selectedGroup);
        }catch(_){errors.add('Timetable unavailable.');}
      }(),
      () async {
        try{
          final prefs=await SharedPreferences.getInstance();
          final rows=jsonDecode(prefs.getString('assignments:${widget.accountKey}')??'[]') as List;
          deadlines=[for(final row in rows)Assignment.fromJson(row)];
        }catch(_){errors.add('Personal deadlines unavailable.');}
      }(),
    ]);
    if(!mounted)return;
    setState((){
      feeds=CalendarFeeds(slots,feeds.events,deadlines);
      warning=errors.join(' ');group=groupLabel;loading=false;
    });
  }

  DateTime get firstDay=>calendarMonday(month?DateTime.utc(selected.year,selected.month):selected);

  Future<void> loadEvents() async {
    final request=++eventRequest;
    final from=firstDay,to=from.add(Duration(days:month?41:6));
    setState((){
      eventLoading=true;eventFailed=false;
      feeds=CalendarFeeds(feeds.slots,[],feeds.deadlines);
    });
    try{
      final events=<String,CampusEvent>{};
      for(var page=1;;page++){
        final batch=await widget.api.calendarEventPage(from,to,page);
        if(!mounted || request!=eventRequest)return;
        for(final event in batch){events[event.id]=event;}
        if(batch.length<100)break;
      }
      setState(()=>feeds=CalendarFeeds(feeds.slots,events.values.toList(),feeds.deadlines));
    }catch(_){
      if(mounted && request==eventRequest)setState(()=>eventFailed=true);
    }finally{
      if(mounted && request==eventRequest)setState(()=>eventLoading=false);
    }
  }

  void navigate(DateTime date,bool monthView){
    if(date.year<2000 || date.year>2099)return;
    final oldStart=firstDay,oldMonth=month;
    setState((){selected=date;month=monthView;});
    if(firstDay!=oldStart || month!=oldMonth)loadEvents();
  }

  Future<void> exportWeek() async {
    final contents=weeklyCalendar(selected,feeds,sources,DateTime.now());
    String? message;
    if(contents==null){
      message='No calendar items to export for this week.';
    }else{
      try{
        final directory=await getTemporaryDirectory();
        final monday=_label(calendarMonday(selected));
        final file=File('${directory.path}/campusconnect-week-$monday-${const Uuid().v4()}.ics');
        await file.writeAsString(contents,flush:true);
        final result=await OpenFilex.open(file.path,type:'text/calendar',uti:'com.apple.ical.ics');
        if(result.type!=ResultType.done)message='Open this file with a compatible calendar app.';
      }catch(_){message='Could not open the weekly calendar.';}
    }
    if(mounted && message!=null)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(message)));
  }

  Future<void> jumpToDate() async {
    final date=await showDatePicker(context:context,initialDate:selected,
      firstDate:DateTime(2000),lastDate:DateTime(2099,12,31));
    if(mounted && date!=null)navigate(DateTime.utc(date.year,date.month,date.day),month);
  }

  void showConflictDetails(AgendaItem item,List<AgendaItem> rows){
    final pairs=overlapDetails(item,rows);
    String clock(DateTime time)=>time.toUtc().add(const Duration(hours:5)).toIso8601String().substring(11,19);
    showDialog<void>(context:context,builder:(context)=>AlertDialog(
      title:Text('Conflicts with ${item.title}'),
      content:SizedBox(width:400,child:ListView.builder(shrinkWrap:true,itemCount:pairs.length,
        itemBuilder:(context,index){
          final pair=pairs[index];
          return ListTile(title:Text(pair.other.title),subtitle:Text([
            _labels[pair.other.source]!,
            '${clock(pair.start)}–${clock(pair.end)} PKT',
            durationLabel(pair.end.difference(pair.start).inMilliseconds),
          ].join(' · ')));
        })),
      actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))],
    ));
  }

  void move(int step)=>navigate(month?shiftCalendarMonth(selected,step):selected.add(Duration(days:7*step)),month);

  @override
  Widget build(BuildContext context){
    final first=calendarMonday(month?DateTime.utc(selected.year,selected.month):selected);
    final week=calendarMonday(selected);
    final agendaDays=weeklyAgenda?List.generate(7,(i)=>week.add(Duration(days:i))):[selected];
    final days=List.generate(month?42:7,(i)=>first.add(Duration(days:i)));
    final rows={for(final day in days) day:feeds.agenda(day,sources)};
    final conflictDays=days.where((day)=>rows[day]!.any((item)=>item.conflict)).toList();
    final nextConflict=conflictDays.where((day)=>day.isAfter(selected)).firstOrNull
      ??conflictDays.where((day)=>day!=selected).firstOrNull;
    final previousConflict=conflictDays.reversed.where((day)=>day.isBefore(selected)).firstOrNull
      ??conflictDays.reversed.where((day)=>day!=selected).firstOrNull;
    final summaries={for(final day in agendaDays) day:conflictSummary(rows[day]??[])};
    final weeklyDuration=days.where((day)=>calendarMonday(day)==week).fold<int>(0,(total,day)=>
      total+(summaries[day]??conflictSummary(rows[day]!)).milliseconds);
    final weeklyCount=conflictDays.where((day)=>calendarMonday(day)==week).length;
    final term=weeklyAgenda?search.text.trim().toLowerCase():'';
    final agenda={for(final day in agendaDays) day:(rows[day]??<AgendaItem>[]).where((r)=>
      (!conflictsOnly||r.conflict)&&(r.title.toLowerCase().contains(term)||r.detail.toLowerCase().contains(term))).toList()};
    final ready=!loading&&!eventLoading&&!eventFailed&&warning.isEmpty;
    return Scaffold(appBar:AppBar(title:const Text('Campus calendar'),actions:[
      IconButton(tooltip:'Export selected week (.ics)',onPressed:loading||eventLoading||eventFailed||warning.isNotEmpty?null:exportWeek,
        icon:const Icon(Icons.file_download)),
      IconButton(tooltip:'Refresh calendar',onPressed:loading?null:load,icon:const Icon(Icons.refresh)),
    ]),body:ListView(padding:const EdgeInsets.all(16),children:[
      if(loading||eventLoading)const LinearProgressIndicator(),
      if(warning.isNotEmpty)Text(warning),
      if(group.isNotEmpty)Text('Weekly classes · $group'),
      if(eventFailed)const Text('Campus events unavailable. Refresh to retry.'),
      Wrap(spacing:8,children:[
        for(final value in [false,true])ChoiceChip(label:Text(value?'Month':'Week'),selected:month==value,
          onSelected:(_)=>navigate(selected,value)),
        TextButton(onPressed:jumpToDate,child:const Text('Jump to date')),
        TextButton(onPressed:()=>navigate(campusDate(DateTime.now()),month),child:const Text('Today')),
      ]),
      Row(children:[
        IconButton(tooltip:'Previous period',onPressed:()=>move(-1),icon:const Icon(Icons.chevron_left)),
        Expanded(child:Text(month?_label(selected).substring(0,7):'Week of ${_label(week)}',textAlign:TextAlign.center)),
        IconButton(tooltip:'Next period',onPressed:()=>move(1),icon:const Icon(Icons.chevron_right)),
      ]),
      Row(children:[for(final day in _days)Expanded(child:Center(child:Text(day)))]),
      for(var row=0;row<(month?6:1);row++)Row(children:[
        for(var col=0;col<7;col++)Expanded(child:dayButton(days[row*7+col],rows[days[row*7+col]]!)),
      ]),
      Wrap(spacing:6,children:[for(final source in CalendarSource.values)
        FilterChip(label:Text(_labels[source]!),selected:sources.contains(source),
          onSelected:(on)=>setState((){if(on){sources.add(source);}else{sources.remove(source);}}))]),
      Wrap(spacing:8,children:[
        FilterChip(label:const Text('Conflicts only'),selected:conflictsOnly,
          onSelected:(on)=>setState(()=>conflictsOnly=on)),
        TextButton(onPressed:ready && previousConflict!=null?()=>navigate(previousConflict,month):null,
          child:const Text('Previous conflict day')),
        TextButton(onPressed:ready && nextConflict!=null?()=>navigate(nextConflict,month):null,
          child:const Text('Next conflict day')),
      ]),
      if(ready)Text('Days with scheduling conflicts this week: $weeklyCount'),
      if(ready)Text('Time with overlapping items this week: ${durationLabel(weeklyDuration)}'),
      SwitchListTile(title:const Text('Search whole week'),value:weeklyAgenda,onChanged:(v)=>setState(()=>weeklyAgenda=v)),
      if(weeklyAgenda)TextField(controller:search,decoration:const InputDecoration(labelText:'Search weekly agenda'),
        onChanged:(_)=>setState((){})),
      if(ready)freeTimeFinder(week),
      for(final entry in agenda.entries)if(entry.value.isNotEmpty || !weeklyAgenda)...[
        Text('${_label(entry.key)} · PKT',style:Theme.of(context).textTheme.titleMedium),
        if(ready)Text('Time with overlapping items: ${durationLabel(summaries[entry.key]!.milliseconds)} · Peak simultaneous items: ${summaries[entry.key]!.peak}'),
        for(final item in entry.value)ListTile(
          onTap:item.conflict?()=>showConflictDetails(item,rows[entry.key]!):null,
          trailing:item.conflict?const Icon(Icons.info_outline,semanticLabel:'Conflict details'):null,title:Text(item.title),subtitle:Text([
          _labels[item.source]!,if(item.conflict)'Scheduling conflict',if(item.time.isNotEmpty)item.time,if(item.detail.isNotEmpty)item.detail].join(' · '))),
      ],
      if(!loading && !eventLoading && !eventFailed && agenda.values.every((rows)=>rows.isEmpty))const Text('No matching items for this period.'),
    ]));
  }

  Future<List<AgendaItem>> currentCampusRows(DateTime day) async {
    final groups=await widget.api.getTimetableGroups();
    final prefs=await SharedPreferences.getInstance();
    final key=prefs.getString('timetable-group:${widget.accountKey}');
    final group=groups.where((row)=>row.key==key).firstOrNull??groups.firstOrNull;
    final slots=group==null?<CampusTimetableSlot>[]:await widget.api.getTimetableSlots(group);
    final week=calendarMonday(day),events=<CampusEvent>[];
    for(var page=1;;page++){
      final batch=await widget.api.calendarEventPage(week,week.add(const Duration(days:6)),page);
      events.addAll(batch);
      if(batch.length<100)break;
    }
    return CalendarFeeds(slots,events,[]).agenda(day,{CalendarSource.classes,CalendarSource.events});
  }

  Future<void> changeBlock(StudyBlock block,{bool remove=false,DateTime? moveTo}) async {
    if(savingBlock)return;
    setState(()=>savingBlock=true);
    try{
      final prefs=await SharedPreferences.getInstance();
      final campus=moveTo==null?<AgendaItem>[]:await currentCampusRows(campusDate(moveTo));
      if(moveTo!=null)await prefs.reload();
      final current=readStudyBlocks(prefs,blockKey);
      if(moveTo==null && !remove && current.any((row)=>row.window.start.isBefore(block.window.end)&&row.window.end.isAfter(block.window.start))){
        if(mounted)setState(()=>studyBlocks=current);
        throw StateError('Overlap');
      }
      final next=moveTo!=null?moveStudyBlock(current,block,moveTo,campus):[for(final row in current)if(!remove||row.id!=block.id)row,if(!remove)block];
      final saved=await prefs.setString(blockKey,jsonEncode([for(final row in next){
        'id':row.id,'title':row.title,'start':row.window.start.toIso8601String(),'end':row.window.end.toIso8601String()}]));
      if(!saved)throw StateError('Write failed');
      if(mounted)setState(()=>studyBlocks=next);
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not update this study block. Refresh and try again.')));
    }finally{if(mounted)setState(()=>savingBlock=false);}
  }

  Widget freeTimeFinder(DateTime week){
    final all=<({DateTime day,FreeWindow gap})>[];
    for(var index=0;index<7;index++){
      final day=week.add(Duration(days:index));
      final midnight=day.subtract(const Duration(hours:5));
      final gaps=freeWindows(feeds.agenda(day,{CalendarSource.classes,CalendarSource.events}),
        midnight.add(Duration(hours:searchHours.$1)),midnight.add(Duration(hours:searchHours.$2)),minimumGap,
        reservations:studyBlocks.map((row)=>row.window));
      for(final gap in gaps){all.add((day:day,gap:gap));}
    }
    final daily=all.where((item)=>item.day==selected);
    int length(FreeWindow gap)=>gap.end.difference(gap.start).inMilliseconds;
    String clock(DateTime value)=>value.toUtc().add(const Duration(hours:5)).toIso8601String().substring(11,19);
    String describe(FreeWindow gap)=>'${clock(gap.start)}–${clock(gap.end)} · ${durationLabel(length(gap))}';
    final total=all.fold<int>(0,(sum,item)=>sum+length(item.gap));
    final longest=all.isEmpty?null:all.reduce((a,b)=>length(b.gap)>length(a.gap)?b:a);
    final next=all.where((item)=>item.day.isAfter(selected)).firstOrNull;
    final scheduled=studyBlocks.where((row)=>calendarMonday(campusDate(row.window.start))==week).toList()
      ..sort((a,b)=>a.window.start.compareTo(b.window.start));
    return ExpansionTile(title:const Text('Free-time finder'),children:[
      const Text('Based on your timetable and published campus events. All times are in PKT.'),
      const Text('Minimum gap'),
      Wrap(children:[for(final minutes in [15,30,60,90])ChoiceChip(label:Text('$minutes min'),
        selected:minimumGap==minutes,onSelected:(_)=>setState(()=>minimumGap=minutes))]),
      const Text('Search hours'),
      Wrap(children:[for(final hours in [(8,18),(8,12),(12,18)])ChoiceChip(
        label:Text('${hours.$1}:00–${hours.$2}:00'),selected:searchHours==hours,
        onSelected:(_)=>setState(()=>searchHours=hours))]),
      Text('Free on ${_label(selected)}'),
      if(daily.isEmpty)const Text('No gaps match these settings on this day.'),
      TextField(controller:topic,maxLength:80,decoration:const InputDecoration(labelText:'Study topic',hintText:'Personal study')),
      const Text('Block length'),
      Wrap(children:[for(final minutes in [15,30,60,90])ChoiceChip(label:Text('$minutes minutes'),
        selected:blockMinutes==minutes,onSelected:(_)=>setState(()=>blockMinutes=minutes))]),
      const Text('Reserve the start of a gap. Blocks are saved for your account on this device.'),
      for(final item in daily)ListTile(title:Text(describe(item.gap)),trailing:TextButton(
        onPressed:savingBlock||length(item.gap)<blockMinutes*60000?null:()=>changeBlock((
          id:const Uuid().v4(),title:topic.text.trim().isEmpty?'Personal study':topic.text.trim(),
          window:(start:item.gap.start,end:item.gap.start.add(Duration(minutes:blockMinutes))))),
        child:Text('Reserve $blockMinutes min'))),
      const Text('Study blocks this week'),
      if(scheduled.isEmpty)const Text('No study blocks scheduled this week.'),
      for(final block in scheduled)ListTile(title:Text(block.title),
        subtitle:Text('${_label(campusDate(block.window.start))} · ${describe(block.window)} PKT'),
        onTap:savingBlock?null:()async{
          final choices=all.where((item)=>length(item.gap)>=length(block.window)).toList();
          final start=await showDialog<DateTime>(context:context,builder:(context)=>SimpleDialog(
            title:Text('Reschedule ${block.title}'),children:[
              if(choices.isEmpty)const Text('No matching gap this week.'),
              for(final item in choices)SimpleDialogOption(onPressed:()=>Navigator.pop(context,item.gap.start),
                child:Text('${_label(item.day)} · ${clock(item.gap.start)}–${clock(item.gap.start.add(block.window.end.difference(block.window.start)))} PKT')),
              SimpleDialogOption(onPressed:()=>Navigator.pop(context),child:const Text('Keep original time')),
            ]));
          if(mounted&&start!=null)await changeBlock(block,moveTo:start);
        },
        leading:const Icon(Icons.edit_calendar,semanticLabel:'Reschedule'),
        trailing:TextButton(onPressed:savingBlock?null:()=>changeBlock(block,remove:true),child:const Text('Cancel'))),
      Text('Matching free time this week: ${durationLabel(total)}'),
      if(longest!=null)Text('Longest gap this week: ${_label(longest.day)}, ${describe(longest.gap)}'),
      TextButton(onPressed:next==null?null:()=>navigate(next.day,month),child:const Text('Next available day this week')),
    ]);
  }

  Widget dayButton(DateTime day,List<AgendaItem> items){
    final count=items.length;
    final conflict=items.any((item)=>item.conflict);
    final active=day==selected;
    return Semantics(button:true,selected:active,label:'${_label(day)}, $count items${conflict?', scheduling conflict':''}',
      child:InkWell(onTap:()=>navigate(day,month),child:ExcludeSemantics(child:Container(
        constraints:const BoxConstraints(minHeight:48),alignment:Alignment.center,
        color:active?Theme.of(context).colorScheme.secondaryContainer:null,
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          Text('${day.day}',style:TextStyle(fontWeight:active?FontWeight.bold:FontWeight.normal,
            color:month && day.month!=selected.month?Theme.of(context).hintColor:null)),
          if(conflict)const Icon(Icons.warning_amber,size:14) else if(count>0)const Icon(Icons.circle,size:6),
        ])))));
  }
}
