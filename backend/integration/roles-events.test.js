import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryReplSet} from 'mongodb-memory-server';

import {createApp} from '../src/app.js';
import {User} from '../src/models/user.js';
import {
 Event,EventRegistration,Announcement,Society,SocietyManagerAssignment,IdempotencyKey
} from '../src/models/campus-content.js';
import {AdminBootstrap,AuditLog,StaffInvitation} from '../src/models/governance.js';

const UNIVERSITY_ID=new mongoose.Types.ObjectId();
const DOMAIN='cuiatd.edu.pk';
const config={
 universityId:String(UNIVERSITY_ID),domains:[DOMAIN],
 nodeEnv:'test',corsOrigin:'http://localhost:5173',port:4000
};

const people=new Map();
function person(uid,roles=['student'],options={}){
 const email=uid+'@'+DOMAIN;
 const profile={
  universityId:UNIVERSITY_ID,firebaseUid:uid,emailNormalized:email,
  emailVerifiedAt:new Date(),fullName:uid.replace(/-/g,' '),
  registrationNo:null,requestedRole:options.requestedRole??'student',
  activeRoles:roles,status:options.status??'active',
  facultyVerificationStatus:options.facultyVerificationStatus??'unverified'
 };
 people.set(uid,{uid,email,email_verified:true,emailVerified:true});
 return profile;
}
const mockFirebase={
 async verifyIdToken(token) {
  const uid=token.replace(/^test-token:/,'');
  if(!token.startsWith('test-token:')||!people.has(uid)){
   const err=new Error('Invalid test fixture token');err.code='auth/invalid-id-token';throw err;
  }
  return people.get(uid);
 },
 async getUser(uid) {
  const claims=people.get(uid);
  if(!claims) throw new Error('No test user');
  return {uid,email:claims.email,emailVerified:claims.emailVerified};
 }
};
const auth=(uid)=>({Authorization:'Bearer test-token:'+uid});
const idem=(i)=>'integration-key-'+i.toString().padStart(8,'0');
const makeEvent=(title,capacity=5)=>({
 title,description:'Software engineering practical workshop for students.',
 venue:'Computer Science Auditorium',
 startsAt:new Date(Date.now()+72*3600_000).toISOString(),
 endsAt:new Date(Date.now()+74*3600_000).toISOString(),
 registrationOpensAt:new Date(Date.now()-3600_000).toISOString(),
 registrationClosesAt:new Date(Date.now()+48*3600_000).toISOString(),
 capacity
});
let mongo,app,admin,manager,faculty,unauthorized,students;

before(async()=>{
 mongo=await MongoMemoryReplSet.create({
  replSet:{count:1,storageEngine:'wiredTiger'},
  binary:{version:process.env.MONGOMS_VERSION||'7.0.24'}
 });
 await mongoose.connect(mongo.getUri(),{autoIndex:true});
 for(const model of [User,Event,EventRegistration,Announcement,
  Society,SocietyManagerAssignment,IdempotencyKey,AdminBootstrap,AuditLog,StaffInvitation]){
  await model.createIndexes();
 }
 [admin,manager,faculty,unauthorized,...students]=await User.insertMany([
  person('fixture-admin',['student','admin']),
  person('fixture-manager'),
  person('fixture-faculty',[],{requestedRole:'faculty',status:'pending'}),
  person('fixture-unauthorized'),
  ...Array.from({length:20},(_,i)=>person('fixture-student-'+i.toString().padStart(2,'0')))
 ]);
 app=createApp({config,firebaseAuth:mockFirebase});
},{timeout:180000});
after(async()=>{
 await mongoose.disconnect();
 if(mongo) await mongo.stop();
},{timeout:60000});

test('Admin is not accessible without a test fixture token or to ordinary students',async()=>{
 const noAuth=await request(app).get('/api/v1/admin/users');
 assert.equal(noAuth.status,401);
 const student=await request(app).get('/api/v1/admin/users').set(auth('fixture-manager'));
 assert.equal(student.status,403);
 const privilegedFields=await request(app).post('/api/v1/auth/bootstrap-profile')
  .set(auth('fixture-manager')).send({fullName:'Fake Admin',requestedRole:'admin'});
 assert.equal(privilegedFields.status,422);
});

test('only test fixture Admin can initialize society and assign manager',async()=>{
 const unauthorizedResponse=await request(app).post('/api/v1/admin/societies')
  .set(auth('fixture-manager')).send({name:'Software Guild',slug:'software-guild',description:'Software Engineering Student Society'});
 assert.equal(unauthorizedResponse.status,403);
 const create=await request(app).post('/api/v1/admin/societies')
  .set(auth('fixture-admin')).send({name:'Software Guild',slug:'software-guild',description:'Software Engineering Student Society'});
 assert.equal(create.status,201,JSON.stringify(create.body));
 const societyId=create.body.data.id;
 assert.ok(societyId);
 const assignment=await request(app).post('/api/v1/admin/society-manager-assignments')
  .set(auth('fixture-admin')).send({societyId,userId:String(manager._id)});
 assert.equal(assignment.status,201,JSON.stringify(assignment.body));
 const role=await User.findById(manager._id).lean();
 assert.ok(role.activeRoles.includes('societyManager'));
 const mine=await request(app).get('/api/v1/me/managed-societies').set(auth('fixture-manager'));
 assert.equal(mine.status,200,JSON.stringify(mine.body));
 assert.equal(mine.body.data.length,1);
 assert.equal(mine.body.data[0].id,societyId);
 const notMine=await request(app).get('/api/v1/me/managed-societies').set(auth('fixture-unauthorized'));
 assert.equal(notMine.status,403);

 const forbidden=await request(app).post('/api/v1/events')
  .set(auth('fixture-unauthorized')).send({...makeEvent('Cannot create event'),societyId});
 assert.equal(forbidden.status,403);
 const event=await request(app).post('/api/v1/events')
  .set(auth('fixture-manager')).send({...makeEvent('Software Guild Meetup'),societyId});
 assert.equal(event.status,201,JSON.stringify(event.body));
});

test('pending Faculty cannot publish; Admin evidence approval enables Faculty publishing',async()=>{
 const beforeApproval=await request(app).post('/api/v1/events')
  .set(auth('fixture-faculty')).send(makeEvent('Unapproved faculty event'));
 assert.equal(beforeApproval.status,403);
 const badEvidence=await request(app).post('/api/v1/admin/users/'+faculty._id+'/verify-faculty')
  .set(auth('fixture-admin')).send({method:'facultyEmail',evidenceReference:'fixture-roster-2026',reviewNote:'Test fixture review only',attested:false});
 assert.equal(badEvidence.status,422);
 const approved=await request(app).post('/api/v1/admin/users/'+faculty._id+'/verify-faculty')
  .set(auth('fixture-admin')).send({method:'facultyEmail',evidenceReference:'fixture-roster-2026',reviewNote:'Test fixture evidence independently checked',attested:true});
 assert.equal(approved.status,200,JSON.stringify(approved.body));
 assert.ok(approved.body.data.activeRoles.includes('faculty'));
 const event=await request(app).post('/api/v1/events')
  .set(auth('fixture-faculty')).send(makeEvent('Verified Faculty Workshop',5));
 assert.equal(event.status,201,JSON.stringify(event.body));
 assert.equal(event.body.data.confirmedCount,0);
 globalThis.__integrationEventId=event.body.data.id;
});

test('announcements enforce organizer role and keep student browsing read-only',async()=>{
 const denied=await request(app).post('/api/v1/announcements')
  .set(auth('fixture-unauthorized')).send({title:'Fake notice',body:'Test message.',scope:'university'});
 assert.equal(denied.status,403);
 const publish=await request(app).post('/api/v1/announcements')
  .set(auth('fixture-faculty')).send({title:'Semester updates',body:'Official exam schedule will be published soon.',scope:'university'});
 assert.equal(publish.status,201,JSON.stringify(publish.body));
 const browse=await request(app).get('/api/v1/announcements')
  .set(auth('fixture-student-00'));
 assert.equal(browse.status,200,JSON.stringify(browse.body));
 assert.ok(browse.body.data.some(item=>item.title==='Semester updates'));
 const wrongAuthor=await request(app).patch('/api/v1/announcements/'+publish.body.data.id)
  .set(auth('fixture-manager')).send({title:'Unauthorized change'});
 assert.equal(wrongAuthor.status,403);
});

test('20 simultaneous student registrations never exceed 5 seats; retries are replay-safe',async()=>{
 const eventId=globalThis.__integrationEventId;
 assert.ok(eventId,'Faculty event must be seeded by preceding test');
 const tryRegister=(i,key)=>request(app)
  .post('/api/v1/events/'+eventId+'/registrations')
  .set({...auth('fixture-student-'+i.toString().padStart(2,'0')),'Idempotency-Key':key})
  .send({universityEmail:'fixture-student-'+i.toString().padStart(2,'0')+'@'+DOMAIN});
 const keys=Array.from({length:20},(_,i)=>idem(i));
 const first=await Promise.all(keys.map((key,i)=>tryRegister(i,key)));
 const results=[...first];
 for(let i=0;i<results.length;i++){
  // Transaction write conflicts may yield retryable 503; retry with exactly the same idempotency key.
  for(let attempt=0;attempt<12&&[503].includes(results[i].status);attempt++){
   await new Promise(resolve=>setTimeout(resolve,30*(attempt+1)));
   results[i]=await tryRegister(i,keys[i]);
  }
 }
 const unexpected=results.filter(r=>![201,409].includes(r.status));
 assert.equal(unexpected.length,0,JSON.stringify(unexpected.map(x=>({status:x.status,body:x.body}))));
 assert.equal(results.filter(r=>r.status===201).length,5,JSON.stringify(results.map(r=>r.status)));
 assert.equal(results.filter(r=>r.status===409).length,15);
 const event=await Event.findById(eventId).lean();
 assert.equal(event.confirmedCount,5);
 assert.equal(await EventRegistration.countDocuments({eventId}),5);
 const winner=results.findIndex(r=>r.status===201);
 const replay=await tryRegister(winner,keys[winner]);
 assert.equal(replay.status,201);
 assert.equal(replay.body.data.id,results[winner].body.data.id);
 assert.equal((await Event.findById(eventId)).confirmedCount,5);
 // Students may inspect their own status but cannot see any other attendee.
 const winnerUid='fixture-student-'+winner.toString().padStart(2,'0');
 const loser=results.findIndex(r=>r.status===409);
 const loserUid='fixture-student-'+loser.toString().padStart(2,'0');
 const mine=await request(app).get('/api/v1/me/event-registrations').set(auth(winnerUid));
 assert.equal(mine.status,200,JSON.stringify(mine.body));
 assert.equal(mine.headers['cache-control'],'no-store');
 assert.equal(mine.body.data.length,1);
 assert.equal(mine.body.data[0].studentId,String(students[winner]._id));
 const notMine=await request(app).get('/api/v1/me/event-registrations').set(auth(loserUid));
 assert.equal(notMine.status,200);
 assert.equal(notMine.body.data.length,0);
 const forbiddenAttendees=await request(app).get('/api/v1/events/'+eventId+'/registrations').set(auth(winnerUid));
 assert.equal(forbiddenAttendees.status,403);
 const organizerAttendees=await request(app).get('/api/v1/events/'+eventId+'/registrations').set(auth('fixture-faculty'));
 assert.equal(organizerAttendees.status,200,JSON.stringify(organizerAttendees.body));
 assert.equal(organizerAttendees.body.data.length,5);
 assert.ok(organizerAttendees.body.data.every(r=>r.studentName?.startsWith('fixture student')));
 assert.ok(organizerAttendees.body.data.every(r=>r.universityEmail?.endsWith('@'+DOMAIN)));
 assert.ok(organizerAttendees.body.data.every(r=>!Object.hasOwn(r,'firebaseUid')));
 const publicEvents=await request(app).get('/api/v1/events').set(auth('fixture-student-01'));
 assert.equal(publicEvents.status,200);
 assert.ok(publicEvents.body.data.every(e=>!Object.hasOwn(e,'studentName')));
 const allowedOrganizerEvents=await request(app).get('/api/v1/me/organized-events').set(auth('fixture-faculty'));
 assert.equal(allowedOrganizerEvents.status,200);
 assert.ok(allowedOrganizerEvents.body.data.some(e=>e.id===eventId));

 const adminAttendees=await request(app).get('/api/v1/events/'+eventId+'/registrations').set(auth('fixture-admin'));
 assert.equal(adminAttendees.status,200);
 assert.equal(adminAttendees.body.data.length,5);
 const unrelatedManager=await request(app).get('/api/v1/events/'+eventId+'/registrations').set(auth('fixture-manager'));
 assert.equal(unrelatedManager.status,403);

 const duplicate=await tryRegister(winner,'new-attempt-key-'+winner.toString().padStart(8,'0'));
 assert.equal(duplicate.status,409);
 const wrongEmail=await request(app)
  .post('/api/v1/events/'+eventId+'/registrations')
  .set({...auth('fixture-student-19'),'Idempotency-Key':idem(99)})
  .send({universityEmail:'someone-else@'+DOMAIN});
 assert.equal(wrongEmail.status,403);
},{timeout:120000});

test('revoked Society Manager loses ability to publish and audit trail records the change',async()=>{
 const assignment=await SocietyManagerAssignment.findOne({userId:manager._id,status:'active'});
 const revoked=await request(app)
  .post('/api/v1/admin/society-manager-assignments/'+assignment._id+'/revoke')
  .set(auth('fixture-admin')).send({reason:'End of test fixture assignment'});
 assert.equal(revoked.status,200,JSON.stringify(revoked.body));
 const society=await Society.findOne({slug:'software-guild'});
 const denied=await request(app).post('/api/v1/events')
  .set(auth('fixture-manager')).send({...makeEvent('Revoked manager event'),societyId:String(society._id)});
 assert.equal(denied.status,403);
 const managed=await Event.findOne({organizerId:manager._id,organizerType:'societyManager'});
 assert.ok(managed,'Managed event should still exist after revocation');
 const leaked=await request(app).get('/api/v1/events/'+managed._id+'/registrations').set(auth('fixture-manager'));
 assert.equal(leaked.status,403,'Revoked manager cannot read attendee identities');
 const noLongerOrganized=await request(app).get('/api/v1/me/organized-events').set(auth('fixture-manager'));
 assert.equal(noLongerOrganized.status,403,'Revoked manager loses organizer view');

 assert.ok(await AuditLog.countDocuments({action:'society.manager.revoked'})>=1);
});

test('one-time Admin bootstrap unique index cannot create a second bootstrap record',async()=>{
 await AdminBootstrap.create({universityId:UNIVERSITY_ID,adminUserId:admin._id,firebaseUid:admin.firebaseUid});
 await assert.rejects(()=>AdminBootstrap.create({
  universityId:UNIVERSITY_ID,adminUserId:manager._id,firebaseUid:manager.firebaseUid
 }),error=>error.code===11000);
});

test('private organized event list returns only current organizer records, not unrelated organizer events',async()=>{
 const facultyView=await request(app).get('/api/v1/me/organized-events').set(auth('fixture-faculty'));
 assert.equal(facultyView.status,200,JSON.stringify(facultyView.body));
 assert.equal(facultyView.headers['cache-control'],'no-store');
 assert.ok(facultyView.body.data.some(x=>x.title==='Verified Faculty Workshop'));
 assert.ok(facultyView.body.data.every(x=>x.title!=='Software Guild Meetup'));
 const denied=await request(app).get('/api/v1/me/organized-events').set(auth('fixture-student-00'));
 assert.equal(denied.status,403);
});


test('cross-client contract: organizer publishes on React, student registers on Flutter, web reads own registration',async()=>{
 // This runs ONLY in the isolated MongoMemoryReplSet with mock Firebase claims.
 // "Web" and "Flutter" are different consumers of the same REST API contract.
 const facultyCreated=await request(app)
  .post('/api/v1/events')
  .set({...auth('fixture-faculty'),'User-Agent':'CampusConnect-Web-ContractTest'})
  .send(makeEvent('Cross-platform registration workshop',2));
 assert.equal(facultyCreated.status,201,JSON.stringify(facultyCreated.body));
 const created=facultyCreated.body.data;
 const eventId=created.id;
 assert.match(eventId,/^[0-9a-f]{24}$/);
 assert.equal(created.capacity,2);
 assert.equal(created.confirmedCount,0);
 assert.equal(created.registrationOpen,true);

 // Flutter's public-to-campus event listing must expose the same event fields.
 const studentUid='fixture-student-10',otherUid='fixture-student-11';
 const onPhone=await request(app).get('/api/v1/events?limit=100')
  .set({...auth(studentUid),'User-Agent':'CampusConnect-Flutter-ContractTest'});
 assert.equal(onPhone.status,200,JSON.stringify(onPhone.body));
 const phoneEvent=onPhone.body.data.find(event=>event.id===eventId);
 assert.ok(phoneEvent,'Flutter client should see the event published by the organizer');
 for(const key of ['id','title','description','venue','startsAt','endsAt',
  'capacity','confirmedCount','registrationOpen','isFull']){
  assert.ok(Object.hasOwn(phoneEvent,key),'Missing mobile model field: '+key);
  assert.equal(phoneEvent[key],created[key]);
 }
 assert.ok(!Object.hasOwn(phoneEvent,'studentName'));
 assert.ok(!Object.hasOwn(phoneEvent,'universityEmail'));

 // A student registers using the exact body/headers sent by the Flutter app.
 const key='cross-client-mobile-register-0001';
 const body={universityEmail:studentUid+'@'+DOMAIN};
 const phoneRegister=await request(app)
  .post('/api/v1/events/'+eventId+'/registrations')
  .set({...auth(studentUid),'Idempotency-Key':key,
    'User-Agent':'CampusConnect-Flutter-ContractTest'})
  .send(body);
 assert.equal(phoneRegister.status,201,JSON.stringify(phoneRegister.body));
 assert.equal(phoneRegister.body.data.eventId,eventId);
 assert.equal(phoneRegister.body.data.status,'confirmed');
 assert.ok(phoneRegister.body.data.id);
 assert.ok(phoneRegister.body.data.confirmedAt);

 // The SAME student signs into React and sees the registration immediately.
 const onWeb=await request(app).get('/api/v1/me/event-registrations?limit=100')
  .set({...auth(studentUid),'User-Agent':'CampusConnect-Web-ContractTest'});
 assert.equal(onWeb.status,200,JSON.stringify(onWeb.body));
 assert.equal(onWeb.headers['cache-control'],'no-store');
 const ownRecord=onWeb.body.data.find(r=>r.eventId===eventId);
 assert.ok(ownRecord,'Registration must be accessible from the web account');
 assert.equal(ownRecord.id,phoneRegister.body.data.id);
 assert.equal(ownRecord.status,'confirmed');

 // The event count updates globally, but the attendee identity stays private.
 const updated=await request(app).get('/api/v1/events/'+eventId).set(auth(otherUid));
 assert.equal(updated.status,200,JSON.stringify(updated.body));
 assert.equal(updated.body.data.confirmedCount,1);
 assert.equal(updated.body.data.capacity,2);
 assert.equal(updated.body.data.registrationOpen,true);
 assert.ok(!Object.hasOwn(updated.body.data,'studentId'));
 const otherOwn=await request(app).get('/api/v1/me/event-registrations?limit=100').set(auth(otherUid));
 assert.equal(otherOwn.status,200);
 assert.ok(!otherOwn.body.data.some(r=>r.eventId===eventId));
 const forbiddenRoster=await request(app).get('/api/v1/events/'+eventId+'/registrations')
  .set(auth(otherUid));
 assert.equal(forbiddenRoster.status,403);

 // A network retry with the SAME key must return the exact original receipt.
 const retry=await request(app).post('/api/v1/events/'+eventId+'/registrations')
  .set({...auth(studentUid),'Idempotency-Key':key}).send(body);
 assert.equal(retry.status,201,JSON.stringify(retry.body));
 assert.equal(retry.body.data.id,phoneRegister.body.data.id);
 assert.equal((await Event.findById(eventId)).confirmedCount,1);

 // A NEW key must not double-book the same student across devices.
 const duplicate=await request(app).post('/api/v1/events/'+eventId+'/registrations')
  .set({...auth(studentUid),'Idempotency-Key':'cross-client-web-duplicate-0001'}).send(body);
 assert.equal(duplicate.status,409,JSON.stringify(duplicate.body));
 assert.equal(await EventRegistration.countDocuments({eventId}),1);

 // An organizer cannot silently change the published event after a seat is booked.
 const frozen=await request(app).patch('/api/v1/events/'+eventId)
  .set(auth('fixture-faculty')).send({venue:'Unauthorized change after registration'});
 assert.equal(frozen.status,409);
 const organizerRoster=await request(app).get('/api/v1/events/'+eventId+'/registrations')
  .set(auth('fixture-faculty'));
 assert.equal(organizerRoster.status,200);
 assert.equal(organizerRoster.body.data.length,1);
 assert.equal(organizerRoster.body.data[0].studentId,String(students[10]._id));
},{timeout:90000});
