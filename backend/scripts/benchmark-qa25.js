// Milestone 25: deterministic, NON-PRODUCTION smoke benchmark.
// Uses a private MongoMemoryReplSet, mock Firebase claims and synthetic records.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {createApp} from '../src/app.js';
import {User} from '../src/models/user.js';
import {Announcement,Event} from '../src/models/campus-content.js';
import {CampusNotification} from '../src/models/notification.js';
import {SocietyMembership} from '../src/models/society-membership.js';

const universityId=new mongoose.Types.ObjectId();
const studentId=new mongoose.Types.ObjectId();
const domain='cuiatd.edu.pk';
const config={
 universityId:String(universityId),domains:[domain],
 nodeEnv:'test',corsOrigin:'http://localhost:5173',port:4000
};
const claims={
 uid:'qa25-benchmark-user',
 email:'qa25-benchmark-user@'+domain,
 email_verified:true,emailVerified:true
};
const firebaseAuth={
 async verifyIdToken(token){
  if(token!=='qa25-benchmark-token')throw new Error('Invalid mock auth');
  return claims;
 },
 async getUser(){return {uid:claims.uid,email:claims.email,emailVerified:true};}
};
const headers={Authorization:'Bearer qa25-benchmark-token'};
const PLAN_SCAN=/(?:IXSCAN|DISTINCT_SCAN)/;
const percentile=(sorted,q)=>Number(sorted[Math.max(0,Math.ceil(sorted.length*q)-1)].toFixed(2));

async function seed(){
 const now=Date.now();
 await Promise.all([
  User.create({
   _id:studentId,universityId,firebaseUid:claims.uid,
   emailNormalized:claims.email,emailVerifiedAt:new Date(),
   fullName:'Performance Fixture Student',requestedRole:'student',
   activeRoles:['student'],status:'active'
  }),
  Announcement.createIndexes(),
  CampusNotification.createIndexes(),
  Event.createIndexes(),
  SocietyMembership.createIndexes()
 ]);
 // Deliberately thousands rather than a tiny dataset so plans and pagination
 // are exercised against a nontrivial local working set.
 await Announcement.insertMany(Array.from({length:1500},(_,i)=>({
  universityId,authorId:studentId,scope:'university',
  title:'QA25 announcement '+i,
  body:'Synthetic, fictional campus announcement for isolated performance checks.',
  status:'published',publishedAt:new Date(now-i*60_000)
 })),{ordered:true});
 await CampusNotification.insertMany(Array.from({length:500},(_,i)=>({
  universityId,recipientId:studentId,type:'event_registration',
  sourceKey:'qa25-benchmark:'+i,sourceId:new mongoose.Types.ObjectId(),
  title:'QA25 synthetic registration '+i,
  body:'Synthetic confirmation; no actual event reservation exists.',
  createdAt:new Date(now-i*45_000),
  expiresAt:new Date(now+30*86400_000),
  pushState:'skipped',pushNextAt:new Date(now)
 })),{ordered:true});
 await Event.insertMany(Array.from({length:180},(_,i)=>({
  universityId,organizerId:studentId,organizerType:'faculty',
  title:'QA25 synthetic event '+i,
  description:'Fictional event for isolated performance benchmarking',
  venue:'Synthetic lecture hall',capacity:100,confirmedCount:0,
  startsAt:new Date(now+(i+2)*3600_000),
  endsAt:new Date(now+(i+3)*3600_000),
  registrationOpensAt:new Date(now-24*3600_000),
  registrationClosesAt:new Date(now+(i+1)*3600_000),
  status:'published'
 })),{ordered:true});
 await SocietyMembership.insertMany(Array.from({length:80},(_,i)=>({
  universityId,studentId,societyId:new mongoose.Types.ObjectId(),
  status:i%3===0?'active':'pending',requestedAt:new Date(now-i*60000)
 })),{ordered:true});
}

async function ensureIndexUsage(){
 const personal=await CampusNotification.collection.find({
  universityId,recipientId:studentId
 }).sort({createdAt:-1,_id:-1}).limit(20).explain('executionStats');
 const announcements=await Announcement.collection.find({
  universityId,status:'published',scope:'university'
 }).sort({publishedAt:-1,_id:-1}).limit(20).explain('executionStats');
 const membership=await SocietyMembership.collection.find({
  universityId,studentId
 }).sort({updatedAt:-1,_id:-1}).limit(20).explain('executionStats');
 for(const [name,plan] of [
  ['private-inbox',personal],
  ['shared-announcements',announcements],
  ['student-memberships',membership]
 ]){
  const serialized=JSON.stringify(plan.queryPlanner?.winningPlan??{});
  assert.match(serialized,PLAN_SCAN,
   name+' did not use a MongoDB indexed winning plan');
 }
 return {
  personal:{scannedKeys:personal.executionStats?.totalKeysExamined,
   examinedDocs:personal.executionStats?.totalDocsExamined,
   returned:personal.executionStats?.nReturned},
  announcements:{scannedKeys:announcements.executionStats?.totalKeysExamined,
   examinedDocs:announcements.executionStats?.totalDocsExamined,
   returned:announcements.executionStats?.nReturned},
  memberships:{scannedKeys:membership.executionStats?.totalKeysExamined,
   examinedDocs:membership.executionStats?.totalDocsExamined,
   returned:membership.executionStats?.nReturned}
 };
}

async function bench(app,endpoint,iterations=50,concurrency=5){
 const results=[],errors=[];
 // Prewarm application + the database query planner without including it in
 // latency measurements.
 const warm=await request(app).get(endpoint).set(headers);
 assert.equal(warm.status,200,endpoint+' cold request failed '+warm.text);
 for(let offset=0;offset<iterations;offset+=concurrency){
  const current=Array.from({length:Math.min(concurrency,iterations-offset)},async()=>{
   const start=performance.now();
   const res=await request(app).get(endpoint).set(headers);
   const elapsed=performance.now()-start;
   results.push(elapsed);
   if(res.status!==200)errors.push({status:res.status});
   // Exactly 20 records at most. Clients must not load entire collections.
   if(res.status===200){
    const items=Array.isArray(res.body.data)?res.body.data:res.body.data?.items;
    assert.ok(Array.isArray(items)&&items.length<=20,
      endpoint+' returned an unbounded page');
   }
  });
  await Promise.all(current);
 }
 assert.equal(errors.length,0,endpoint+' had failed requests');
 results.sort((a,b)=>a-b);
 return {
  route:endpoint,samples:results.length,parallelClients:concurrency,
  p50Ms:percentile(results,0.5),p95Ms:percentile(results,0.95),
  maxMs:Number(results.at(-1).toFixed(2)),
  failures:0
 };
}

let mongo;
try{
 mongo=await MongoMemoryReplSet.create({
  replSet:{count:1,storageEngine:'wiredTiger'},
  binary:{version:process.env.MONGOMS_VERSION||'7.0.24'}
 });
 await mongoose.connect(mongo.getUri(),{autoIndex:true});
 await seed();
 const app=createApp({config,firebaseAuth});
 const plans=await ensureIndexUsage();
 const cases=[
  '/api/v1/announcements?limit=20',
  '/api/v1/notifications?limit=20',
  '/api/v1/events?limit=20',
  '/api/v1/me/society-memberships?limit=20'
 ];
 const routes=[];
 for(const endpoint of cases){
  routes.push(await bench(app,endpoint));
 }
 const report={
  milestone:25,environment:'isolated-mongodb-memory-server',
  databaseVersion:process.env.MONGOMS_VERSION||'7.0.24',
  synthetic:true,realUserData:false,
  fixtures:{announcements:1500,personalNotifications:500,events:180,memberships:80},
  executedAt:new Date().toISOString(),
  indexUsage:plans,
  routes
 };
 if(process.env.QA25_REPORT_PATH){
  await writeFile(process.env.QA25_REPORT_PATH,
   JSON.stringify(report,null,2)+'\n',{encoding:'utf8'});
 }
 console.log('QA25_BENCHMARK_REPORT='+JSON.stringify(report));
 const budget=Number(process.env.QA25_MAX_P95_MS||0);
 if(budget>0){
  for(const item of routes)assert.ok(item.p95Ms<=budget,
   item.route+' p95 exceeded the explicit '+budget+'ms CI budget');
 }
}finally{
 await mongoose.disconnect();
 if(mongo)await mongo.stop();
}
