import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {MongoMemoryReplSet} from 'mongodb-memory-server';

import {createApp} from '../src/app.js';
import {User} from '../src/models/user.js';
import {
 Event,EventRegistration,Announcement,Society,SocietyManagerAssignment,IdempotencyKey
} from '../src/models/campus-content.js';
import {AdminBootstrap,AuditLog,StaffInvitation} from '../src/models/governance.js';
import {TimetableSlot} from '../src/models/timetable.js';
import {AcademicResource} from '../src/models/academic-resource.js';
import {StudentComplaint} from '../src/models/complaint.js';
import {FeeInvoice,FeePaymentRecord} from '../src/models/fees.js';
import {MarketplaceListing,MarketplaceReport} from '../src/models/marketplace.js';

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
  Society,SocietyManagerAssignment,IdempotencyKey,AdminBootstrap,AuditLog,StaffInvitation,TimetableSlot,AcademicResource,StudentComplaint,FeeInvoice,FeePaymentRecord,MarketplaceListing,MarketplaceReport]){
  await model.createIndexes();
 }
 [admin,manager,faculty,unauthorized,...students]=await User.insertMany([
  person('fixture-admin',['student','admin']),
  person('fixture-manager'),
  person('fixture-faculty',[],{requestedRole:'faculty',status:'pending'}),
  person('fixture-unauthorized'),
  ...Array.from({length:20},(_,i)=>person('fixture-student-'+i.toString().padStart(2,'0')))
 ]);
 config.resourceUploadDir=await mkdtemp(path.join(tmpdir(),'cc-resources-test-'));
 config.marketplaceUploadDir=await mkdtemp(path.join(tmpdir(),'cc-marketplace-test-'));

 app=createApp({config,firebaseAuth:mockFirebase});
},{timeout:180000});
after(async()=>{
 await mongoose.disconnect();
 if(mongo) await mongo.stop();
 if(config.resourceUploadDir) await rm(config.resourceUploadDir,{recursive:true,force:true});
 if(config.marketplaceUploadDir) await rm(config.marketplaceUploadDir,{recursive:true,force:true});
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

test('official timetable: only staff/admin publish and conflicting quarter-hour slots are blocked', async () => {
 const payload=(changes={})=>({
  term:'Fall 2026',program:'BSE',semester:7,section:'A',dayOfWeek:1,
  startTime:'08:00',endTime:'09:30',courseCode:'CSC494',
  courseTitle:'Software Project Management',instructorName:'Test Instructor',
  room:'Lab 3',...changes
 });
 const denied=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-student-00')).send(payload());
 assert.equal(denied.status,403);

 const invalid=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload({startTime:'08:10'}));
 assert.equal(invalid.status,422);

 const first=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload());
 assert.equal(first.status,201,JSON.stringify(first.body));
 assert.equal(first.body.data.startTime,'08:00');
 assert.ok(!Object.hasOwn(first.body.data,'publishedBy'));
 const id=first.body.data.id;

 const collision=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload({
   startTime:'09:00',endTime:'10:00',courseCode:'CSC412'
  }));
 assert.equal(collision.status,409,JSON.stringify(collision.body));
 assert.equal(collision.body.error.code,'TIMETABLE_CONFLICT');

 const next=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload({
    startTime:'09:30',endTime:'10:30',courseCode:'CSC412',
    courseTitle:'Advanced Programming',room:'Room 205'
  }));
 assert.equal(next.status,201,JSON.stringify(next.body));

 const otherSection=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload({section:'B'}));
 assert.equal(otherSection.status,201,JSON.stringify(otherSection.body));

 const groups=await request(app).get('/api/v1/timetable/groups')
  .set(auth('fixture-student-00'));
 assert.equal(groups.status,200,JSON.stringify(groups.body));
 assert.equal(groups.headers['cache-control'],'no-store');
 assert.ok(groups.body.data.some(g=>g.program==='BSE'&&g.semester===7&&g.section==='A'));
 assert.ok(groups.body.data.some(g=>g.section==='B'));

 const groupA=await request(app).get('/api/v1/timetable/slots')
  .query({term:'Fall 2026',program:'bse',semester:'7',section:'a'})
  .set(auth('fixture-student-01'));
 assert.equal(groupA.status,200,JSON.stringify(groupA.body));
 assert.equal(groupA.body.data.length,2);
 assert.equal(groupA.body.data[0].id,id);
 assert.ok(groupA.body.data.every(s=>s.section==='A'));
 assert.ok(groupA.body.data.every(s=>!Object.hasOwn(s,'publishedBy')));

 const missingFilters=await request(app).get('/api/v1/timetable/slots')
  .set(auth('fixture-student-00'));
 assert.equal(missingFilters.status,400);

 const deniedArchive=await request(app).post('/api/v1/timetable/slots/'+id+'/archive')
  .set(auth('fixture-student-00')).send({});
 assert.equal(deniedArchive.status,403);
 const archived=await request(app).post('/api/v1/timetable/slots/'+id+'/archive')
  .set(auth('fixture-admin')).send({});
 assert.equal(archived.status,200,JSON.stringify(archived.body));
 assert.equal(archived.body.data.status,'archived');
 const reoccupied=await request(app).post('/api/v1/timetable/slots')
  .set(auth('fixture-admin')).send(payload());
 assert.equal(reoccupied.status,201,JSON.stringify(reoccupied.body));
 assert.equal(await TimetableSlot.countDocuments({status:'archived'}),1);
},{timeout:30000});


test('academic resource upload requires verified faculty; students receive only published authorized PDF',async()=>{
 const studentUid='fixture-student-00';
 const newAuthor=await User.create(person('fixture-faculty-resource-test',['faculty'],{
  requestedRole:'faculty',facultyVerificationStatus:'verified'
 }));
 const fixturePdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
 function attachPdf(req,bytes=fixturePdf,fileName='software-notes.pdf'){
  return req.field('title','Software Project Management notes')
   .field('program','BSE').field('semester','7')
   .field('courseCode','CSC494')
   .field('description','Faculty-approved academic notes')
   .attach('file',bytes,{filename:fileName,contentType:'application/pdf'});
 }
 const refused=await attachPdf(request(app).post('/api/v1/resources').set(auth(studentUid)));
 assert.equal(refused.status,403,JSON.stringify(refused.body));

 const pending=await attachPdf(request(app).post('/api/v1/resources')
  .set(auth('fixture-faculty-pending-resource')));
 // A UID that has no test token is not an authorized verified Faculty account.
 assert.equal(pending.status,401);

 const invalid=await attachPdf(request(app).post('/api/v1/resources')
  .set(auth('fixture-faculty-resource-test')),Buffer.from('NOT A PDF'),'fake.pdf');
 assert.equal(invalid.status,415,JSON.stringify(invalid.body));

 const published=await attachPdf(request(app).post('/api/v1/resources')
  .set(auth('fixture-faculty-resource-test')));
 assert.equal(published.status,201,JSON.stringify(published.body));
 const item=published.body.data;
 assert.equal(item.title,'Software Project Management notes');
 assert.equal(item.courseCode,'CSC494');
 assert.equal(item.semester,7);
 assert.equal(item.status,'published');
 assert.equal(item.sizeBytes,fixturePdf.length);
 for(const forbidden of ['storageKey','uploadedBy','universityId']){
  assert.equal(Object.hasOwn(item,forbidden),false,forbidden);
 }

 const list=await request(app).get('/api/v1/resources')
  .query({program:'bse',semester:'7',courseCode:'csc494'})
  .set(auth(studentUid));
 assert.equal(list.status,200,JSON.stringify(list.body));
 assert.equal(list.headers['cache-control'],'private, no-store');
 assert.ok(list.body.data.some(r=>r.id===item.id));
 assert.ok(list.body.data.every(r=>r.program==='BSE'&&r.semester===7));
 assert.ok(list.body.data.every(r=>!Object.hasOwn(r,'storageKey')));

 const wrongCourse=await request(app).get('/api/v1/resources')
  .query({courseCode:'CSC412'}).set(auth(studentUid));
 assert.equal(wrongCourse.status,200);
 assert.ok(!wrongCourse.body.data.some(r=>r.id===item.id));

 const missingAuth=await request(app).get('/api/v1/resources/'+item.id+'/file');
 assert.equal(missingAuth.status,401);
 const downloaded=await request(app).get('/api/v1/resources/'+item.id+'/file')
  .set(auth(studentUid)).buffer(true).parse((res,callback)=>{
    const chunks=[];
    res.on('data',chunk=>chunks.push(chunk));
    res.on('end',()=>callback(null,Buffer.concat(chunks)));
  });
 assert.equal(downloaded.status,200,JSON.stringify(downloaded.body));
 assert.equal(downloaded.headers['content-type'],'application/pdf');
 assert.equal(downloaded.headers['x-content-type-options'],'nosniff');
 assert.equal(downloaded.headers['cache-control'],'private, no-store');
 assert.equal(downloaded.headers['content-length'],String(fixturePdf.length));
 assert.ok(downloaded.headers['content-disposition'].startsWith('attachment;'));
 assert.deepEqual(downloaded.body,fixturePdf);

 const otherFaculty=await request(app).post('/api/v1/resources/'+item.id+'/archive')
  .set(auth('fixture-faculty')).send({});
 assert.equal(otherFaculty.status,403);
 const adminArchived=await request(app).post('/api/v1/resources/'+item.id+'/archive')
  .set(auth('fixture-admin')).send({});
 assert.equal(adminArchived.status,200,JSON.stringify(adminArchived.body));
 assert.equal(adminArchived.body.data.status,'archived');
 const noLongerPublic=await request(app).get('/api/v1/resources/'+item.id+'/file')
  .set(auth(studentUid));
 assert.equal(noLongerPublic.status,404);
 const listAfter=await request(app).get('/api/v1/resources').set(auth(studentUid));
 assert.ok(!listAfter.body.data.some(r=>r.id===item.id));

 const second=await attachPdf(request(app).post('/api/v1/resources')
  .set(auth('fixture-faculty-resource-test')));
 assert.equal(second.status,201);
 const owned=await request(app).get('/api/v1/me/resources')
  .set(auth('fixture-faculty-resource-test'));
 assert.equal(owned.status,200);
 assert.ok(owned.body.data.some(r=>r.id===item.id&&r.status==='archived'));
 assert.ok(owned.body.data.some(r=>r.id===second.body.data.id));
 const facultyArchive=await request(app).post('/api/v1/resources/'+second.body.data.id+'/archive')
  .set(auth('fixture-faculty-resource-test')).send({});
 assert.equal(facultyArchive.status,200);
 assert.equal(newAuthor.firebaseUid,'fixture-faculty-resource-test');

 const unknownField=await request(app).get('/api/v1/resources')
  .query({universityId:String(UNIVERSITY_ID)}).set(auth(studentUid));
 assert.equal(unknownField.status,400);
},{timeout:45000});

test('private complaints: students submit and read only their own records',async()=>{
 const student='fixture-student-00',other='fixture-student-01';
 const input={category:'academic',title:'Classroom schedule mismatch',
  description:'The published timetable and actual class time disagree.'};
 const noToken=await request(app).post('/api/v1/complaints').send(input);
 assert.equal(noToken.status,401);
 const invalid=await request(app).post('/api/v1/complaints')
  .set(auth(student)).send({...input,status:'resolved',studentId:String(students[1]._id)});
 assert.equal(invalid.status,422);
 const created=await request(app).post('/api/v1/complaints')
  .set(auth(student)).send(input);
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal(created.headers['cache-control'],'private, no-store');
 assert.equal(created.body.data.status,'submitted');
 assert.ok(created.body.data.id);
 assert.ok(!Object.hasOwn(created.body.data,'studentId'));
 assert.ok(!Object.hasOwn(created.body.data,'handledBy'));
 const id=created.body.data.id;
 const mine=await request(app).get('/api/v1/me/complaints')
  .set(auth(student));
 assert.equal(mine.status,200);
 assert.ok(mine.body.data.some(c=>c.id===id));
 const otherList=await request(app).get('/api/v1/me/complaints')
  .set(auth(other));
 assert.equal(otherList.status,200);
 assert.ok(!otherList.body.data.some(c=>c.id===id));
 const otherDetail=await request(app).get('/api/v1/me/complaints/'+id)
  .set(auth(other));
 assert.equal(otherDetail.status,404);
 const mineDetail=await request(app).get('/api/v1/me/complaints/'+id)
  .set(auth(student));
 assert.equal(mineDetail.status,200);
 assert.equal(mineDetail.body.data.description,input.description);
 const deniedQueue=await request(app).get('/api/v1/staff/complaints')
  .set(auth(student));
 assert.equal(deniedQueue.status,403);
 const deniedUpdate=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth(student)).send({status:'in_review'});
 assert.equal(deniedUpdate.status,403);
 const deniedFaculty=await request(app).get('/api/v1/staff/complaints')
  .set(auth('fixture-faculty'));
 assert.equal(deniedFaculty.status,403);

 const staff=await User.create(person('fixture-staff-complaints',['staff']));
 const queue=await request(app).get('/api/v1/staff/complaints')
  .set(auth('fixture-staff-complaints')).query({status:'submitted'});
 assert.equal(queue.status,200,JSON.stringify(queue.body));
 assert.ok(queue.body.data.some(c=>c.id===id));
 assert.ok(queue.body.data.every(c=>!Object.hasOwn(c,'studentId')));
 const skipped=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-staff-complaints')).send({status:'resolved',staffResponse:'Done'});
 assert.equal(skipped.status,409);
 const review=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-staff-complaints')).send({status:'in_review'});
 assert.equal(review.status,200,JSON.stringify(review.body));
 const noAnswer=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-staff-complaints')).send({status:'resolved'});
 assert.equal(noAnswer.status,422);
 const solved=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-staff-complaints'))
  .send({status:'resolved',staffResponse:'The schedule is corrected in the student portal.'});
 assert.equal(solved.status,200,JSON.stringify(solved.body));
 const studentResult=await request(app).get('/api/v1/me/complaints/'+id)
  .set(auth(student));
 assert.equal(studentResult.status,200);
 assert.equal(studentResult.body.data.status,'resolved');
 assert.equal(studentResult.body.data.staffResponse,'The schedule is corrected in the student portal.');
 const closed=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-admin')).send({status:'closed'});
 assert.equal(closed.status,200);
 const repeat=await request(app).patch('/api/v1/staff/complaints/'+id)
  .set(auth('fixture-admin')).send({status:'closed'});
 assert.equal(repeat.status,409);
 const doc=await StudentComplaint.findById(id).lean();
 assert.equal(String(doc.studentId),String(students[0]._id));
 assert.equal(String(doc.handledBy),String(admin._id));
 assert.equal(String(staff._id).length,24);
},{timeout:35000});

test('fee records: restricted issuance, private student view and atomic receipt ledger',async()=>{
 const student='fixture-student-00',other='fixture-student-01';
 const staffUid='fixture-fees-staff';
 const staffUser=await User.create(person(staffUid,['staff']));
 // General Staff cannot issue or read fee records.
 const deniedLegacy=await request(app).get('/api/v1/staff/fees')
   .set(auth(staffUid));
 assert.equal(deniedLegacy.status,404);
 const restricted=await request(app).post('/api/v1/finance/fees')
   .set(auth(staffUid)).send({
    studentEmail:student+'@'+DOMAIN,invoiceNo:'FEE-FALL-2026-0001',
    title:'Fall semester tuition',term:'Fall 2026',
    dueDate:'2027-01-15',amountPkr:10000
   });
 assert.equal(restricted.status,403);
 // Real governance endpoint: Admin explicitly attests finance authorization.
 const grant=await request(app).post('/api/v1/admin/finance-officers/'+staffUser._id+'/grant')
   .set(auth('fixture-admin')).send({
    attested:true,evidenceReference:'FIN-DEPT-APPROVAL-2026',
    reason:'Independent verified authorization for office finance duties'
   });
 assert.equal(grant.status,200,JSON.stringify(grant.body));
 assert.ok(grant.body.data.activeRoles.includes('financeOfficer'));
 const requestInvoice={
  studentEmail:student+'@'+DOMAIN,invoiceNo:'FEE-FALL-2026-0001',
  title:'Fall semester tuition',term:'Fall 2026',dueDate:'2027-01-15',
  amountPkr:10000
 };
 const studentPost=await request(app).post('/api/v1/finance/fees')
  .set(auth(student)).send(requestInvoice);
 assert.equal(studentPost.status,403);
 const noAuth=await request(app).get('/api/v1/me/fees');
 assert.equal(noAuth.status,401);
 const forged=await request(app).post('/api/v1/finance/fees')
  .set(auth(staffUid))
  .send({...requestInvoice,paidPkr:10000,studentId:String(students[1]._id)});
 assert.equal(forged.status,422);
 const created=await request(app).post('/api/v1/finance/fees')
  .set(auth(staffUid)).send(requestInvoice);
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal(created.headers['cache-control'],'private, no-store');
 const invoice=created.body.data;
 assert.equal(invoice.currency,'PKR');
 assert.equal(invoice.amountPkr,10000);
 assert.equal(invoice.paidPkr,0);
 assert.equal(invoice.outstandingPkr,10000);
 assert.equal(invoice.status,'unpaid');
 for(const key of ['studentId','studentEmail','issuedBy','universityId']){
  assert.equal(Object.hasOwn(invoice,key),false,key);
 }
 const duplicate=await request(app).post('/api/v1/finance/fees')
  .set(auth(staffUid)).send(requestInvoice);
 assert.equal(duplicate.status,409);

 const mine=await request(app).get('/api/v1/me/fees?limit=100')
  .set(auth(student));
 assert.equal(mine.status,200,JSON.stringify(mine.body));
 assert.ok(mine.body.data.some(x=>x.id===invoice.id));
 const otherList=await request(app).get('/api/v1/me/fees?limit=100')
  .set(auth(other));
 assert.equal(otherList.status,200);
 assert.ok(!otherList.body.data.some(x=>x.id===invoice.id));
 const otherPayments=await request(app).get('/api/v1/me/fees/'+invoice.id+'/payments')
  .set(auth(other));
 assert.equal(otherPayments.status,404);
 const studentCannotPay=await request(app)
  .post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(student)).send({amountPkr:3000,receiptRef:'RECEIPT-TEST-001'});
 assert.equal(studentCannotPay.status,403);

 const invalid=await request(app).post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(staffUid)).send({amountPkr:-3,receiptRef:'RECEIPT-TEST-001'});
 assert.equal(invalid.status,422);
 const partial=await request(app).post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(staffUid)).send({amountPkr:3000,receiptRef:'RECEIPT-TEST-001'});
 assert.equal(partial.status,201,JSON.stringify(partial.body));
 assert.equal(partial.body.data.invoice.status,'partially_recorded');
 assert.equal(partial.body.data.invoice.paidPkr,3000);
 assert.equal(partial.body.data.invoice.outstandingPkr,7000);
 assert.equal(partial.body.data.payment.receiptRef,'RECEIPT-TEST-001');
 assert.equal(Object.hasOwn(partial.body.data.payment,'recordedBy'),false);

 const retry=await request(app).post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(staffUid)).send({amountPkr:3000,receiptRef:'RECEIPT-TEST-001'});
 assert.equal(retry.status,409,JSON.stringify(retry.body));
 assert.equal(retry.body.error.code,'RECEIPT_ALREADY_RECORDED');
 const afterRetry=await FeeInvoice.findById(invoice.id).lean();
 assert.equal(afterRetry.paidPkr,3000,'duplicate receipt must NOT increment balance');
 const overpay=await request(app).post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(staffUid)).send({amountPkr:7001,receiptRef:'RECEIPT-TEST-OVER'});
 assert.equal(overpay.status,409);
 const finished=await request(app).post('/api/v1/finance/fees/'+invoice.id+'/payments')
  .set(auth(staffUid)).send({amountPkr:7000,receiptRef:'RECEIPT-TEST-002'});
 assert.equal(finished.status,201,JSON.stringify(finished.body));
 assert.equal(finished.body.data.invoice.status,'paid');
 assert.equal(finished.body.data.invoice.outstandingPkr,0);
 const paidHistory=await request(app).get('/api/v1/me/fees/'+invoice.id+'/payments')
  .set(auth(student));
 assert.equal(paidHistory.status,200);
 assert.equal(paidHistory.body.data.length,2);
 assert.equal(paidHistory.body.data.reduce((n,p)=>n+p.amountPkr,0),10000);
 const studentView=await request(app).get('/api/v1/me/fees')
  .set(auth(student));
 const final=studentView.body.data.find(x=>x.id===invoice.id);
 assert.equal(final.status,'paid');
 assert.equal(final.paidPkr,10000);
 const staffList=await request(app).get('/api/v1/finance/fees')
  .set(auth(staffUid)).query({studentEmail:requestInvoice.studentEmail});
 assert.equal(staffList.status,200);
 assert.ok(staffList.body.data.some(x=>x.id===invoice.id));
 const wrongStudent=await request(app).get('/api/v1/finance/fees')
  .set(auth(staffUid)).query({studentEmail:other+'@'+DOMAIN});
 assert.ok(!wrongStudent.body.data.some(x=>x.id===invoice.id));
 const unauthorizedFilter=await request(app).get('/api/v1/finance/fees')
  .set(auth(staffUid)).query({studentId:String(students[0]._id)});
 assert.equal(unauthorizedFilter.status,400);
 assert.equal(await FeePaymentRecord.countDocuments({invoiceId:invoice.id}),2);
 const saved=await FeeInvoice.findById(invoice.id).lean();
 assert.equal(String(saved.studentId),String(students[0]._id));
 // Audit is committed atomically with invoice + payment changes.
 const audits=await AuditLog.find({universityId:UNIVERSITY_ID,
  targetId:invoice.id}).sort({occurredAt:1}).lean();
 assert.equal(audits.filter(a=>a.action==='finance.invoice.issued').length,1);
 const receipts=audits.filter(a=>a.action==='finance.payment.recorded');
 assert.equal(receipts.length,2,'failed or duplicate payments must not create audit entries');
 assert.deepEqual(receipts.map(a=>a.details.amountPkr).sort((a,b)=>a-b),[3000,7000]);
 assert.ok(audits.every(a=>String(a.actorId)===String(staffUser._id)));
 const afterAuth=await request(app).post('/api/v1/admin/finance-officers/'+staffUser._id+'/revoke')
  .set(auth('fixture-admin')).send({reason:'Finance assignment has ended and access must be revoked'});
 assert.equal(afterAuth.status,200,JSON.stringify(afterAuth.body));
 assert.ok(!afterAuth.body.data.activeRoles.includes('financeOfficer'));
 const postRevoke=await request(app).get('/api/v1/finance/fees')
  .set(auth(staffUid)).query({studentEmail:requestInvoice.studentEmail});
 assert.equal(postRevoke.status,403);
 const adminRead=await request(app).get('/api/v1/admin/audit-logs?limit=100')
  .set(auth('fixture-admin'));
 assert.equal(adminRead.status,200);
 assert.ok(adminRead.body.data.some(a=>a.action==='finance.officer.granted'));
 assert.ok(adminRead.body.data.some(a=>a.action==='finance.officer.revoked'));
},{timeout:45000});

test('finance role granting requires Admin, eligible Staff and explicit attestation',async()=>{
 const candidate=await User.create(person('fixture-finance-approval-target',['staff']));
 const student=students[2];
 const reason='Approved by finance office for official ledger duties';
 const invalid=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/grant')
  .set(auth('fixture-admin'))
  .send({attested:false,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(invalid.status,422);
 const unauthorized=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/grant')
  .set(auth('fixture-finance-approval-target'))
  .send({attested:true,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(unauthorized.status,403);
 const notStaff=await request(app).post('/api/v1/admin/finance-officers/'+student._id+'/grant')
  .set(auth('fixture-admin'))
  .send({attested:true,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(notStaff.status,409);
 const selfGrant=await request(app).post('/api/v1/admin/finance-officers/'+admin._id+'/grant')
  .set(auth('fixture-admin'))
  .send({attested:true,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(selfGrant.status,403);
 const granted=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/grant')
  .set(auth('fixture-admin'))
  .send({attested:true,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(granted.status,200,JSON.stringify(granted.body));
 assert.ok(granted.body.data.activeRoles.includes('financeOfficer'));
 const repeated=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/grant')
  .set(auth('fixture-admin'))
  .send({attested:true,evidenceReference:'FIN-REF-2026',reason});
 assert.equal(repeated.status,409);
 const revokeDenied=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/revoke')
  .set(auth('fixture-finance-approval-target'))
  .send({reason:'Revoke this finance access without administrator approval'});
 assert.equal(revokeDenied.status,403);
 const revoked=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/revoke')
  .set(auth('fixture-admin'))
  .send({reason:'Finance department appointment ended for this employee'});
 assert.equal(revoked.status,200);
 const revokedAgain=await request(app).post('/api/v1/admin/finance-officers/'+candidate._id+'/revoke')
  .set(auth('fixture-admin'))
  .send({reason:'Finance department appointment ended for this employee'});
 assert.equal(revokedAgain.status,409);
 const history=await AuditLog.find({universityId:UNIVERSITY_ID,targetId:candidate._id}).lean();
 assert.equal(history.filter(a=>a.action==='finance.officer.granted').length,1);
 assert.equal(history.filter(a=>a.action==='finance.officer.revoked').length,1);
},{timeout:45000});


test('Marketplace: tenant isolation, student ownership, consent, private photo and Admin moderation',async()=>{
 const seller='fixture-student-00',reporter='fixture-student-01',visitor='fixture-student-02';
 const input={
  title:'Used programming textbook',
  description:'A lightly used campus course textbook in good condition.',
  category:'books',condition:'good',pricePkr:1400,contactConsent:false
 };
 const anonymous=await request(app).get('/api/v1/marketplace');
 assert.equal(anonymous.status,401);
 const invalid=await request(app).post('/api/v1/marketplace')
  .set(auth(seller)).send({...input,sellerId:String(admin._id)});
 assert.equal(invalid.status,422);
 const created=await request(app).post('/api/v1/marketplace').set(auth(seller)).send(input);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.data.id;
 assert.equal(created.body.data.status,'published');
 assert.equal(created.body.data.contactAvailable,false);
 assert.ok(!('sellerId' in created.body.data));
 assert.ok(!('universityId' in created.body.data));

 const contactDenied=await request(app).get('/api/v1/marketplace/'+id+'/contact').set(auth(visitor));
 assert.equal(contactDenied.status,404);
 const wrongEdit=await request(app).patch('/api/v1/marketplace/'+id)
  .set(auth(reporter)).send({pricePkr:1});
 assert.equal(wrongEdit.status,404);
 const edit=await request(app).patch('/api/v1/marketplace/'+id)
  .set(auth(seller)).send({contactConsent:true,pricePkr:1000});
 assert.equal(edit.status,200,JSON.stringify(edit.body));
 const contact=await request(app).get('/api/v1/marketplace/'+id+'/contact').set(auth(visitor));
 assert.equal(contact.status,200,JSON.stringify(contact.body));
 assert.equal(contact.body.data.email,seller+'@'+DOMAIN);

 const binary=Buffer.from('89504e470d0a1a0a0000000049454e44','hex');
 const badUpload=await request(app).post('/api/v1/marketplace/'+id+'/image')
  .set(auth(reporter)).attach('file',binary,{filename:'photo.png',contentType:'image/png'});
 assert.equal(badUpload.status,404);
 const photo=await request(app).post('/api/v1/marketplace/'+id+'/image')
  .set(auth(seller)).attach('file',binary,{filename:'photo.png',contentType:'image/png'});
 assert.equal(photo.status,200,JSON.stringify(photo.body));
 assert.equal(photo.body.data.hasImage,true);
 const imageRead=await request(app).get('/api/v1/marketplace/'+id+'/image').set(auth(visitor));
 assert.equal(imageRead.status,200);
 assert.ok(imageRead.headers['content-type'].includes('image/png'));


 // Another tenant's content never enters this university's browse feed.
 await MarketplaceListing.create({
  ...input,universityId:new mongoose.Types.ObjectId(),
  sellerId:students[3]._id,status:'published'
 });
 const browse=await request(app).get('/api/v1/marketplace?category=books&q=programming')
  .set(auth(visitor));
 assert.equal(browse.status,200,JSON.stringify(browse.body));
 assert.ok(browse.body.data.some(x=>x.id===id));
 assert.equal(browse.body.data.length,1);
 const wrongMine=await request(app).get('/api/v1/me/marketplace').set(auth(visitor));
 assert.equal(wrongMine.status,200);
 assert.ok(!wrongMine.body.data.some(x=>x.id===id));

 const selfReport=await request(app).post('/api/v1/marketplace/'+id+'/reports')
  .set(auth(seller)).send({reason:'spam'});
 assert.equal(selfReport.status,403);
 const reported=await request(app).post('/api/v1/marketplace/'+id+'/reports')
  .set(auth(reporter)).send({reason:'scam',detail:'Suspicious test item description'});
 assert.equal(reported.status,201,JSON.stringify(reported.body));
 const reportAgain=await request(app).post('/api/v1/marketplace/'+id+'/reports')
  .set(auth(reporter)).send({reason:'scam'});
 assert.equal(reportAgain.status,409);
 const deniedQueue=await request(app).get('/api/v1/admin/marketplace/reports')
  .set(auth(reporter));
 assert.equal(deniedQueue.status,403);
 const queue=await request(app).get('/api/v1/admin/marketplace/reports?status=open')
  .set(auth('fixture-admin'));
 assert.equal(queue.status,200,JSON.stringify(queue.body));
 assert.ok(queue.body.data.some(x=>x.id===reported.body.data.id));
 const resolved=await request(app).post(
  '/api/v1/admin/marketplace/reports/'+reported.body.data.id+'/resolve')
  .set(auth('fixture-admin')).send({action:'archive',note:'Moderation fixture confirms removal'});
 assert.equal(resolved.status,200,JSON.stringify(resolved.body));
 assert.equal(resolved.body.data.status,'actioned');
 const vanished=await request(app).get('/api/v1/marketplace/'+id).set(auth(visitor));
 assert.equal(vanished.status,404);
 const hiddenPhoto=await request(app).get('/api/v1/marketplace/'+id+'/image').set(auth(visitor));
 assert.equal(hiddenPhoto.status,404);
 const adminAudit=await AuditLog.findOne({
  universityId:UNIVERSITY_ID,action:'marketplace.report.archived',
  targetId:reported.body.data.id
 });
 assert.ok(adminAudit);
 const own=await request(app).get('/api/v1/me/marketplace').set(auth(seller));
 assert.equal(own.status,200);
 assert.equal(own.body.data.find(x=>x.id===id).status,'moderated');
},{timeout:60000});
