import mongoose from 'mongoose';
import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {requireObjectId,pagination,requireBody} from '../services/mvp-validation.js';
import {Society,SocietyManagerAssignment} from '../models/campus-content.js';
import {SocietyMembership} from '../models/society-membership.js';
import {User} from '../models/user.js';
import {AuditLog} from '../models/governance.js';
import {
 emptySocietyBody,societyMembersFilter,reviewSocietyMembership,
 societyMembershipView,privateSocietyMemberView
} from '../services/society-membership-validation.js';

async function activeSociety(societyId,universityId){
 const society=await Society.findOne({_id:societyId,universityId,status:'active'}).lean();
 if(!society)throw new HttpError(404,'SOCIETY_NOT_FOUND','Active campus society not found');
 return society;
}
async function requireCurrentManager(req,societyId,universityId){
 needRole(req,'societyManager');
 const [society,assignment]=await Promise.all([
  Society.exists({_id:societyId,universityId,status:'active'}),
  SocietyManagerAssignment.exists({
   universityId,societyId,userId:req.currentUser._id,status:'active'
  })
 ]);
 if(!society||!assignment)
  throw new HttpError(403,'SOCIETY_MANAGER_REQUIRED',
   'Active assigned Society Manager is required');
}

export function societyMembershipsRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });

 router.get('/me/society-memberships',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  if(Object.keys(req.query).some(k=>!['page','limit'].includes(k)))
   throw new HttpError(400,'INVALID_MEMBERSHIP_QUERY','Unsupported filter');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,studentId:req.currentUser._id};
  const [rows,total]=await Promise.all([
   SocietyMembership.find(filter).sort({updatedAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   SocietyMembership.countDocuments(filter)
  ]);
  return res.json({data:rows.map(societyMembershipView),meta:{page,limit,total}});
 }));

 // Students cannot select their own status, membership ID, university or role.
 router.post('/societies/:societyId/membership-requests',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  emptySocietyBody(req.body);
  const societyId=requireObjectId(req.params.societyId),uni=deps.config.universityId;
  await activeSociety(societyId,uni);
  const filter={universityId:uni,societyId,studentId:req.currentUser._id};
  const existing=await SocietyMembership.findOne(filter).lean();
  if(existing){
   if(!['rejected','cancelled','left'].includes(existing.status))
    throw new HttpError(409,'MEMBERSHIP_ALREADY_EXISTS',
     'Membership is pending, active or restricted');
   const changed=await SocietyMembership.findOneAndUpdate({
    ...filter,status:existing.status
   },{$set:{
    status:'pending',requestedAt:new Date(),
    reviewedAt:null,reviewedBy:null,reviewNote:'',
    endedAt:null,endedBy:null,endReason:''
   }},{new:true,runValidators:true});
   if(!changed)throw new HttpError(409,'MEMBERSHIP_CHANGED',
    'Membership changed; refresh and retry');
   return res.status(201).json({data:societyMembershipView(changed)});
  }
  try{
   const [created]=await SocietyMembership.create([{
    ...filter,status:'pending',requestedAt:new Date()
   }]);
   return res.status(201).json({data:societyMembershipView(created)});
  }catch(error){
   if(error?.code===11000)throw new HttpError(409,'MEMBERSHIP_ALREADY_EXISTS',
    'Membership request was already submitted');
   throw error;
  }
 }));

 router.post('/me/society-memberships/:id/withdraw',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  emptySocietyBody(req.body);
  const id=requireObjectId(req.params.id),uni=deps.config.universityId;
  const filter={_id:id,universityId:uni,studentId:req.currentUser._id};
  const existing=await SocietyMembership.findOne(filter).lean();
  if(!existing)throw new HttpError(404,'MEMBERSHIP_NOT_FOUND','Your membership not found');
  if(!['pending','active'].includes(existing.status))
   throw new HttpError(409,'MEMBERSHIP_NOT_WITHDRAWABLE',
    'Only pending requests or active memberships can be withdrawn');
  const next=existing.status==='pending'?'cancelled':'left';
  const changed=await SocietyMembership.findOneAndUpdate({
   ...filter,status:existing.status
  },{$set:{status:next,endedAt:new Date(),endedBy:req.currentUser._id}},
   {new:true,runValidators:true});
  if(!changed)throw new HttpError(409,'MEMBERSHIP_CHANGED','Request changed; refresh');
  return res.json({data:societyMembershipView(changed)});
 }));

 router.get('/managed-societies/:societyId/memberships',auth,asyncHandler(async(req,res)=>{
  const societyId=requireObjectId(req.params.societyId),uni=deps.config.universityId;
  await requireCurrentManager(req,societyId,uni);
  const {page,limit,skip,status}=societyMembersFilter(req.query);
  const filter={universityId:uni,societyId,status};
  const [rows,total]=await Promise.all([
   SocietyMembership.find(filter).sort({requestedAt:1,_id:1})
    .skip(skip).limit(limit).lean(),
   SocietyMembership.countDocuments(filter)
  ]);
  const users=rows.length?await User.find({
   _id:{$in:rows.map(m=>m.studentId)},universityId:uni,
   status:'active',activeRoles:'student'
  }).select('_id fullName emailNormalized').lean():[];
  const people=new Map(users.map(u=>[String(u._id),u]));
  return res.json({
   data:rows.map(m=>privateSocietyMemberView(m,people.get(String(m.studentId)))),
   meta:{page,limit,total}
  });
 }));

 router.post('/managed-societies/:societyId/memberships/:id/review',
  auth,asyncHandler(async(req,res)=>{
   const societyId=requireObjectId(req.params.societyId);
   const membershipId=requireObjectId(req.params.id),uni=deps.config.universityId;
   await requireCurrentManager(req,societyId,uni);
   const {action,note}=reviewSocietyMembership(req.body);
   const expected=action==='remove'?'active':'pending';
   const next=action==='approve'?'active':action==='reject'?'rejected':'removed';
   const session=await mongoose.startSession();
   let result;
   try{
    await session.withTransaction(async()=>{
     // Manager assignment is rechecked in the transaction so revocations cannot
     // silently leave stale management authority during an approval.
     const [assignment,society]=await Promise.all([
      SocietyManagerAssignment.exists({
       universityId:uni,societyId,userId:req.currentUser._id,status:'active'
      }).session(session),
      Society.exists({_id:societyId,universityId:uni,status:'active'}).session(session)
     ]);
     if(!assignment||!society)throw new HttpError(403,'SOCIETY_MANAGER_REQUIRED',
      'Society management permission was revoked');
     const before=await SocietyMembership.findOne({
      _id:membershipId,universityId:uni,societyId,status:expected
     }).session(session).lean();
     if(!before)throw new HttpError(409,'MEMBERSHIP_CHANGED',
      'Membership is no longer in the required state');
     if(action==='approve'){
      const student=await User.exists({
       _id:before.studentId,universityId:uni,status:'active',activeRoles:'student'
      }).session(session);
      if(!student)throw new HttpError(409,'STUDENT_NOT_ACTIVE',
       'Cannot approve an inactive student');
     }
     const timestamp=new Date();
     const set=action==='remove'
      ? {status:next,endedAt:timestamp,endedBy:req.currentUser._id,endReason:note}
      : {status:next,reviewedAt:timestamp,reviewedBy:req.currentUser._id,reviewNote:note};
     result=await SocietyMembership.findOneAndUpdate({
      _id:membershipId,universityId:uni,societyId,status:expected
     },{$set:set},{new:true,session,runValidators:true});
     if(!result)throw new HttpError(409,'MEMBERSHIP_CHANGED',
      'Concurrent membership review; refresh before trying again');
     await AuditLog.create([{
      universityId:uni,actorId:req.currentUser._id,
      action:'society.membership.'+next,
      targetType:'societyMembership',targetId:result._id,
      details:{societyId:String(societyId),note}
     }],{session});
    });
   }finally{await session.endSession();}
   return res.json({data:societyMembershipView(result)});
  })
 );
 return router;
}
