import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationFor,hasRole,isVerifiedFaculty,buildEventPayload,buildAnnouncementPayload,myRegistration,eventFull,registrationAttemptKey} from '../src/dashboard-domain.js';
const student={status:'active',activeRoles:['student']};
const faculty={status:'active',activeRoles:['faculty'],facultyVerificationStatus:'verified'};
const manager={status:'active',activeRoles:['societyManager']};
test('student cannot navigate to Admin or organizer screens',()=>{
 assert.deepEqual(navigationFor(student).map(x=>x.id),['overview','events','registrations','announcements']);
 assert.equal(hasRole(student,'admin'),false);
 assert.equal(navigationFor({...student,status:'suspended',activeRoles:['admin']}).some(x=>x.id==='admin'),false);
 assert.equal(isVerifiedFaculty({...faculty,facultyVerificationStatus:'pending'}),false);
});
test('verified Faculty and Manager see organizer, Admin sees Admin',()=>{
 assert.ok(navigationFor(faculty).some(x=>x.id==='organizer'));
 assert.ok(navigationFor(manager).some(x=>x.id==='organizer'));
 assert.ok(navigationFor({status:'active',activeRoles:['admin']}).some(x=>x.id==='admin'));
});
test('private registration is matched by own event id, not aggregate count',()=>{
 assert.equal(myRegistration('a',[{eventId:'b',status:'confirmed'}]),false);
 assert.equal(myRegistration('a',[{eventId:'a',status:'confirmed'}]),true);
 assert.equal(eventFull({confirmedCount:5,capacity:5}),true);
});
test('event form uses explicit timezone and validated capacity',()=>{
 const form={title:'Campus Workshop',description:'An academic workshop for everyone.',venue:'Main Hall',capacity:'5',
  registrationOpensAt:'2026-11-01T10:00',registrationClosesAt:'2026-11-03T10:00',startsAt:'2026-11-04T10:00',endsAt:'2026-11-04T12:00'};
 const valid=buildEventPayload(form,new Date('2026-10-31T00:00:00Z'));
 assert.equal(valid.capacity,5);assert.match(valid.startsAt,/Z$/);
 assert.throws(()=>buildEventPayload({...form,capacity:'0'},new Date('2026-10-31T00:00:00Z')),/Capacity/);
 assert.throws(()=>buildEventPayload({...form,registrationClosesAt:'2026-11-05T10:00'},new Date('2026-10-31T00:00:00Z')),/chronological/);
});
test('unapproved announcement creation is blocked locally; server remains authoritative',()=>{
 assert.throws(()=>buildAnnouncementPayload({title:'Update',body:'Test notice',scope:'university'},student),/Verified Faculty/);
 assert.equal(buildAnnouncementPayload({title:'Update',body:'Test notice',scope:'society',societyId:'6ae43793f5a4a7f228330ca7'},manager).scope,'society');
});
test('retries reuse idempotency keys for the same event only',()=>{
 const m=new Map();let i=0;const factory=()=>String(++i);
 assert.equal(registrationAttemptKey(m,'event-a',factory),'1');
 assert.equal(registrationAttemptKey(m,'event-a',factory),'1');
 assert.equal(registrationAttemptKey(m,'event-b',factory),'2');
});