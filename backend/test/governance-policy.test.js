import test from 'node:test';
import assert from 'node:assert/strict';
import {
 requireCampusEmail,parseStatusChange,parseFacultyApproval,parseManagerAssignment,
 parseStaffInvitation,parseStaffActivation,parseSociety,assertEligibleFaculty,
 assertVerifiedActiveCampusUser,canBootstrapAdmin
} from '../src/services/governance-policy.js';

const id='6ae43793f5a4a7f228330ca7';
const domains=['cuiatd.edu.pk'];
test('faculty approval needs explicit attestation and documented evidence',()=>{
 assert.throws(()=>parseFacultyApproval({method:'document',evidenceReference:'file-123456',reviewNote:'Proof checked by administrator'}),{code:'REVIEW_REQUIRED'});
 assert.throws(()=>parseFacultyApproval({method:'facultyEmail',evidenceReference:'x',reviewNote:'Proof checked by administrator',attested:true}),{code:'INVALID_EVIDENCEREFERENCE'});
 assert.equal(parseFacultyApproval({method:'facultyEmail',evidenceReference:'verified roster entry 2026',reviewNote:'Compared with official faculty roster',attested:true}).method,'facultyEmail');
});
test('privileged role fields cannot be submitted to governance routes',()=>{
 assert.throws(()=>parseManagerAssignment({societyId:id,userId:id,activeRoles:['admin']}),{code:'UNKNOWN_FIELD'});
 assert.throws(()=>parseStatusChange({status:'active',reason:'Reactivation approved',roles:['admin']}),{code:'UNKNOWN_FIELD'});
});
test('staff invitations use exact approved university domain',()=>{
 assert.equal(parseStaffInvitation({universityEmail:'  Employee@cuiatd.edu.pk '},domains).universityEmailNormalized,'employee@cuiatd.edu.pk');
 assert.throws(()=>requireCampusEmail('fake@evilcuiatd.edu.pk',domains),{code:'UNIVERSITY_EMAIL_REQUIRED'});
});
test('status changes require reason and known status',()=>{
 assert.throws(()=>parseStatusChange({status:'pending',reason:'Pending faculty review'}),{code:'INVALID_STATUS'});
 assert.equal(parseStatusChange({status:'suspended',reason:'Account abuse report'}).status,'suspended');
});
test('faculty approval restricted to pending verified faculty',()=>{
 assert.throws(()=>assertEligibleFaculty({requestedRole:'student',status:'active',emailVerifiedAt:new Date()}),{code:'FACULTY_NOT_ELIGIBLE'});
 assert.doesNotThrow(()=>assertEligibleFaculty({requestedRole:'faculty',status:'pending',facultyVerificationStatus:'unverified',emailVerifiedAt:new Date()}));
});
test('manager or staff target must be active verified user',()=>{
 assert.throws(()=>assertVerifiedActiveCampusUser({status:'pending'}),{code:'TARGET_NOT_ELIGIBLE'});
 assert.doesNotThrow(()=>assertVerifiedActiveCampusUser({status:'active',emailVerifiedAt:new Date(),emailNormalized:'test@cuiatd.edu.pk'}));
});
test('bootstrap is one-time and checks identity',()=>{
 const user={firebaseUid:'user1',emailNormalized:'me@cuiatd.edu.pk',status:'active',emailVerifiedAt:new Date()};
 const fb={uid:'user1',email:'me@cuiatd.edu.pk',emailVerified:true};
 assert.equal(canBootstrapAdmin({firebaseUser:fb,user,domainApproved:true,universityExists:true,alreadyBootstrapped:false,existingAdmin:false}),true);
 assert.equal(canBootstrapAdmin({firebaseUser:fb,user,domainApproved:true,universityExists:true,alreadyBootstrapped:true,existingAdmin:false}),false);
 assert.equal(canBootstrapAdmin({firebaseUser:fb,user,domainApproved:true,universityExists:true,alreadyBootstrapped:false,existingAdmin:true}),false);
});
test('society names and slugs checked',()=>{
 assert.equal(parseSociety({name:'Software Society',slug:'software-society',description:'Software engineering society'}).slug,'software-society');
 assert.throws(()=>parseSociety({name:'Software Society',slug:'../../admin',description:'Software engineering society'}),{code:'INVALID_SLUG'});
});
test('activation requires a valid user id',()=>{
 assert.equal(parseStaffActivation({userId:id}).userId,id);
 assert.throws(()=>parseStaffActivation({userId:'not-an-id'}),{code:'INVALID_ID'});
});
