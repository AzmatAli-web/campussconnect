import test from 'node:test';
import assert from 'node:assert/strict';
import {addCampusDays,campusWeekStart,calendarDates,moveCalendar,eventCampusStamp,itemsOnCampusDay,calendarToday} from '../src/campus-calendar.js';

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
