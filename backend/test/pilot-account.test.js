import test from 'node:test';
import assert from 'node:assert/strict';
import {assertVerifiedCampusIdentity} from '../src/services/identity.js';
import {parseEnvironment} from '../src/config/environment.js';

test('external pilot account requires a verified matching UID and email',()=>{
  const email='pilot@example.org';
  const config=parseEnvironment({PILOT_ACCOUNT_UID:'pilot',PILOT_ACCOUNT_EMAIL:email});
  const claims={uid:'pilot',email,email_verified:true};
  const verify=(identity,pilot)=>assertVerifiedCampusIdentity(identity,['campus.edu'],pilot);
  assert.equal(verify(claims,config.pilotAccount),email);
  for(const change of [{uid:'other'},{email:'other@example.org'},{email_verified:false}]){
    assert.throws(()=>verify({...claims,...change},config.pilotAccount));
  }
  assert.throws(()=>verify(claims,null));
  assert.throws(()=>parseEnvironment({PILOT_ACCOUNT_EMAIL:email}));
});
