import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import multer from 'multer';
import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {requireObjectId,requireBody,pagination} from '../services/mvp-validation.js';
import {MarketplaceListing,MarketplaceReport} from '../models/marketplace.js';
import {User} from '../models/user.js';
import {AuditLog} from '../models/governance.js';
import {
 marketplaceInput,marketplaceFilter,marketplaceReportInput,marketplaceResolutionInput,
 marketplaceView,reportView,validateMarketplaceImage
} from '../services/marketplace-validation.js';

const imageUpload=multer({
 storage:multer.memoryStorage(),
 limits:{fileSize:2*1024*1024,files:1,fields:0,parts:1}
}).single('file');
function imageMiddleware(req,res,next){
 if(!req.is('multipart/form-data'))
  return next(new HttpError(415,'MULTIPART_REQUIRED','Upload an image as multipart form data'));
 imageUpload(req,res,error=>{
  if(error instanceof multer.MulterError)
   return next(new HttpError(error.code==='LIMIT_FILE_SIZE'?413:422,
    'INVALID_MARKET_IMAGE','One image up to 2 MB is permitted'));
  next(error);
 });
}
function storageRoot(deps){
 return path.resolve(deps.config.marketplaceUploadDir||
  process.env.MARKETPLACE_UPLOAD_DIR||path.join(process.cwd(),'private_uploads','marketplace'));
}
const validImageKey=/^[a-f0-9-]{36}\.(jpg|png|webp)$/;
function assertEmpty(body){
 requireBody(body,[]);
}
export function marketplaceRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 router.get('/marketplace',auth,asyncHandler(async(req,res)=>{
  const {filter,page,limit,skip}=marketplaceFilter(req.query);
  const condition={universityId:deps.config.universityId,status:'published',...filter};
  const [rows,total]=await Promise.all([
   MarketplaceListing.find(condition).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   MarketplaceListing.countDocuments(condition)
  ]);
  return res.json({data:rows.map(marketplaceView),meta:{page,limit,total}});
 }));
 router.get('/me/marketplace',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  if(Object.keys(req.query).some(k=>!['page','limit'].includes(k)))
   throw new HttpError(400,'INVALID_MARKETPLACE_FILTER','Unsupported filter');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,sellerId:req.currentUser._id};
  const [rows,total]=await Promise.all([
   MarketplaceListing.find(filter).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   MarketplaceListing.countDocuments(filter)
  ]);
  return res.json({data:rows.map(marketplaceView),meta:{page,limit,total}});
 }));
 router.post('/marketplace',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const data=marketplaceInput(req.body);
  const doc=await MarketplaceListing.create({
   ...data,universityId:deps.config.universityId,
   sellerId:req.currentUser._id,status:'published'
  });
  return res.status(201).json({data:marketplaceView(doc)});
 }));
 router.get('/marketplace/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const doc=await MarketplaceListing.findOne({
   _id:id,universityId:deps.config.universityId,status:'published'
  }).lean();
  if(!doc)throw new HttpError(404,'MARKETPLACE_NOT_FOUND','Listing unavailable');
  return res.json({data:marketplaceView(doc)});
 }));
 router.patch('/marketplace/:id',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id),updates=marketplaceInput(req.body,{partial:true});
  const changed=await MarketplaceListing.findOneAndUpdate({
   _id:id,universityId:deps.config.universityId,
   sellerId:req.currentUser._id,status:'published'
  },{$set:updates},{new:true,runValidators:true});
  if(!changed)throw new HttpError(404,'MARKETPLACE_NOT_EDITABLE','Your published listing was not found');
  return res.json({data:marketplaceView(changed)});
 }));
 router.post('/marketplace/:id/status',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id);
  const body=requireBody(req.body,['status']);
  if(body.status!=='sold'&&body.status!=='archived')
   throw new HttpError(422,'INVALID_MARKETPLACE_STATUS','Choose sold or archived');
  const allowed=body.status==='sold'?['published']:['published','sold'];
  const changed=await MarketplaceListing.findOneAndUpdate({
   _id:id,universityId:deps.config.universityId,sellerId:req.currentUser._id,
   status:{$in:allowed}
  },{$set:{status:body.status}},{new:true});
  if(!changed)throw new HttpError(404,'MARKETPLACE_NOT_EDITABLE','Only your available listings can be updated');
  return res.json({data:marketplaceView(changed)});
 }));
 router.post('/marketplace/:id/image',auth,imageMiddleware,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id);
  const listing=await MarketplaceListing.findOne({
   _id:id,universityId:deps.config.universityId,
   sellerId:req.currentUser._id,status:'published'
  }).lean();
  if(!listing)throw new HttpError(404,'MARKETPLACE_NOT_EDITABLE','Your published listing was not found');
  const {buffer,mime,ext}=validateMarketplaceImage(req.file);
  const key=randomUUID()+ext,root=storageRoot(deps);
  await fs.mkdir(root,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(root,key),buffer,{flag:'wx',mode:0o600});
  let changed;
  try{
   changed=await MarketplaceListing.findOneAndUpdate({
    _id:id,universityId:deps.config.universityId,
    sellerId:req.currentUser._id,status:'published',imageKey:listing.imageKey??null
   },{$set:{imageKey:key,imageMime:mime,imageSize:buffer.length}},{new:true});
   if(!changed)throw new HttpError(409,'MARKETPLACE_CHANGED','Listing changed; refresh and retry');
  }catch(error){await fs.unlink(path.join(root,key)).catch(()=>{});throw error;}
  if(listing.imageKey&&validImageKey.test(listing.imageKey))
   await fs.unlink(path.join(root,listing.imageKey)).catch(()=>{});
  return res.json({data:marketplaceView(changed)});
 }));
 router.get('/marketplace/:id/image',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const listing=await MarketplaceListing.findOne({
   _id:id,universityId:deps.config.universityId,status:'published'
  }).lean();
  if(!listing||!listing.imageKey||!validImageKey.test(listing.imageKey))
   throw new HttpError(404,'MARKET_IMAGE_NOT_FOUND','Image unavailable');
  const root=storageRoot(deps),file=path.join(root,listing.imageKey);
  let stats;
  try{stats=await fs.stat(file);}catch{throw new HttpError(404,'MARK_IMAGE_MISSING','Image unavailable');}
  if(!stats.isFile()||stats.size!==listing.imageSize)
   throw new HttpError(409,'MARK_IMAGE_CHANGED','Image unavailable');
  res.type(listing.imageMime);
  return res.sendFile(listing.imageKey,{root,headers:{
   'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
  }},error=>{if(error&&!res.headersSent)res.status(404).end();else if(error)res.destroy();});
 }));
 router.get('/marketplace/:id/contact',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const listing=await MarketplaceListing.findOne({
   _id:id,universityId:deps.config.universityId,
   status:'published',contactConsent:true
  }).lean();
  if(!listing)throw new HttpError(404,'CONTACT_UNAVAILABLE','Seller has not enabled email contact');
  const seller=await User.findOne({
   _id:listing.sellerId,universityId:deps.config.universityId,
   status:'active',activeRoles:'student'
  }).select('emailNormalized').lean();
  if(!seller)throw new HttpError(404,'CONTACT_UNAVAILABLE','Seller contact unavailable');
  return res.json({data:{email:seller.emailNormalized}});
 }));
 router.post('/marketplace/:id/reports',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const input=marketplaceReportInput(req.body);
  const listing=await MarketplaceListing.findOne({
   _id:id,universityId:deps.config.universityId,status:'published'
  }).lean();
  if(!listing)throw new HttpError(404,'MARKETPLACE_NOT_FOUND','Listing unavailable');
  if(String(listing.sellerId)===String(req.currentUser._id))
   throw new HttpError(403,'OWN_LISTING_REPORT','Cannot report your own listing');
  try{
   const created=await MarketplaceReport.create({
    ...input,universityId:deps.config.universityId,
    listingId:id,reporterId:req.currentUser._id,status:'open'
   });
   return res.status(201).json({data:{id:String(created._id),status:'open'}});
  }catch(error){
   if(error?.code===11000)throw new HttpError(409,'ALREADY_REPORTED','You already reported this listing');
   throw error;
  }
 }));
 router.get('/admin/marketplace/reports',auth,asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  if(Object.keys(req.query).some(k=>!['page','limit','status'].includes(k)))
   throw new HttpError(400,'INVALID_MARKET_REPORT_QUERY','Unsupported filter');
  if(req.query.status!==undefined&&!['open','dismissed','actioned'].includes(req.query.status))
   throw new HttpError(400,'INVALID_MARKET_REPORT_QUERY','Invalid report status');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,
   ...(req.query.status?{status:req.query.status}:{})};
  const [rows,total]=await Promise.all([
   MarketplaceReport.find(filter).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   MarketplaceReport.countDocuments(filter)
  ]);
  return res.json({data:rows.map(reportView),meta:{page,limit,total}});
 }));
 router.post('/admin/marketplace/reports/:id/resolve',auth,asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const id=requireObjectId(req.params.id);
  const {action,note}=marketplaceResolutionInput(req.body);
  const session=await mongoose.startSession();
  let updated;
  try{
   await session.withTransaction(async()=>{
    const report=await MarketplaceReport.findOne({
     _id:id,universityId:deps.config.universityId,status:'open'
    }).session(session).lean();
    if(!report)throw new HttpError(404,'REPORT_NOT_OPEN','Report not found or already reviewed');
    if(action==='archive'){
     await MarketplaceListing.updateOne({
      _id:report.listingId,universityId:deps.config.universityId,
      status:{$in:['published','sold']}
     },{$set:{status:'moderated',moderatedBy:req.currentUser._id,
      moderatedAt:new Date()}},{session});
    }
    updated=await MarketplaceReport.findOneAndUpdate({
     _id:id,universityId:deps.config.universityId,status:'open'
    },{$set:{status:action==='archive'?'actioned':'dismissed',
     resolvedBy:req.currentUser._id,resolvedAt:new Date(),
     resolutionNote:note}},{session,new:true});
    if(!updated)throw new HttpError(409,'REPORT_CHANGED','Report was reviewed concurrently');
    await AuditLog.create([{
     universityId:deps.config.universityId,actorId:req.currentUser._id,
     action:action==='archive'?'marketplace.report.archived':'marketplace.report.dismissed',
     targetType:'marketplaceReport',targetId:report._id,
     details:{listingId:String(report.listingId),reason:report.reason,note}
    }],{session});
   });
  }finally{await session.endSession();}
  return res.json({data:reportView(updated)});
 }));
 return router;
}
