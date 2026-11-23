import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Event,EventRegistration,Announcement
} from '../src/models/campus-content.js';
import {AdminBootstrap} from '../src/models/governance.js';
import {TimetableSlot} from '../src/models/timetable.js';
import {AcademicResource} from '../src/models/academic-resource.js';

const names=(model)=>model.schema.indexes().map(([key])=>Object.keys(key).join(','));
const has=(model,columns)=>names(model).includes(columns.join(','));

test('my registrations use a campus/student/recency index',()=>{
 assert.ok(has(EventRegistration,[
   'universityId','studentId','confirmedAt','_id'
 ]));
 const unique=EventRegistration.schema.indexes().find(([fields])=>
   Object.keys(fields).join(',')==='eventId,studentId');
 assert.equal(unique?.[1]?.unique,true);
});
test('event and announcement feeds have stable sort keys',()=>{
 assert.ok(has(Event,['universityId','status','startsAt','_id']));
 assert.ok(has(Event,['universityId','organizerId','startsAt','_id']));
 assert.ok(has(Announcement,['universityId','status','publishedAt','_id']));
 assert.ok(has(EventRegistration,['universityId','eventId','confirmedAt','_id']));
});
test('bootstrap has only one university uniqueness definition',()=>{
 const indexes=AdminBootstrap.schema.indexes()
   .filter(([cols])=>Object.keys(cols).join(',')==='universityId');
 assert.equal(indexes.length,1);
 assert.equal(indexes[0][1].unique,true);
});
test('timetable and resource schemas avoid redundant single-university indexes',()=>{
 for(const model of [TimetableSlot,AcademicResource]){
  assert.equal(has(model,['universityId']),false);
  assert.ok(names(model).some(n=>n.startsWith('universityId,')));
 }
 const conflict=TimetableSlot.schema.indexes().find(([fields])=>
   Object.keys(fields).includes('slotKeys'));
 assert.equal(conflict?.[1]?.unique,true);
});
