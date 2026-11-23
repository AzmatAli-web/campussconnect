import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {requireObjectId,pagination} from '../services/mvp-validation.js';
import {StudentComplaint} from '../models/complaint.js';
import {complaintInput,complaintStaffUpdate,complaintView} from '../services/complaint-validation.js';

export function complaintsRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  next();
 });
 router.get('/me/complaints',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,studentId:req.currentUser._id};
  const [rows,total]=await Promise.all([
   StudentComplaint.find(filter).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),StudentComplaint.countDocuments(filter)
  ]);
  return res.json({data:rows.map(complaintView),meta:{page,limit,total}});
 }));
 router.get('/me/complaints/:id',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id);
  const complaint=await StudentComplaint.findOne({
   _id:id,universityId:deps.config.universityId,
   studentId:req.currentUser._id
  }).lean();
  if(!complaint)throw new HttpError(404,'COMPLAINT_NOT_FOUND','Complaint not found');
  return res.json({data:complaintView(complaint)});
 }));
 router.post('/complaints',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const data=complaintInput(req.body);
  const doc=await StudentComplaint.create({...data,
   universityId:deps.config.universityId,studentId:req.currentUser._id});
  return res.status(201).json({data:complaintView(doc)});
 }));
 router.get('/staff/complaints',auth,asyncHandler(async(req,res)=>{
  needRole(req,'staff','admin');
  const {page,limit,skip}=pagination(req.query);
  const permitted=['submitted','in_review','resolved','closed'];
  if(Object.keys(req.query).some(k=>!['page','limit','status'].includes(k))||
     (req.query.status&&!permitted.includes(req.query.status))){
    throw new HttpError(400,'INVALID_COMPLAINT_FILTER','Invalid status filter');
  }
  const filter={universityId:deps.config.universityId,
    ...(req.query.status?{status:req.query.status}:{})};
  const [items,total]=await Promise.all([
   StudentComplaint.find(filter).sort({createdAt:-1,_id:-1})
    .skip(skip).limit(limit).lean(),
   StudentComplaint.countDocuments(filter)
  ]);
  return res.json({data:items.map(complaintView),meta:{page,limit,total}});
 }));
 router.patch('/staff/complaints/:id',auth,asyncHandler(async(req,res)=>{
  needRole(req,'staff','admin');
  const id=requireObjectId(req.params.id);
  const filter={_id:id,universityId:deps.config.universityId};
  const current=await StudentComplaint.findOne(filter).lean();
  if(!current)throw new HttpError(404,'COMPLAINT_NOT_FOUND','Complaint not found');
  const changes=complaintStaffUpdate(req.body,current);
  const updated=await StudentComplaint.findOneAndUpdate(
   {...filter,status:current.status},
   {$set:{...changes,handledBy:req.currentUser._id,handledAt:new Date()}},
   {new:true,runValidators:true}
  );
  if(!updated)throw new HttpError(409,'COMPLAINT_CHANGED',
   'Another staff member updated this complaint. Refresh and retry');
  return res.json({data:complaintView(updated)});
 }));
 return router;
}
