import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../src/app.js';

test('public edge clients receive separate quotas and invalid edge addresses share the peer quota',async()=>{
 const app=createApp({config:{nodeEnv:'production',railwayEdgeOnly:true,corsOrigin:'https://example.test'}});
 const remaining=async address=>{
  const response=await request(app).get('/api/v1/health/live').set('X-Real-IP',address);
  assert.equal(response.status,200);
  return Number(/remaining=(\d+)/.exec(response.headers.ratelimit)[1]);
 };
 assert.equal(await remaining('192.0.2.1'),119);
 assert.equal(await remaining('192.0.2.2'),119);
 assert.equal(await remaining('192.0.2.1'),118);
 assert.equal(await remaining('invalid'),119);
 assert.equal(await remaining('invalid again'),118);
});
