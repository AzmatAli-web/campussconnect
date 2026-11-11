import test from 'node:test';
import assert from 'node:assert/strict';
import {
 emptySocietyBody,societyMembersFilter,reviewSocietyMembership,
 societyMembershipView,privateSocietyMemberView
} from '../src/services/society-membership-validation.js';

test('student membership requests do not accept spoofed owner or role fields',()=>{
 assert.doesNotThrow(()=>emptySocietyBody({}));
 for(const bad of [{studentId:'other'},{universityId:'other'},{status:'active'},{role:'admin'},[],null,'hi']){
  assert.throws(()=>emptySocietyBody(bad));
 }
});
test('manager directory accepts only strict pending/active status with pagination',()=>{
 assert.equal(societyMembersFilter({}).status,'pending');
 assert.equal(societyMembersFilter({status:'active',limit:'20'}).limit,20);
 for(const bad of [
  {status:'removed'},{status:'all'},{studentEmail:'user@example.test'},
  {page:'0'},{universityId:'other'}
 ])assert.throws(()=>societyMembersFilter(bad));
});
test('approve, reject, remove require exact reviewed action and appropriate note',()=>{
 assert.deepEqual(reviewSocietyMembership({action:'approve'}),{action:'approve',note:''});
 assert.deepEqual(reviewSocietyMembership({action:'reject',note:'Not eligible for this club'}),
  {action:'reject',note:'Not eligible for this club'});
 for(const bad of [
  {action:'reject'},{action:'remove',note:'x'},
  {action:'approve',status:'active'},
  {action:'grantAdmin',note:'Please approve'}
 ])assert.throws(()=>reviewSocietyMembership(bad));
});
test('student DTO never discloses student identity or privileged reviewer',()=>{
 const doc={
  _id:'membership',societyId:'society',status:'active',
  studentId:'secret',reviewedBy:'manager',universityId:'university',
  requestedAt:new Date(),reviewedAt:null,reviewNote:'Welcome',
 };
 const view=societyMembershipView(doc);
 assert.equal(view.status,'active');
 for(const key of ['studentId','universityId','reviewedBy','endedBy','endReason']){
  assert.equal(Object.hasOwn(view,key),false);
 }
 const mgr=privateSocietyMemberView(doc,{
  fullName:'Example Student',emailNormalized:'student@university.example'
 });
 assert.deepEqual(mgr.student,{
  name:'Example Student',email:'student@university.example'
 });
 assert.equal(Object.hasOwn(mgr,'reviewedBy'),false);
});
