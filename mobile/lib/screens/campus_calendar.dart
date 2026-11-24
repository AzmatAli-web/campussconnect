import 'dart:convert';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/campus_models.dart';
import '../services/assignments.dart';
import '../services/campus_api.dart';
import '../services/campus_calendar.dart';

const _labels={CalendarSource.classes:'Classes',CalendarSource.events:'Events',CalendarSource.deadlines:'Deadlines'};
const _days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
String _label(DateTime day)=>day.toIso8601String().substring(0,10);

class CampusCalendar extends StatefulWidget {
  final CampusApi api;
  final String accountKey;
  const CampusCalendar({super.key,required this.api,required this.accountKey});
  @override
  State<CampusCalendar> createState()=>_CampusCalendarState();
}

class _CampusCalendarState extends State<CampusCalendar> {
  DateTime selected=campusDate(DateTime.now());
  bool month=false, weeklyAgenda=false, loading=true;
  final sources=CalendarSource.values.toSet();
  final search=TextEditingController();
  String group='', warning='';
  CalendarFeeds feeds=const CalendarFeeds([],[],[]);

  @override
  void initState(){super.initState();load();}
  @override
  void dispose(){search.dispose();super.dispose();}

  Future<void> load() async {
    setState(()=>loading=true);
    List<CampusTimetableSlot> slots=[];
    List<CampusEvent> events=[];
    List<Assignment> deadlines=[];
    String groupLabel='';
    final errors=<String>[];
    await Future.wait([
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
        try{events=await widget.api.getEvents();}
        catch(_){errors.add('Campus events unavailable.');}
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
      feeds=CalendarFeeds(slots,events,deadlines);
      warning=errors.join(' ');group=groupLabel;loading=false;
    });
  }

  void move(int step) => setState(()=>selected=month?shiftCalendarMonth(selected,step):selected.add(Duration(days:7*step)));

  @override
  Widget build(BuildContext context){
    final first=calendarMonday(month?DateTime.utc(selected.year,selected.month):selected);
    final week=calendarMonday(selected);
    final agendaDays=weeklyAgenda?List.generate(7,(i)=>week.add(Duration(days:i))):[selected];
    final agenda={for(final day in agendaDays) day:feeds.agenda(day,sources,query:weeklyAgenda?search.text:'')};
    return Scaffold(appBar:AppBar(title:const Text('Campus calendar'),actions:[
      IconButton(tooltip:'Refresh calendar',onPressed:loading?null:load,icon:const Icon(Icons.refresh)),
    ]),body:ListView(padding:const EdgeInsets.all(16),children:[
      if(loading)const LinearProgressIndicator(),
      if(warning.isNotEmpty)Text(warning),
      if(group.isNotEmpty)Text('Weekly classes · $group'),
      if(feeds.events.length>=100)const Text('The calendar includes the first 100 published events.'),
      Wrap(spacing:8,children:[
        for(final value in [false,true])ChoiceChip(label:Text(value?'Month':'Week'),selected:month==value,
          onSelected:(_)=>setState(()=>month=value)),
        TextButton(onPressed:()=>setState(()=>selected=campusDate(DateTime.now())),child:const Text('Today')),
      ]),
      Row(children:[
        IconButton(tooltip:'Previous period',onPressed:()=>move(-1),icon:const Icon(Icons.chevron_left)),
        Expanded(child:Text(month?_label(selected).substring(0,7):'Week of ${_label(week)}',textAlign:TextAlign.center)),
        IconButton(tooltip:'Next period',onPressed:()=>move(1),icon:const Icon(Icons.chevron_right)),
      ]),
      Row(children:[for(final day in _days)Expanded(child:Center(child:Text(day)))]),
      for(var row=0;row<(month?6:1);row++)Row(children:[
        for(var col=0;col<7;col++)Expanded(child:dayButton(first.add(Duration(days:row*7+col)))),
      ]),
      Wrap(spacing:6,children:[for(final source in CalendarSource.values)
        FilterChip(label:Text(_labels[source]!),selected:sources.contains(source),
          onSelected:(on)=>setState((){if(on){sources.add(source);}else{sources.remove(source);}}))]),
      SwitchListTile(title:const Text('Search whole week'),value:weeklyAgenda,onChanged:(v)=>setState(()=>weeklyAgenda=v)),
      if(weeklyAgenda)TextField(controller:search,decoration:const InputDecoration(labelText:'Search weekly agenda'),
        onChanged:(_)=>setState((){})),
      for(final entry in agenda.entries)if(entry.value.isNotEmpty || !weeklyAgenda)...[
        Text('${_label(entry.key)} · PKT',style:Theme.of(context).textTheme.titleMedium),
        for(final item in entry.value)ListTile(title:Text(item.title),subtitle:Text([
          _labels[item.source]!,if(item.time.isNotEmpty)item.time,if(item.detail.isNotEmpty)item.detail].join(' · '))),
      ],
      if(!loading && agenda.values.every((rows)=>rows.isEmpty))const Text('No matching items for this period.'),
    ]));
  }

  Widget dayButton(DateTime day){
    final count=feeds.agenda(day,sources).length;
    final active=day==selected;
    return Semantics(button:true,selected:active,label:'${_label(day)}, $count items',
      child:InkWell(onTap:()=>setState(()=>selected=day),child:ExcludeSemantics(child:Container(
        constraints:const BoxConstraints(minHeight:48),alignment:Alignment.center,
        color:active?Theme.of(context).colorScheme.secondaryContainer:null,
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          Text('${day.day}',style:TextStyle(fontWeight:active?FontWeight.bold:FontWeight.normal,
            color:month && day.month!=selected.month?Theme.of(context).hintColor:null)),
          if(count>0)const Icon(Icons.circle,size:6),
        ])))));
  }
}
