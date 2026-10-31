import {Router} from 'express';
import mongoose from 'mongoose';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {User} from '../models/user.js';
import {Society,SocietyManagerAssignment} from '../models/campus-content.js';
import {AdminBootstrap,AuditLog,StaffInvitation} from '../models/governance.js';
import {emailMatchesDomains,normalizeEmail} from '../services/identity.js';
import {pagination,requireObjectId} from '../services/mvp-validation.js';
import {
  parseStatusChange,parseFacultyApproval,parseManagerAssignment,
  parseStaffInvitation,parseStaffActivation,parseReason,parseSociety,
  assertEligibleFaculty,assertVerifiedActiveCampusUser
} from '../services/governance-policy.js';

const university=(deps)=>deps.config.universityId?new mongoose.Types.ObjectId(deps.config.universityId):null;
const requireAdmin=(req,_res,next)=>{
  try{needRole(req,'admin');next();}catch(err){next(err);}
};
const asUser=(user)=>({
  id:String(user._id),fullName:user.fullName,email:user.emailNormalized,
  status:user.status,requestedRole:user.requestedRole,
  activeRoles:user.activeRoles,facultyVerificationStatus:user.facultyVerificationStatus
});
const asSociety=(s)=>({id:String(s._id),name:s.name,slug:s.slug,status:s.status,description:s.description});
const action=(uni,admin,code,type,id,details={})=>({
  universityId:uni,actorId:admin._id,action:code,targetType:type,targetId:id,details
});
async function transaction(fn) {
  const session=await mongoose.startSession();
  try {return await session.withTransaction(()=>fn(session),{
    readConcern:{level:'snapshot'},writeConcern:{w:'majority'}
  });}
  finally{await session.endSession();}
}
async function ensureFreshFirebaseUser(firebaseAuth,user) {
  if(!firebaseAuth) throw new HttpError(503,'FIREBASE_UNAVAILABLE','Firebase is not configured');
  let firebaseUser;
  try{firebaseUser=await firebaseAuth.getUser(user.firebaseUid);}
  catch{throw new HttpError(503,'FIREBASE_UNAVAILABLE','Cannot verify target account identity');}
  if(!firebaseUser.emailVerified || normalizeEmail(firebaseUser.email)!==user.emailNormalized){
    throw new HttpError(409,'TARGET_EMAIL_NOT_VERIFIED','Target email is not currently verified in Firebase');
  }
}
export function governanceRouter(deps) {
  const router=Router(),auth=campusUserMiddleware(deps),uni=university(deps);
  const admin=[...auth,requireAdmin];

  router.get('/admin/users',admin,asyncHandler(async(req,res)=>{
    const {page,limit,skip}=pagination(req.query);
    const filter={universityId:uni};
    const [items,total]=await Promise.all([
      User.find(filter).sort({_id:-1}).skip(skip).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    return res.json({data:items.map(asUser),meta:{page,limit,total}});
  }));

  router.patch('/admin/users/:id/status',admin,asyncHandler(async(req,res)=>{
    const id=requireObjectId(req.params.id),input=parseStatusChange(req.body);
    await transaction(async session=>{
      const target=await User.findOne({_id:id,universityId:uni}).session(session);
      if(!target) throw new HttpError(404,'USER_NOT_FOUND','User not found');
      if(String(target._id)===String(req.currentUser._id)||target.activeRoles.includes('admin')){
        throw new HttpError(403,'ADMIN_PROTECTED','Admin accounts cannot be changed here');
      }
      if(input.status==='active'&&target.status==='pending'){
        throw new HttpError(409,'APPROVAL_REQUIRED','Pending accounts require their role-specific approval');
      }
      if(target.status===input.status) throw new HttpError(409,'STATUS_UNCHANGED','Account already has this status');
      target.status=input.status;
      await target.save({session});
      await AuditLog.create([action(uni,req.currentUser,'user.status.updated','user',target._id,{
        status:input.status,reason:input.reason
      })],{session});
    });
    const target=await User.findOne({_id:id,universityId:uni}).lean();
    return res.json({data:asUser(target)});
  }));

  // Explicit administrator attestation. This is not automatic faculty-email promotion.
  router.post('/admin/users/:id/verify-faculty',admin,asyncHandler(async(req,res)=>{
    const id=requireObjectId(req.params.id),review=parseFacultyApproval(req.body);
    await transaction(async session=>{
      const target=await User.findOne({_id:id,universityId:uni}).session(session);
      assertEligibleFaculty(target);
      if(!emailMatchesDomains(target.emailNormalized,deps.config.domains)){
        throw new HttpError(403,'UNIVERSITY_EMAIL_REQUIRED','Target email is not approved');
      }
      await ensureFreshFirebaseUser(deps.firebaseAuth,target);
      const updated=await User.updateOne({
        _id:target._id,universityId:uni,requestedRole:'faculty',status:'pending',
        facultyVerificationStatus:{$ne:'verified'}
      },{
        $set:{facultyVerificationStatus:'verified',status:'active'},
        $addToSet:{activeRoles:'faculty'}
      },{session});
      if(updated.modifiedCount!==1) throw new HttpError(409,'FACULTY_ALREADY_REVIEWED','Faculty account was already reviewed');
      await AuditLog.create([action(uni,req.currentUser,'faculty.verified','user',target._id,{
        method:review.method,evidenceReference:review.evidenceReference,reviewNote:review.reviewNote
      })],{session});
    });
    return res.json({data:asUser(await User.findOne({_id:id,universityId:uni}).lean())});
  }));

  // Initial society registration is Admin-only. A manager can create subsequent societies.
  router.post('/admin/societies',admin,asyncHandler(async(req,res)=>{
    const input=parseSociety(req.body);
    const created=await transaction(async session=>{
      const [s]=await Society.create([{
        universityId:uni,...input,createdBy:req.currentUser._id,status:'active'
      }],{session});
      await AuditLog.create([action(uni,req.currentUser,'society.initial.created','society',s._id)],{session});
      return s;
    });
    return res.status(201).json({data:asSociety(created)});
  }));

  router.post('/admin/society-manager-assignments',admin,asyncHandler(async(req,res)=>{
    const {societyId,userId}=parseManagerAssignment(req.body);
    const assignment=await transaction(async session=>{
      const [society,target]=await Promise.all([
        Society.findOne({_id:societyId,universityId:uni,status:'active'}).session(session),
        User.findOne({_id:userId,universityId:uni}).session(session)
      ]);
      if(!society) throw new HttpError(404,'SOCIETY_NOT_FOUND','Society not found');
      assertVerifiedActiveCampusUser(target);
      await ensureFreshFirebaseUser(deps.firebaseAuth,target);
      const existing=await SocietyManagerAssignment.findOne({universityId:uni,societyId,userId}).session(session);
      if(existing?.status==='active') throw new HttpError(409,'ALREADY_ASSIGNED','This user already manages this society');
      let result;
      if(existing){
        existing.status='active';existing.approvedBy=req.currentUser._id;existing.approvedAt=new Date();
        result=await existing.save({session});
      }else{
        [result]=await SocietyManagerAssignment.create([{
          universityId:uni,societyId,userId,status:'active',approvedAt:new Date(),approvedBy:req.currentUser._id
        }],{session});
      }
      const updated=await User.updateOne({_id:userId,universityId:uni,status:'active'},{$addToSet:{activeRoles:'societyManager'}},{session});
      if(updated.matchedCount!==1) throw new HttpError(409,'ACCOUNT_CHANGED','Manager account changed during assignment');
      await AuditLog.create([action(uni,req.currentUser,'society.manager.assigned','society',societyId,{userId:String(userId)})],{session});
      return result;
    });
    return res.status(201).json({data:{id:String(assignment._id),societyId,userId,status:assignment.status}});
  }));

  router.post('/admin/society-manager-assignments/:id/revoke',admin,asyncHandler(async(req,res)=>{
    const id=requireObjectId(req.params.id),reason=parseReason(req.body);
    await transaction(async session=>{
      const assignment=await SocietyManagerAssignment.findOne({_id:id,universityId:uni,status:'active'}).session(session);
      if(!assignment) throw new HttpError(404,'ASSIGNMENT_NOT_FOUND','Active assignment not found');
      assignment.status='revoked';
      await assignment.save({session});
      const remaining=await SocietyManagerAssignment.countDocuments({
        universityId:uni,userId:assignment.userId,status:'active'
      }).session(session);
      if(!remaining){
        await User.updateOne({_id:assignment.userId,universityId:uni},{$pull:{activeRoles:'societyManager'}},{session});
      }
      await AuditLog.create([action(uni,req.currentUser,'society.manager.revoked','society',assignment.societyId,{
        userId:String(assignment.userId),reason
      })],{session});
    });
    return res.json({data:{status:'revoked'}});
  }));

  router.post('/admin/staff-invitations',admin,asyncHandler(async(req,res)=>{
    const input=parseStaffInvitation(req.body,deps.config.domains);
    const invite=await transaction(async session=>{
      const [created]=await StaffInvitation.create([{
        universityId:uni,...input,invitedBy:req.currentUser._id,
        expiresAt:new Date(Date.now()+7*24*3600*1000),status:'pending'
      }],{session});
      await AuditLog.create([action(uni,req.currentUser,'staff.invited','staffInvitation',created._id,{
        universityEmailNormalized:input.universityEmailNormalized
      })],{session});
      return created;
    });
    return res.status(201).json({data:{id:String(invite._id),status:invite.status,expiresAt:invite.expiresAt}});
  }));

  router.post('/admin/staff-invitations/:id/activate',admin,asyncHandler(async(req,res)=>{
    const id=requireObjectId(req.params.id),{userId}=parseStaffActivation(req.body);
    const result=await transaction(async session=>{
      const invite=await StaffInvitation.findOne({
        _id:id,universityId:uni,status:'pending',expiresAt:{$gt:new Date()}
      }).session(session);
      if(!invite) throw new HttpError(404,'INVITATION_NOT_FOUND','Invitation missing, expired or revoked');
      const user=await User.findOne({_id:userId,universityId:uni}).session(session);
      assertVerifiedActiveCampusUser(user);
      if(user.emailNormalized!==invite.universityEmailNormalized) throw new HttpError(403,'EMAIL_MISMATCH','Invitation email must match user');
      await ensureFreshFirebaseUser(deps.firebaseAuth,user);
      const result=await User.updateOne({_id:user._id,universityId:uni,status:'active'},{$addToSet:{activeRoles:'staff'}},{session});
      if(result.matchedCount!==1) throw new HttpError(409,'ACCOUNT_CHANGED','Staff account changed during activation');
      invite.status='activated';invite.activatedBy=req.currentUser._id;invite.activatedUserId=user._id;
      await invite.save({session});
      await AuditLog.create([action(uni,req.currentUser,'staff.activated','user',user._id,{
        invitationId:String(invite._id)
      })],{session});
      return {id:String(invite._id),userId:String(user._id),status:'activated'};
    });
    return res.json({data:result});
  }));

  router.post('/admin/staff-invitations/:id/revoke',admin,asyncHandler(async(req,res)=>{
    const id=requireObjectId(req.params.id),reason=parseReason(req.body);
    const invite=await transaction(async session=>{
      const revoked=await StaffInvitation.findOneAndUpdate({
        _id:id,universityId:uni,status:'pending'
      },{$set:{status:'revoked',revokedBy:req.currentUser._id}},{new:true,session});
      if(!revoked) throw new HttpError(404,'INVITATION_NOT_FOUND','Pending invitation not found');
      await AuditLog.create([action(uni,req.currentUser,'staff.invitation.revoked','staffInvitation',revoked._id,{reason})],{session});
      return revoked;
    });
    return res.json({data:{id:String(invite._id),status:invite.status}});
  }));

  router.get('/admin/audit-logs',admin,asyncHandler(async(req,res)=>{
    const {page,limit,skip}=pagination(req.query);
    const [items,total]=await Promise.all([
      AuditLog.find({universityId:uni}).sort({occurredAt:-1,_id:-1}).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments({universityId:uni})
    ]);
    return res.json({data:items,meta:{page,limit,total}});
  }));

  // Existing verified Society Managers may create additional societies.
  router.post('/societies',auth,asyncHandler(async(req,res)=>{
    needRole(req,'societyManager');
    const input=parseSociety(req.body);
    const active=await SocietyManagerAssignment.exists({
      universityId:uni,userId:req.currentUser._id,status:'active'
    });
    if(!active) throw new HttpError(403,'MANAGER_ASSIGNMENT_REQUIRED','An active society assignment is required');
    const created=await transaction(async session=>{
      const [s]=await Society.create([{
        universityId:uni,...input,createdBy:req.currentUser._id,status:'active'
      }],{session});
      await SocietyManagerAssignment.create([{
        universityId:uni,societyId:s._id,userId:req.currentUser._id,
        status:'active',approvedAt:new Date(),approvedBy:req.currentUser._id
      }],{session});
      await AuditLog.create([action(uni,req.currentUser,'society.manager.created','society',s._id)],{session});
      return s;
    });
    return res.status(201).json({data:asSociety(created)});
  }));

  router.get('/me/managed-societies',auth,asyncHandler(async(req,res)=>{
    needRole(req,'societyManager');
    const societyIds=await SocietyManagerAssignment.distinct('societyId',{
      universityId:uni,userId:req.currentUser._id,status:'active'
    });
    const items=societyIds.length?await Society.find({
      universityId:uni,_id:{$in:societyIds},status:'active'
    }).sort({name:1,_id:1}).lean():[];
    res.set('Cache-Control','no-store');
    return res.json({data:items.map(asSociety)});
  }));

  router.get('/societies',auth,asyncHandler(async(req,res)=>{
    const {page,limit,skip}=pagination(req.query);
    const filter={universityId:uni,status:'active'};
    const [items,total]=await Promise.all([
      Society.find(filter).sort({name:1,_id:1}).skip(skip).limit(limit).lean(),
      Society.countDocuments(filter)
    ]);
    return res.json({data:items.map(asSociety),meta:{page,limit,total}});
  }));

  return router;
}
