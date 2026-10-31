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
 assert.ok(await AuditLog.countDocuments({action:'society.manager.revoked'})>=1);
});

test('one-time Admin bootstrap unique index cannot create a second bootstrap record',async()=>{
 await AdminBootstrap.create({universityId:UNIVERSITY_ID,adminUserId:admin._id,firebaseUid:admin.firebaseUid});
 await assert.rejects(()=>AdminBootstrap.create({
  universityId:UNIVERSITY_ID,adminUserId:manager._id,firebaseUid:manager.firebaseUid
 }),error=>error.code===11000);
});
