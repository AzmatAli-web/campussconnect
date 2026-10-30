import {Router} from 'express';
import mongoose from 'mongoose';
import {User} from '../models/user.js';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {requireFirebaseAuth} from '../middleware/firebase-auth.js';
import {assertVerifiedCampusIdentity,validateBootstrap,validateProfilePatch,newUserFromVerifiedIdentity,effectiveRoles} from '../services/identity.js';
const data=doc=>({data:doc.toObject?doc.toObject():doc});
export function identityRouter({config,firebaseAuth}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.use(requireFirebaseAuth(firebaseAuth));
 router.use((_req,_res,next)=>{
  if (!config.universityId || mongoose.connection.readyState!==1) return next(new HttpError(503,'SERVICE_NOT_READY','Campus or database not configured'));
  next();
 });
 router.post('/auth/bootstrap-profile',asyncHandler(async(req,res)=>{
  const email=assertVerifiedCampusIdentity(req.firebaseClaims,config.domains);
  const input=validateBootstrap(req.body);
  const existing=await User.findOne({firebaseUid:req.firebaseClaims.uid});
  if (existing) {
   if (existing.emailNormalized!==email || String(existing.universityId)!==config.universityId) throw new HttpError(409,'PROFILE_CONFLICT','Profile requires administrator review');
   return res.status(200).json(data(existing));
  }
  if (input.departmentId) throw new HttpError(422,'DEPARTMENT_NOT_SUPPORTED','Department selection not yet enabled');
  const draft=newUserFromVerifiedIdentity({claims:req.firebaseClaims,email,input,universityId:config.universityId});
  const created=await User.findOneAndUpdate({firebaseUid:draft.firebaseUid},{$setOnInsert:draft},{upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});
  if (created.emailNormalized!==email || String(created.universityId)!==config.universityId) throw new HttpError(409,'PROFILE_CONFLICT','Profile requires administrator review');
  return res.status(201).json(data(created));
 }));
 const own=asyncHandler(async(req,_res,next)=>{
  const email=assertVerifiedCampusIdentity(req.firebaseClaims,config.domains);
  const user=await User.findOne({firebaseUid:req.firebaseClaims.uid,universityId:config.universityId});
  if (!user) throw new HttpError(404,'PROFILE_NOT_FOUND','Profile not provisioned');
  if (user.emailNormalized!==email) throw new HttpError(403,'EMAIL_CHANGED','Email change requires administrator review');
  req.currentUser=user;next();
 });
 router.get('/me',own,(req,res)=>res.json(data(req.currentUser)));
 router.get('/me/roles',own,(req,res)=>res.json({data:{activeRoles:effectiveRoles(req.currentUser),status:req.currentUser.status,requestedRole:req.currentUser.requestedRole}}));
 router.patch('/me',own,asyncHandler(async(req,res)=>{
  const update=validateProfilePatch(req.body);
  if (Object.hasOwn(update,'departmentId')) throw new HttpError(422,'DEPARTMENT_NOT_SUPPORTED','Department selection not enabled');
  const changed=await User.findOneAndUpdate({_id:req.currentUser._id,universityId:config.universityId},{$set:update},{new:true,runValidators:true});
  if (!changed) throw new HttpError(404,'PROFILE_NOT_FOUND','Profile not found');
  return res.json(data(changed));
 }));
 return router;
}
