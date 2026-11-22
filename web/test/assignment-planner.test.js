import assert from 'node:assert/strict';
import {test} from 'node:test';
import {navigationFor} from '../src/dashboard-domain.js';
import {MAX_ASSIGNMENTS,assignmentFields,assignmentStatus,plannerKey,readAssignments,todayAtCampus,writeAssignments} from '../src/assignment-planner.js';

const student={status:'active',activeRoles:['student'],_id:'a'.repeat(24),universityId:'b'.repeat(24)};
const fields={title:'Programming assignment',course:'SCD',due:'2028-02-29'};
const make=id=>({id:'12345678-0000-0000-0000-'+ id.toString(16).padStart(12,'0'),...fields,done:false});

test('planner navigation is student-only and browser records are campus/account scoped',()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const key=plannerKey(student);
 assert.ok(navigationFor(student).some(item=>item.id==='assignments'));
 for(const profile of [{...student,activeRoles:['admin']},{...student,status:'suspended'}]){
  assert.ok(!navigationFor(profile).some(item=>item.id==='assignments'));
  assert.equal(plannerKey(profile),null);
 }
 assert.equal(writeAssignments(key,[make(1)],storage),true);
 assert.deepEqual(readAssignments(key,storage),[make(1)]);
 assert.deepEqual(readAssignments(plannerKey({...student,_id:'c'.repeat(24)}),storage),[]);
 assert.deepEqual(readAssignments(plannerKey({...student,universityId:'c'.repeat(24)}),storage),[]);
 assert.deepEqual(readAssignments(key,{getItem:()=>'{'}),[]);
 assert.equal(writeAssignments(key,[make(1)],{setItem(){throw Error('disabled');}}),false);
 const items=Array.from({length:MAX_ASSIGNMENTS+1},(_,i)=>make(i));
 assert.equal(writeAssignments(key,items,storage),false);
 assert.equal(readAssignments(key,{getItem:()=>JSON.stringify([null,make(1),make(1),...items])}).length,MAX_ASSIGNMENTS);
});

test('validates real calendar dates and computes due status at midnight PKT',()=>{
 assert.deepEqual(assignmentFields({...fields,title:' '+fields.title+' '}),fields);
 for(const due of ['2027-02-29','2028-02-30','2028-00-01','2028-2-01','2028-02-29T00:00Z']) {
  assert.throws(()=>assignmentFields({...fields,due}));
 }
 assert.throws(()=>assignmentFields({...fields,title:'   '}));
 assert.equal(todayAtCampus(new Date('2028-02-28T18:59:59Z')),'2028-02-28');
 assert.equal(todayAtCampus(new Date('2028-02-28T19:00:00Z')),'2028-02-29');
 assert.equal(assignmentStatus(make(1),'2028-02-28'),'upcoming');
 assert.equal(assignmentStatus(make(1),'2028-02-29'),'today');
 assert.equal(assignmentStatus(make(1),'2028-03-01'),'overdue');
 assert.equal(assignmentStatus({...make(1),done:true},'2028-03-01'),'completed');
});

import {buildAssignmentCalendar} from '../src/assignment-calendar.js';

test('calendar exports open local deadlines as all-day events without profile or completed items',()=>{
 const first=make(1), completed={...make(2),done:true,title:'Private completed work'};
 const file=buildAssignmentCalendar([first,completed],new Date('2026-11-22T10:20:00Z'));
 assert.equal(file.name,'campusconnect-assignment-deadlines.ics');
 assert.equal(file.count,1);
 assert.match(file.contents,/DTSTART;VALUE=DATE:20280229\r\n/);
 assert.match(file.contents,/DTEND;VALUE=DATE:20280301\r\n/);
 assert.match(file.contents,/SUMMARY:Programming assignment\r\n/);
 assert.match(file.contents,/DESCRIPTION:Course: SCD\r\n/);
 assert.doesNotMatch(file.contents,/Private completed work|@campus.example|BEARER|TOKEN/i);
 assert.equal(buildAssignmentCalendar([completed]),null);
});

test('calendar escapes untrusted text and folds unicode lines at 75 UTF-8 octets',()=>{
 const item={...make(3),title:'Lecture, plan;\\notes\n'+'☃'.repeat(35),due:'2028-12-31'};
 const file=buildAssignmentCalendar([item],new Date('2026-11-22T00:00:00Z'));
 assert.match(file.contents,/DTEND;VALUE=DATE:20290101/);
 assert.match(file.contents,/SUMMARY:Lecture\\, plan\\;\\\\notes\\n/);
 for(const line of file.contents.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75);
});
