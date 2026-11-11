import mongoose from 'mongoose';
import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {requireBody,requireObjectId,pagination} from '../services/mvp-validation.js';
import {LostFoundItem} from '../models/lost-found.js';
import {AuditLog} from '../models/governance.js';
import {
 lostFoundCreate,lostFoundPatch,lostFoundFilter,lostFoundModeration,lostFoundView
} from '../services/lost-found-validation.js';

export function lostFoundRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 router.get('/lost-found-items',auth,asyncHandler(async(req,res)=>{
  const {filter,page,limit,skip}=lostFoundFilter(req.query);
  const scoped={universityId:deps.config.universityId,status:'open',...filter};
  const [items,total]=await Promise.all([
   LostFoundItem.find(scoped).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   LostFoundItem.countDocuments(scoped)
  ]);
  return res.json({data:items.map(lostFoundView),meta:{page,limit,total}});
 }));
 router.get('/me/lost-found-items',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  if(Object.keys(req.query).some(k=>!['page','limit'].includes(k)))
   throw new HttpError(400,'INVALID_LOST_FOUND_QUERY','Unsupported personal report filter');
  const {page,limit,skip}=pagination(req.query);
  const scoped={universityId:deps.config.universityId,reporterId:req.currentUser._id};
  const [items,total]=await Promise.all([
   LostFoundItem.find(scoped).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   LostFoundItem.countDocuments(scoped)
  ]);
  return res.json({data:items.map(lostFoundView),meta:{page,limit,total}});
 }));
 router.post('/lost-found-items',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const data=lostFoundCreate(req.body);
  // Reporter/tenant identity is always derived from authenticated profile, not request body.
  const created=await LostFoundItem.create({
   ...data,universityId:deps.config.universityId,reporterId:req.currentUser._id,
   images:[],status:'open'
  });
  return res.status(201).json({data:lostFoundView(created)});
 }));
 router.get('/lost-found-items/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const found=await LostFoundItem.findOne({
   _id:id,universityId:deps.config.universityId,status:'open'
  }).lean();
  if(!found)throw new HttpError(404,'LOST_FOUND_NOT_FOUND','Report unavailable');
  return res.json({data:lostFoundView(found)});
 }));
 router.patch('/lost-found-items/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const changes=lostFoundPatch(req.body);
  const scoped={_id:id,universityId:deps.config.universityId,status:'open'};
  const current=await LostFoundItem.findOne(scoped).lean();
  if(!current)throw new HttpError(404,'LOST_FOUND_NOT_EDITABLE','Open report unavailable');
  const isOwner=String(current.reporterId)===String(req.currentUser._id);
  if(!isOwner&&!req.roles.includes('admin'))
   throw new HttpError(403,'FORBIDDEN','Only the reporter or Admin may manage a report');
  if(!isOwner&&Object.keys(changes).some(k=>k!=='status'))
   throw new HttpError(403,'FORBIDDEN','Admin may resolve but not rewrite a student report');
  const set={...changes};
  if(changes.status==='resolved')set.resolvedAt=new Date();
  const changed=await LostFoundItem.findOneAndUpdate({
   ...scoped,
   ...(isOwner?{reporterId:req.currentUser._id}:{})
  },{$set:set},{new:true,runValidators:true});
  if(!changed)throw new HttpError(409,'LOST_FOUND_CHANGED','Report changed; refresh before retrying');
  return res.json({data:lostFoundView(changed)});
 }));
 router.post('/admin/lost-found-items/:id/moderation',auth,asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const id=requireObjectId(req.params.id);
  const {reason}=lostFoundModeration(req.body);
  const session=await mongoose.startSession();
  let removed;
  try{
   await session.withTransaction(async()=>{
    removed=await LostFoundItem.findOneAndUpdate({
     _id:id,universityId:deps.config.universityId,status:{$in:['open','resolved']}
    },{$set:{status:'removed',removedBy:req.currentUser._id,
     removedAt:new Date(),removalReason:reason}},{new:true,session});
    if(!removed)throw new HttpError(404,'LOST_FOUND_NOT_FOUND','Report unavailable for moderation');
    await AuditLog.create([{
     universityId:deps.config.universityId,actorId:req.currentUser._id,
     action:'lost_found.report.removed',targetType:'lostFoundItem',targetId:removed._id,
     details:{reason,kind:removed.kind}
    }],{session});
   });
  }finally{await session.endSession();}
  return res.json({data:lostFoundView(removed)});
 }));
 return router;
}
