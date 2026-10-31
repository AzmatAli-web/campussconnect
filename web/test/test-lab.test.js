import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLab,applyDemoAction,eventSeats} from '../src/test-lab-domain.js';
const act=(s,who,what,payload)=>applyDemoAction(s,who,what,payload);
test('Demo has no real campus identifiers and starts with distinct personas',()=>{
 const state=createInitialLab();
 assert.equal(state.people.length,7);
 assert.ok(state.people.every(p=>p.email.endsWith('.test')));
 assert.ok(state.people.find(x=>x.id==='demo-faculty').roles.length===0);
});
test('Student cannot approve faculty or publish events',()=>{
 const initial=createInitialLab();
 assert.equal(act(initial,'demo-student-1','approveFaculty').code,'FORBIDDEN');
 assert.equal(act(initial,'demo-student-1','createEvent',{title:'Hackathon',venue:'Hall',capacity:4}).code,'FORBIDDEN');
});
test('Faculty approval and manager assignment are explicit Demo Admin actions',()=>{
 let state=createInitialLab();
 let r=act(state,'demo-faculty','createEvent',{title:'Hackathon',venue:'Hall',capacity:4});
 assert.equal(r.ok,false);
 r=act(state,'demo-admin','approveFaculty');
 assert.ok(r.ok);state=r.next;
 r=act(state,'demo-faculty','createEvent',{title:'Hackathon',venue:'Hall',capacity:4});
 assert.ok(r.ok);state=r.next;
 r=act(state,'demo-manager','publishAnnouncement',{title:'Important',body:'Faculty meetup this week'});
 assert.equal(r.ok,false);
 r=act(state,'demo-admin','assignManager');
 assert.ok(r.ok);state=r.next;
 r=act(state,'demo-manager','publishAnnouncement',{title:'Important',body:'Faculty meetup this week'});
 assert.ok(r.ok);
 assert.equal(r.next.announcements[0].scope,'society');
});
test('four Student personas cannot register more than 3 slots or duplicate one',()=>{
 let state=createInitialLab();
 for(let i=1;i<=3;i++){
  const r=act(state,'demo-student-'+i,'register',{eventId:'event-1'});
  assert.ok(r.ok);state=r.next;
 }
 assert.deepEqual(eventSeats(state,'event-1'),{occupied:3,available:0,capacity:3});
 assert.equal(act(state,'demo-student-1','register',{eventId:'event-1'}).code,'ALREADY_REGISTERED');
 assert.equal(act(state,'demo-student-4','register',{eventId:'event-1'}).code,'CAPACITY_REACHED');
});
