import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTimetableSlot,timetableGroupFilter,timetableView} from '../src/services/timetable-validation.js';

const example={
 term:'Fall 2026',program:'BSE',semester:7,section:'A',dayOfWeek:1,
 startTime:'08:00',endTime:'09:30',courseCode:'CSC494',
 courseTitle:'Software Project Management',
 instructorName:'Test Lecturer',room:'Lab 201'
};
test('quarter-hour keys cover class interval without gaps',()=>{
 const row=normalizeTimetableSlot(example);
 assert.deepEqual(row.slotKeys,[480,495,510,525,540,555]);
 assert.equal(row.programKey,'BSE');
 assert.equal(row.semester,7);
 assert.equal(row.termKey,'fall 2026');
});
test('invalid times or semester are rejected',()=>{
 for(const bad of [
  {startTime:'08:10'}, {startTime:'09:30'},{endTime:'08:00'},
  {startTime:'05:45'}, {endTime:'22:30'},
  {dayOfWeek:8}, {semester:'7'}, {program:'BSE$'},
  {section:'A<script>'},{fakeField:'forbidden'}
 ]){
  assert.throws(()=>normalizeTimetableSlot({...example,...bad}));
 }
});
test('group query requires all cohort identifiers',()=>{
 assert.deepEqual(
  timetableGroupFilter({term:' Fall 2026 ',program:' bse ',semester:'7',section:' a '}),
  {termKey:'fall 2026',programKey:'BSE',semester:7,sectionKey:'A'}
 );
 assert.throws(()=>timetableGroupFilter({program:'BSE'}));
 assert.throws(()=>timetableGroupFilter({term:'Fall 2026',program:'BSE',semester:7,section:'A',other:'xx'}));
});
test('timetable projection never exposes staff IDs, internal slot keys or Mongo data',()=>{
 const doc={_id:'fixture-id',...normalizeTimetableSlot(example),
  publishedBy:'private-staff-id',universityId:'private-university-id',
  slotKeys:[480,495,510,525,540,555]};
 const view=timetableView(doc);
 assert.equal(view.startTime,example.startTime);
 assert.equal(view.endTime,example.endTime);
 for(const field of ['publishedBy','universityId','slotKeys','termKey','sectionKey']){
  assert.equal(Object.hasOwn(view,field),false);
 }
});
