import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEnvironment} from '../src/config/environment.js';
import {assertVerifiedCampusIdentity,validateBootstrap,validateProfilePatch,newUserFromVerifiedIdentity,effectiveRoles,emailMatchesDomains} from '../src/services/identity.js';
const claims={uid:'u1',email_verified:true,email:'A@University.edu.pk'};
test('development works unconfigured',()=>assert.equal(parseEnvironment({NODE_ENV:'development'}).mongoUri,''));
test('production requires real services',()=>assert.throws(()=>parseEnvironment({NODE_ENV:'production',CORS_ORIGIN:'https://example.org'}),/Production requires/));
test('rejects invalid campus ID',()=>assert.throws(()=>parseEnvironment({UNIVERSITY_ID:'bad'}),/UNIVERSITY_ID/));
test('rejects insecure production origin',()=>assert.throws(()=>parseEnvironment({NODE_ENV:'production',CORS_ORIGIN:'http://example.org'}),/HTTPS/));
test('no implicit domain trust',()=>assert.throws(()=>assertVerifiedCampusIdentity(claims,[]),e=>e.status===503));
test('exact domain only',()=>{
 assert.equal(assertVerifiedCampusIdentity(claims,['university.edu.pk']),'a@university.edu.pk');
 assert.equal(emailMatchesDomains('a@eviluniversity.edu.pk',['university.edu.pk']),false);
});
test('unverified email rejected',()=>assert.throws(()=>assertVerifiedCampusIdentity({...claims,email_verified:false},['university.edu.pk']),e=>e.status===403));
test('cannot self-assign Admin',()=>assert.throws(()=>validateBootstrap({fullName:'Test User',requestedRole:'admin'}),e=>e.code==='INVALID_ROLE'));
test('rejects privileged input fields',()=>assert.throws(()=>validateBootstrap({fullName:'Test User',activeRoles:['admin']}),e=>e.code==='UNKNOWN_FIELD'));
test('normalizes input',()=>assert.equal(validateBootstrap({fullName:' Test User ',registrationNo:' abc123 '}).registrationNo,'ABC123'));
test('faculty request is pending',()=>{
 const u=newUserFromVerifiedIdentity({claims,email:'a@university.edu.pk',universityId:'65aabbccddeeff0011223344',input:validateBootstrap({fullName:'Test User',requestedRole:'faculty'})});
 assert.equal(u.status,'pending');assert.deepEqual(u.activeRoles,[]);
});
test('cannot edit status',()=>assert.throws(()=>validateProfilePatch({status:'active'}),e=>e.code==='UNKNOWN_FIELD'));
test('suspended roles ineffective',()=>assert.deepEqual(effectiveRoles({status:'suspended',activeRoles:['admin']}),[]));
