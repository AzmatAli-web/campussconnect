import mongoose from 'mongoose';
import {User} from '../models/user.js';
import {requireFirebaseAuth} from './firebase-auth.js';
import {assertVerifiedCampusIdentity,effectiveRoles} from '../services/identity.js';
import {HttpError,asyncHandler} from '../lib/http-error.js';

export const campusUserMiddleware=({config,firebaseAuth})=>[
 requireFirebaseAuth(firebaseAuth),
 asyncHandler(async(req,_res,next)=>{
  if(!config.universityId || mongoose.connection.readyState!==1) throw new HttpError(503,'SERVICE_NOT_READY','University or database not configured');
  const email=assertVerifiedCampusIdentity(req.firebaseClaims,config.domains);
  const user=await User.findOne({firebaseUid:req.firebaseClaims.uid,universityId:config.universityId});
  if(!user) throw new HttpError(403,'PROFILE_REQUIRED','Create your campus profile first');
  if(user.emailNormalized!==email) throw new HttpError(403,'EMAIL_CHANGED','Contact an administrator');
  if(user.status!=='active'||effectiveRoles(user).length===0) throw new HttpError(403,'ACCOUNT_NOT_ACTIVE','Account not active');
  req.currentUser=user;req.roles=effectiveRoles(user);
  next();
 })
];
export function needRole(req,...allowed){
 if(!allowed.some(role=>req.roles.includes(role))) throw new HttpError(403,'FORBIDDEN','Insufficient permissions');
}
export function verifiedFaculty(req) {
 if(req.roles.includes('faculty') && req.currentUser.facultyVerificationStatus==='verified') return true;
 return false;
}
