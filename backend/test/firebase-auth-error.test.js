import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFirebaseVerificationError} from '../src/middleware/firebase-auth.js';

test('revoked and expired tokens result in 401', () => {
 for (const code of ['auth/id-token-revoked','auth/id-token-expired','auth/invalid-id-token']) {
   const err=classifyFirebaseVerificationError({code});
   assert.equal(err.status,401);
   assert.equal(err.code,'INVALID_TOKEN');
 }
});
test('disabled Firebase account is forbidden', () => {
 const err=classifyFirebaseVerificationError({code:'auth/user-disabled'});
 assert.equal(err.status,403);
});
test('bad credentials and permissions are service errors, not token errors', () => {
 for (const code of ['auth/insufficient-permission','auth/invalid-credential','ENOENT','EACCES']) {
   const err=classifyFirebaseVerificationError({code});
   assert.equal(err.status,503);
   assert.equal(err.code,'FIREBASE_VERIFICATION_UNAVAILABLE');
 }
});
test('unknown errors fail closed without leaking underlying error', () => {
 const err=classifyFirebaseVerificationError(new Error('sensitive local file path'));
 assert.equal(err.status,503);
 assert.doesNotMatch(err.message,/sensitive/);
});
