import test from 'node:test';
import assert from 'node:assert/strict';
import {
 complaintInput,complaintStaffUpdate,complaintView
} from '../src/services/complaint-validation.js';

const input={category:'academic',title:'Lecture schedule mismatch',
 description:'The class time differs from the published timetable.'};
test('complaint submission accepts only subject, category and details',()=>{
 assert.deepEqual(complaintInput(input),input);
 for(const bad of [
  {...input,studentId:'someone-else'},
  {...input,status:'resolved'},
  {...input,category:'admin'},
  {...input,title:'hi'},
  {...input,description:'short'},
  {...input,attachments:['private.pdf']}
 ])assert.throws(()=>complaintInput(bad));
});
test('staff transitions are strictly sequential and resolve requires response',()=>{
 const submitted={status:'submitted',staffResponse:''};
 assert.equal(complaintStaffUpdate({status:'in_review'},submitted).status,'in_review');
 assert.throws(()=>complaintStaffUpdate({status:'resolved'},submitted),/Allowed next status/);
 assert.throws(()=>complaintStaffUpdate({status:'resolved'},{status:'in_review',staffResponse:''}),
  /response/);
 assert.deepEqual(
  complaintStaffUpdate({status:'resolved',staffResponse:'The new timetable is published.'},
   {status:'in_review',staffResponse:''}),
  {status:'resolved',staffResponse:'The new timetable is published.'}
 );
 assert.throws(()=>complaintStaffUpdate({status:'submitted'},{status:'closed',staffResponse:''}));
 assert.throws(()=>complaintStaffUpdate({status:'in_review',studentId:'other'},submitted));
});
test('safe complaint payload never leaks student identity or handler IDs',()=>{
 const result=complaintView({
  _id:'fake-id',...input,status:'in_review',staffResponse:'We are reviewing.',
  createdAt:new Date(),updatedAt:new Date(),
  studentId:'secret-student-id',universityId:'secret-campus-id',
  handledBy:'secret-handler-id',firebaseUid:'secret-firebase-id'
 });
 assert.equal(result.title,input.title);
 for(const key of ['studentId','universityId','handledBy','firebaseUid']){
  assert.equal(Object.hasOwn(result,key),false);
 }
});
