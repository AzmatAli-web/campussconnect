import {HttpError} from '../lib/http-error.js';
import {requireBody,requireObjectId,textField} from './mvp-validation.js';
import {emailMatchesDomains,normalizeEmail} from './identity.js';

const EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function requireCampusEmail(value,domains) {
  const email=normalizeEmail(value);
  if(!EMAIL.test(email)||!emailMatchesDomains(email,domains)) {
    throw new HttpError(422,'UNIVERSITY_EMAIL_REQUIRED','A valid approved university email is required');
  }
  return email;
}
export function parseStatusChange(body) {
  requireBody(body,['status','reason']);
  if(!['active','suspended'].includes(body.status)) throw new HttpError(422,'INVALID_STATUS','Status must be active or suspended');
  return {status:body.status,reason:textField(body.reason,'reason',8,500)};
}
export function parseFacultyApproval(body) {
  requireBody(body,['method','evidenceReference','reviewNote','attested']);
  if(!['facultyEmail','document'].includes(body.method)) throw new HttpError(422,'INVALID_EVIDENCE_METHOD','Method must be facultyEmail or document');
  if(body.attested!==true) throw new HttpError(422,'REVIEW_REQUIRED','Administrator must confirm evidence was independently checked');
  return {
    method:body.method,
    evidenceReference:textField(body.evidenceReference,'evidenceReference',6,300),
    reviewNote:textField(body.reviewNote,'reviewNote',10,1000)
  };
}
export function parseManagerAssignment(body) {
  requireBody(body,['societyId','userId']);
  return {societyId:requireObjectId(body.societyId),userId:requireObjectId(body.userId)};
}
export function parseStaffInvitation(body,domains) {
  requireBody(body,['universityEmail']);
  return {universityEmailNormalized:requireCampusEmail(body.universityEmail,domains)};
}
export function parseStaffActivation(body) {
  requireBody(body,['userId']);
  return {userId:requireObjectId(body.userId)};
}
export function parseReason(body) {
  requireBody(body,['reason']);
  return textField(body.reason,'reason',8,500);
}
export function parseSociety(body){
  requireBody(body,['name','slug','description']);
  const name=textField(body.name,'name',3,120);
  const slug=textField(body.slug,'slug',3,80).toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(422,'INVALID_SLUG','Slug must contain letters, digits and hyphens');
  return {name,slug,description:textField(body.description,'description',10,1000)};
}
export function assertEligibleFaculty(user) {
  if(!user||user.requestedRole!=='faculty'||user.status!=='pending'||user.facultyVerificationStatus==='verified'||!user.emailVerifiedAt) {
    throw new HttpError(409,'FACULTY_NOT_ELIGIBLE','Account must have pending Faculty request and a verified email');
  }
}
export function assertVerifiedActiveCampusUser(user) {
  if(!user||user.status!=='active'||!user.emailVerifiedAt||!user.emailNormalized) {
    throw new HttpError(409,'TARGET_NOT_ELIGIBLE','Target account must be an active verified campus user');
  }
}
export function canBootstrapAdmin({firebaseUser,user,domainApproved,universityExists,alreadyBootstrapped,existingAdmin}) {
  return Boolean(firebaseUser?.emailVerified && firebaseUser?.uid &&
    domainApproved && universityExists && user?.status==='active' &&
    user?.emailVerifiedAt && user?.firebaseUid===firebaseUser.uid &&
    normalizeEmail(user?.emailNormalized)===normalizeEmail(firebaseUser?.email) &&
    !alreadyBootstrapped && !existingAdmin);
}
