import assert from 'node:assert/strict';
import {test} from 'node:test';
import {todaySchedule} from '../src/timetable-today.js';
import {todayAtCampus,sortAssignments,countdownLabel} from '../src/assignment-planner.js';
import {chooseTimetableGroup,groupId} from '../src/timetable-preference.js';
test('student overview resolves selected group and campus clock',()=>{
 const a={term:'Fall 2026',program:'BSE',semester:7,section:'A'};
 const b={...a,section:'B'};
 assert.deepEqual(chooseTimetableGroup([a,b],groupId(b)),b);
 const now=new Date('2026-11-23T04:30:00Z');
 const slots=[
  {id:'current',dayOfWeek:1,startTime:'09:00',endTime:'10:30'},
  {id:'next',dayOfWeek:1,startTime:'11:00',endTime:'12:00'}
 ];
 assert.equal(todayAtCampus(now),'2026-11-23');
 assert.equal(todaySchedule(slots,now).current.id,'current');
 assert.equal(todaySchedule(slots,now).next.id,'next');
});
test('student overview selects only own open tasks sorted by deadline',()=>{
 const entries=[
  {id:'a',title:'Old',due:'2026-11-20',priority:'low',done:false},
  {id:'b',title:'Finished',due:'2026-11-21',priority:'high',done:true},
  {id:'c',title:'Tomorrow',due:'2026-11-24',priority:'high',done:false}
 ];
 const list=sortAssignments(entries.filter(x=>!x.done)).slice(0,4);
 assert.deepEqual(list.map(x=>x.id),['a','c']);
 assert.equal(countdownLabel(list[0],'2026-11-23'),'3 days overdue');
});