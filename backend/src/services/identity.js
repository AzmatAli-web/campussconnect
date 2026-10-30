import {HttpError} from '../lib/http-error.js';
const OBJECT_ID=/^[0-9a-f]{24}$/i;
const BOOTSTRAP=new Set(['fullName','departmentId','registrationNo','requestedRole']);
const PATCH=new Set(['fullName','departmentId','registrationNo']);
export const normalizeEmail = value => typeof value==='string'?value.trim().toLowerCase():'';
export function emailMatchesDomains(email,domains) {
  const e=normalizeEmail(email),at=e.lastIndexOf('@');
  return at>0 && domains.includes(e.slice(at+1));
}
export function assertVerifiedCampusIdentity(claims,domains) {
  if (!domains.length) throw new HttpError(503,'CAMPUS_DOMAIN_NOT_CONFIGURED','University email domain not configured');
  if (!claims || claims.email_verified!==true || typeof claims.uid!=='string' || !claims.uid) throw new HttpError(403,'EMAIL_NOT_VERIFIED','Verified email is required');
  if (!emailMatchesDomains(claims.email,domains)) throw new HttpError(403,'UNIVERSITY_EMAIL_REQUIRED','Verified university email is required');
  return normalizeEmail(claims.email);
}
function validateCommon(input,allowed) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new HttpError(400,'INVALID_BODY','JSON object required');
  if (Object.keys(input).some(k=>!allowed.has(k))) throw new HttpError(422,'UNKNOWN_FIELD','Unknown or privileged field');
  const result={};
  if (Object.hasOwn(input,'fullName')) {
    if (typeof input.fullName!=='string' || input.fullName.trim().length<2 || input.fullName.trim().length>120) throw new HttpError(422,'INVALID_FULL_NAME','Full name must be 2-120 characters');
    result.fullName=input.fullName.trim();
  }
  if (Object.hasOwn(input,'departmentId')) {
    if (input.departmentId!==null && (typeof input.departmentId!=='string' || !OBJECT_ID.test(input.departmentId))) throw new HttpError(422,'INVALID_DEPARTMENT','Invalid department ID');
    result.departmentId=input.departmentId;
  }
  if (Object.hasOwn(input,'registrationNo')) {
    if (input.registrationNo!==null && (typeof input.registrationNo!=='string' || input.registrationNo.trim().length<3 || input.registrationNo.trim().length>40)) throw new HttpError(422,'INVALID_REGISTRATION','Invalid registration number');
    result.registrationNo=typeof input.registrationNo==='string'?input.registrationNo.trim().toUpperCase():null;
  }
  return result;
}
export function validateBootstrap(input) {
  const result=validateCommon(input,BOOTSTRAP);
  if (!result.fullName) throw new HttpError(422,'FULL_NAME_REQUIRED','Full name required');
  const requestedRole=input.requestedRole??'student';
  if (!['student','faculty'].includes(requestedRole)) throw new HttpError(422,'INVALID_ROLE','Only student or faculty may be requested');
  return {...result,requestedRole};
}
export function validateProfilePatch(input) {
  const result=validateCommon(input,PATCH);
  if (!Object.keys(result).length) throw new HttpError(422,'EMPTY_UPDATE','Editable field required');
  return result;
}
export function newUserFromVerifiedIdentity({claims,email,input,universityId}) {
  const student=input.requestedRole==='student';
  return {universityId,firebaseUid:claims.uid,emailNormalized:email,emailVerifiedAt:new Date(),fullName:input.fullName,departmentId:input.departmentId??null,registrationNo:input.registrationNo??null,requestedRole:input.requestedRole,activeRoles:student?['student']:[],status:student?'active':'pending',facultyVerificationStatus:'unverified'};
}
export const effectiveRoles = user => user?.status==='active' && Array.isArray(user.activeRoles)?user.activeRoles:[];
