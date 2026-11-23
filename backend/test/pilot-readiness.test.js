import test from 'node:test';
import assert from 'node:assert/strict';
import {
 inspectPilotEnvironment,assertPilotApiUrl,readOnlyPilotSmoke
} from '../src/services/pilot-readiness.js';

const safeStaging=()=>({
 NODE_ENV:'production',
 PORT:'4000',
 CORS_ORIGIN:'https://staging-campus.example.edu.pk',
 MONGODB_URI:'mongodb+srv://fixture:fixture@campus-qa.abc.mongodb.net/campus?retryWrites=true',
 FIREBASE_PROJECT_ID:'fictional-campus-staging',
 UNIVERSITY_ID:'65aabbccddeeff0011223344',
 UNIVERSITY_EMAIL_DOMAINS:'campus.example.edu.pk',
 CAMPUS_PILOT_STAGE:'staging',
 CAMPUS_PILOT_DATA_POLICY:'fictional-only',
 CAMPUS_PILOT_API_BASE_URL:'https://staging-api-campus.example.edu.pk',
 CAMPUS_PILOT_OWNER:'authorized-fixture',
 CAMPUS_PILOT_ROLLBACK_OWNER:'authorized-rollback-fixture',
 CAMPUS_PILOT_APPROVED_TEST_ACCOUNTS:'synthetic-account-fixture'
});
test('Pilot preflight rejects missing configuration and remains offline',()=>{
 const result=inspectPilotEnvironment({});
 assert.equal(result.ok,false);
 assert.ok(result.failures.includes('INVALID_BACKEND_ENVIRONMENT')||
   result.failures.includes('REQUIRE_PRODUCTION_RUNTIME_MODE'));
 assert.ok(result.failures.includes('REQUIRE_EXPLICIT_STAGING_STAGE'));
 assert.ok(result.failures.includes('REQUIRE_FICTIONAL_DATA_POLICY'));
});
test('Pilot preflight accepts complete fictional, isolated staging config only',()=>{
 const result=inspectPilotEnvironment(safeStaging());
 assert.deepEqual(result.failures,[]);
 assert.equal(result.ok,true);
 assert.equal(result.checks.parsedConfiguration,true);
 assert.equal(result.checks.isolatedAtlasUri,true);
 assert.ok(result.warnings.includes('PHYSICAL_ANDROID_AND_FCM_ACCEPTANCE_DEFERRED'));
});
test('Pilot preflight blocks localhost, emulator, insecure Atlas and real-data policy',()=>{
 const changes=[
  {CORS_ORIGIN:'https://localhost:4000'},
  {CORS_ORIGIN:'http://staging-campus.example.edu.pk'},
  {CAMPUS_PILOT_API_BASE_URL:'https://production-campus.example.edu.pk'},
  {CAMPUS_PILOT_API_BASE_URL:'http://qa-api.example.edu.pk'},
  {FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'},
  {MONGODB_URI:'mongodb://localhost:27017/campus'},
  {MONGODB_URI:'mongodb+srv://user:pass@db.example.net/campus'},
  {MONGODB_URI:'mongodb+srv://user:pass@db.abc.mongodb.net/campus?tls=false'},
  {NODE_ENV:'development'},
  {CAMPUS_PILOT_DATA_POLICY:'production-data'},
  {CAMPUS_PILOT_APPROVED_TEST_ACCOUNTS:''},
  {CAMPUS_PILOT_OWNER:''},
  {CAMPUS_PILOT_ROLLBACK_OWNER:''},
 ];
 for(const update of changes){
  const result=inspectPilotEnvironment({...safeStaging(),...update});
  assert.equal(result.ok,false,JSON.stringify(Object.keys(update)));
  assert.ok(result.failures.length>=1);
 }
});
test('Read-only smoke requires staging HTTPS origin and never mutates',async()=>{
 for(const url of [
  'http://staging.example.edu.pk',
  'https://production.example.edu.pk',
  'https://localhost',
  'https://staging.example.edu.pk/alternate',
  'https://staging.example.edu.pk/?unsafe=1',
  'https://user:pass@staging.example.edu.pk',
  'https://qa.example.edu.pk/#fragment'
 ])assert.throws(()=>assertPilotApiUrl(url));
 assert.equal(assertPilotApiUrl('https://staging-api.example.edu.pk'),
  'https://staging-api.example.edu.pk');
 const calls=[];
 const fake=async(url,options)=>{
  calls.push({url,options});
  const path=new URL(url).pathname;
  const status=path.includes('health/')?200:401;
  return {
   status,
   headers:{get(name){
    if(name==='content-type')return 'application/json; charset=utf-8';
    if(name==='cache-control')return 'private, no-store';
    return null;
   }}
  };
 };
 const result=await readOnlyPilotSmoke({
  baseUrl:'https://qa-api.example.edu.pk',fetcher:fake
 });
 assert.equal(result.ok,true);
 assert.equal(calls.length,4);
 for(const call of calls){
  assert.equal(call.options.method,'GET');
  assert.equal(call.options.headers.Authorization,undefined);
  assert.equal(call.options.body,undefined);
  assert.equal(new URL(call.url).hostname,'qa-api.example.edu.pk');
 }
});
test('Read-only smoke treats broken auth boundary, readiness and cache policy as failures',async()=>{
 const fetcher=async url=>({
  status:url.endsWith('/notifications')?200:200,
  headers:{get(name){
   return name==='content-type'?'application/json':
     name==='cache-control'?'public, max-age=3600':null;
  }}
 });
 const result=await readOnlyPilotSmoke({
  baseUrl:'https://pilot-api.example.edu.pk',fetcher
 });
 assert.equal(result.ok,false);
 assert.equal(result.results.filter(x=>!x.passed).length,2);
});
