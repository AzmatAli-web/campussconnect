import test from 'node:test';
import assert from 'node:assert/strict';
import {freeWindows,overlapDetails,conflictSummary,durationLabel,weeklyCalendarFile,addCampusDays,campusWeekStart,calendarDates,moveCalendar,eventCampusStamp,itemsOnCampusDay,calendarToday} from '../src/campus-calendar.js';

test('Monday-based weeks and 42-day month grid cross year boundaries cleanly',()=>{
 assert.equal(campusWeekStart('2026-11-23'),'2026-11-23');
 assert.equal(campusWeekStart('2027-01-01'),'2026-12-28');
 assert.deepEqual(calendarDates('week','2027-01-01'),[
  '2026-12-28','2026-12-29','2026-12-30','2026-12-31',
  '2027-01-01','2027-01-02','2027-01-03'
 ]);
 const grid=calendarDates('month','2027-01-12');
 assert.equal(grid.length,42);
 assert.equal(grid[0],'2026-12-28');
 assert.equal(grid[41],'2027-02-07');
 assert.equal(moveCalendar('month','2026-12-10',1),'2027-01-01');
 assert.equal(moveCalendar('month','2027-01-12',-1),'2026-12-01');
 assert.equal(moveCalendar('week','2026-12-31',1),'2027-01-07');
 assert.equal(addCampusDays('2028-02-28',1),'2028-02-29');
 assert.equal(addCampusDays('2028-02-29',1),'2028-03-01');
 assert.equal(campusWeekStart('2027-02-29'),null);
 assert.deepEqual(calendarDates('day','2026-11-23'),[]);
});
test('event timestamps are displayed using campus timezone not browser UTC date',()=>{
 assert.deepEqual(eventCampusStamp('2026-11-22T19:30:00Z'),{day:'2026-11-23',time:'00:30'});
 assert.equal(calendarToday(new Date('2026-11-22T19:00:00Z')),'2026-11-23');
 assert.equal(eventCampusStamp('invalid'),null);
});
test('combines weekly recurring classes, published events and open personal deadlines only',()=>{
 const fixtures={
  slots:[
   {id:'slot-a',dayOfWeek:1,startTime:'09:00',courseCode:'CSC494',courseTitle:'Project',room:'Room A'},
   {id:'slot-w',dayOfWeek:3,startTime:'09:00',courseTitle:'Wednesday lesson'},
  ],
  events:[
   {id:'event-a',status:'published',startsAt:'2026-11-23T06:00:00Z',title:'Tech talk',venue:'Auditorium'},
   {id:'event-b',status:'cancelled',startsAt:'2026-11-23T07:00:00Z',title:'Cancelled talk'},
   {id:'event-c',status:'published',startsAt:'2026-11-22T19:30:00Z',title:'Early event'},
  ],
  assignments:[
   {id:'personal-a',due:'2026-11-23',title:'Research',priority:'high',done:false},
   {id:'personal-b',due:'2026-11-23',title:'Completed',priority:'medium',done:true},
   {id:'personal-other',due:'2026-11-24',title:'Tomorrow',priority:'low',done:false},
  ]
 };
 const monday=itemsOnCampusDay('2026-11-23',fixtures);
 assert.deepEqual(monday.map(x=>x.kind),['event','class','event','assignment']);
 assert.deepEqual(monday.map(x=>x.title),['Early event','Project','Tech talk','Research']);
 assert.equal(itemsOnCampusDay('2026-11-24',fixtures).length,1);
 assert.deepEqual(itemsOnCampusDay('2026-11-30',fixtures).map(x=>x.kind),['class']);
 assert.deepEqual(itemsOnCampusDay('2026-11-25',fixtures).map(x=>x.kind),['class']);
 assert.deepEqual(itemsOnCampusDay('2026-11-26',fixtures),[]);
});

test('an event carries across the year and stops at its exclusive PKT midnight',()=>{
 const events=[{id:'festival',status:'published',startsAt:'2026-12-31T16:00:00Z',
  endsAt:'2027-01-02T19:00:00Z',venue:'Main hall'}];
 assert.equal(itemsOnCampusDay('2026-12-31',{events})[0].time,'21:00');
 for(const day of ['2027-01-01','2027-01-02']){
  assert.equal(itemsOnCampusDay(day,{events})[0].detail,'Continues from an earlier day · Main hall');
 }
 assert.deepEqual(itemsOnCampusDay('2027-01-03',{events}),[]);
});

test('weekly export combines selected categories and includes overlapping events once',()=>{
 const slot={id:'s1',dayOfWeek:1,startTime:'09:00',endTime:'10:00',courseTitle:'Algorithms'};
 const event={id:'e1',status:'published',title:'Festival',startsAt:'2027-01-02T12:00:00Z',endsAt:'2027-01-05T12:00:00Z'};
 const task={id:'a1',done:false,title:'Essay',due:'2027-01-10'};
 const file=weeklyCalendarFile('2027-01-06',[slot],[event,event],[task,{...task,id:'late',due:'2027-01-11'}],
  {class:true,event:true,assignment:true});
 assert.equal(file.name,'campusconnect-week-2027-01-04.ics');
 assert.equal(file.contents.match(/BEGIN:VEVENT/g).length,3);
 for(const expected of ['DTSTART:20270104T040000Z','DTSTART:20270102T120000Z','DTEND;VALUE=DATE:20270111'])
  assert.ok(file.contents.includes(expected));
 assert.equal(weeklyCalendarFile('2027-01-06',[slot],[event],[task],{}),null);
});

test('clashes include nested and overnight intervals, excluding touching items and deadlines',()=>{
 const slot={id:'slot',courseTitle:'Class',dayOfWeek:1,startTime:'09:00',endTime:'10:00'};
 const events=[
  ['overnight','2027-01-03T18:00:00Z','2027-01-04T04:30:00Z'],
  ['inside','2027-01-04T04:10:00Z','2027-01-04T04:20:00Z'],
  ['touch','2027-01-04T05:00:00Z','2027-01-04T06:00:00Z'],
 ].map(([id,startsAt,endsAt])=>({id,title:id,startsAt,endsAt,status:'published'}));
 const day='2027-01-04';
 const items=itemsOnCampusDay(day,{slots:[slot],events,assignments:[{due:day,id:'a',title:'Task',done:false}]});
 assert.deepEqual(items.filter(r=>r.conflict).map(r=>r.title).sort(),['Class','inside','overnight']);
 assert.equal(itemsOnCampusDay(day,{slots:[slot]}).some(r=>r.conflict),false);
});

test('conflict details keep individual intersections while totals count shared time once',()=>{
 const items=[[0,60],[10,50],[20,40],[60,80]].map(([start,end],i)=>({
  title:String(i),kind:'event',start:start*60000,end:end*60000
 }));
 assert.deepEqual(overlapDetails(items[0],items).map(p=>[p.title,p.start/60000,p.end/60000]),[['1',10,50],['2',20,40]]);
 assert.deepEqual(conflictSummary(items),{peak:3,duration:2400000});
 assert.deepEqual(conflictSummary([items[0],items[3]]),{peak:1,duration:0});
 assert.equal(durationLabel(90500),'1 min 31 sec');
});

test('free windows merge busy periods and include gaps that exactly meet the minimum',()=>{
 const minute=60000;
 const busy=[[-600,10],[5,20],[50,65],[65,80],[115,180]].map(([start,end])=>({start:start*minute,end:end*minute}));
 busy.push({title:'Deadline'});
 const gaps=freeWindows(busy,0,120*minute,30);
 assert.deepEqual(gaps.map(g=>[g.start/minute,g.end/minute]),[[20,50],[80,115]]);
 assert.deepEqual(freeWindows(busy,0,120*minute,60),[]);
 assert.deepEqual(freeWindows([],0,120*minute,30),[{start:0,end:120*minute}]);
});
