import test from 'node:test';
import assert from 'node:assert/strict';
import {callApi} from '../src/api.js';

const user={getIdToken:async()=>'fixture'};
test('API responses require data and preserve server errors and pagination',async t=>{
 const fetch=t.mock.method(globalThis,'fetch');
 const respond=(body,status=200)=>fetch.mock.mockImplementation(async()=>Response.json(body,{status}));
 for(const body of [null,[],{},'invalid']){
  respond(body);
  await assert.rejects(callApi('/events',user),/invalid response/);
 }
 respond({data:[],meta:{page:2}});
 assert.deepEqual(await callApi('/events',user,{includeMeta:true}),{data:[],meta:{page:2}});
 respond({error:{code:'CHANGED',message:'Refresh and retry'}},409);
 await assert.rejects(callApi('/events',user),{code:'CHANGED',status:409,message:'Refresh and retry'});
});
