import test from 'node:test';
import assert from 'node:assert/strict';
import {eventInput,registrationInput,announcementInput,availability,pagination,eventBrowseQuery} from '../src/services/mvp-validation.js';

const now=new Date('2026-10-30T12:00:00Z');
const event={
 title:'CS Department Seminar',description:'A seminar about software engineering practices.',
 venue:'Main Auditorium',startsAt:'2026-11-02T10:00:00Z',endsAt:'2026-11-02T12:00:00Z',
 registrationOpensAt:'2026-10-30T10:00:00Z',registrationClosesAt:'2026-11-01T10:00:00Z',capacity:10
};
test('validates event chronology and converts ISO dates',()=>{
 const e=eventInput(event,now);
 assert.equal(e.capacity,10);assert.ok(e.startsAt instanceof Date);
});
test('rejects over-capacity and unknown fields',()=>{
 assert.throws(()=>eventInput({...event,capacity:100001},now),{code:'INVALID_CAPACITY'});
 assert.throws(()=>eventInput({...event,organizerId:'admin'},now),{code:'UNKNOWN_FIELD'});
});
test('rejects invalid chronological dates and timezone-free dates',()=>{
 assert.throws(()=>eventInput({...event,registrationClosesAt:'2026-11-02T11:00:00Z'},now),{code:'INVALID_EVENT_DATES'});
 assert.throws(()=>eventInput({...event,startsAt:'2026-11-02T10:00:00'},now),{code:'INVALID_DATE'});
});
test('registration form must match authenticated email',()=>{
 const r=registrationInput({universityEmail:'TEST@cuiatd.edu.pk'},'test@cuiatd.edu.pk','FA23-BSE-024');
 assert.equal(r.universityEmailNormalized,'test@cuiatd.edu.pk');
 assert.throws(()=>registrationInput({universityEmail:'other@cuiatd.edu.pk'},'test@cuiatd.edu.pk'),{code:'EMAIL_MISMATCH'});
});
test('registration number must match existing profile when present',()=>{
 assert.throws(()=>registrationInput({universityEmail:'test@cuiatd.edu.pk',registrationNo:'FA23-BSE-999'},'test@cuiatd.edu.pk','FA23-BSE-024'),{code:'REGISTRATION_MISMATCH'});
});
test('availability requires capacity and open time window',()=>{
 const e={...eventInput(event,now),confirmedCount:10,status:'published'};
 assert.equal(availability(e,now).registrationOpen,false);
 assert.equal(availability({...e,confirmedCount:9},now).registrationOpen,true);
});
test('announcements reject cross-target scope and actor-controlled fields',()=>{
 assert.throws(()=>announcementInput({title:'Hello everyone',body:'Important announcement',scope:'university',societyId:'6ae43793f5a4a7f228330ca7'}),{code:'INVALID_SCOPE'});
 assert.throws(()=>announcementInput({title:'Hello everyone',body:'Important announcement',scope:'university',authorId:'bad'}),{code:'UNKNOWN_FIELD'});
});
test('pagination is bounded',()=>{
 assert.deepEqual(pagination({page:'2',limit:'10'}),{page:2,limit:10,skip:10});
 assert.throws(()=>pagination({limit:'1000'}),{code:'INVALID_PAGINATION'});
});

test('event discovery queries stay bounded and interpret punctuation as literal text',()=>{
 const result=eventBrowseQuery({q:' Lab (A) [2] ',when:'upcoming',page:'2',limit:'12'},now);
 assert.equal(result.skip,12);
 assert.deepEqual(result.filter.endsAt,{$gt:now});
 assert.equal(result.filter.$or[0].title.$options,'i');
 assert.equal(new RegExp(result.filter.$or[0].title.$regex).test('Lab (A) [2]'),true);
 assert.equal(new RegExp(result.filter.$or[1].venue.$regex).test('Lab A 2'),false);
 const historic=eventBrowseQuery({when:'past'},now);
 assert.deepEqual(historic.filter, {endsAt:{$lte:now}});
 assert.deepEqual(historic.sort, {startsAt:-1,_id:-1});
 assert.deepEqual(eventBrowseQuery({},now).filter,{});
 for(const query of [{q:['a','b']},{q:'a'.repeat(81)},{when:'any'},{status:'cancelled'}]){
  assert.throws(()=>eventBrowseQuery(query,now),{code:'INVALID_EVENT_FILTER'});
 }
});
