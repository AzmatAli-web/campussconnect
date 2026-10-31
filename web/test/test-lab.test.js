import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLab,applyDemoAction,eventSeats,visibleActivity,registrantsForViewer} from '../src/test-lab-domain.js';
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


test('registration identities never appear in shared activity or another student attendee list',()=>{
 let state=createInitialLab();
 const registered=act(state,'demo-student-1','register',{eventId:'event-1'});
 assert.equal(registered.ok,true);state=registered.next;
 const publicFeed=visibleActivity(state,'demo-student-2');
 assert.ok(publicFeed.every(x=>!x.label.includes('Demo Student 1')));
 assert.ok(publicFeed.every(x=>!x.label.includes('registration for')));
 assert.equal(registrantsForViewer(state,'demo-student-2','event-1'),null);
 assert.equal(registrantsForViewer(state,'demo-student-1','event-1'),null);
 assert.deepEqual(eventSeats(state,'event-1'),{occupied:1,available:2,capacity:3});
});
test('students see only their own personal confirmation; Admin and organizer can inspect attendees',()=>{
 let state=createInitialLab();
 state=act(state,'demo-student-1','register',{eventId:'event-1'}).next;
 state=act(state,'demo-student-2','register',{eventId:'event-1'}).next;
 const personal1=visibleActivity(state,'demo-student-1');
 const personal2=visibleActivity(state,'demo-student-2');
 assert.equal(personal1.filter(x=>x.visibility==='registration').length,1);
 assert.equal(personal2.filter(x=>x.visibility==='registration').length,1);
 assert.ok(personal1.every(x=>!x.label.includes('Demo Student 2')));
 const guests=registrantsForViewer(state,'demo-admin','event-1');
 assert.deepEqual(guests.map(x=>x.name).sort(),['Demo Student 1','Demo Student 2']);
 assert.equal(registrantsForViewer(state,'demo-manager','event-1'),null);
});
test('role approval records are visible only to Demo Admin',()=>{
 let state=createInitialLab();
 state=act(state,'demo-admin','approveFaculty').next;
 assert.equal(visibleActivity(state,'demo-student-1').some(x=>x.label.includes('Faculty applicant approved')),false);
 assert.equal(visibleActivity(state,'demo-admin').some(x=>x.label.includes('Faculty applicant approved')),true);
});
