import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole,verifiedFaculty} from '../middleware/campus-user.js';
import {Announcement,Society,SocietyManagerAssignment} from '../models/campus-content.js';
import {announcementInput,announcementView,pagination,requireObjectId,requireBody,textField} from '../services/mvp-validation.js';

const audience=req=>({$or:[
 {scope:'university'},{scope:'society'},
 ...(req.currentUser.departmentId?[{scope:'department',departmentId:req.currentUser.departmentId}]:[])
]});
async function mayPublish(req,content,universityId){
 if(content.scope==='society'){
  needRole(req,'societyManager');
  const [society,assignment]=await Promise.all([
   Society.exists({_id:content.societyId,universityId,status:'active'}),
   SocietyManagerAssignment.exists({universityId,societyId:content.societyId,userId:req.currentUser._id,status:'active'})
  ]);
  if(!society||!assignment) throw new HttpError(403,'NOT_SOCIETY_MANAGER','Active society manager assignment required');
 }else{
  if(!verifiedFaculty(req)) throw new HttpError(403,'FACULTY_NOT_VERIFIED','Verified faculty permission required');
  if(content.scope==='department' && String(content.departmentId)!==String(req.currentUser.departmentId||'')) throw new HttpError(403,'DEPARTMENT_SCOPE','Can only publish for own department');
 }
}
export function announcementsRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.get('/announcements',auth,asyncHandler(async(req,res)=>{
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,status:'published',...audience(req)};
  const [items,total]=await Promise.all([
   Announcement.find(filter).sort({publishedAt:-1,_id:-1}).skip(skip).limit(limit).lean(),
   Announcement.countDocuments(filter)
  ]);
  return res.json({data:items.map(announcementView),meta:{page,limit,total}});
 }));
 router.post('/announcements',auth,asyncHandler(async(req,res)=>{
  const input=announcementInput(req.body);
  await mayPublish(req,input,deps.config.universityId);
  const created=await Announcement.create({...input,universityId:deps.config.universityId,authorId:req.currentUser._id,status:'published',publishedAt:new Date()});
  return res.status(201).json({data:announcementView(created)});
 }));
 router.get('/announcements/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const doc=await Announcement.findOne({_id:id,universityId:deps.config.universityId,status:'published',...audience(req)}).lean();
  if(!doc) throw new HttpError(404,'ANNOUNCEMENT_NOT_FOUND','Announcement not found');
  return res.json({data:announcementView(doc)});
 }));
 router.patch('/announcements/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id),body=requireBody(req.body,['title','body']);
  if(!Object.keys(body).length) throw new HttpError(422,'EMPTY_UPDATE','No changes provided');
  const changes={};
  if(Object.hasOwn(body,'title')) changes.title=textField(body.title,'title',3,180);
  if(Object.hasOwn(body,'body')) changes.body=textField(body.body,'body',5,10000);
  const current=await Announcement.findOne({_id:id,universityId:deps.config.universityId,status:'published'}).lean();
  if(!current) throw new HttpError(404,'ANNOUNCEMENT_NOT_FOUND','Announcement not found');
  if(String(current.authorId)!==String(req.currentUser._id)) throw new HttpError(403,'FORBIDDEN','Only author can edit announcement');
  await mayPublish(req,current,deps.config.universityId);
  const updated=await Announcement.findOneAndUpdate({_id:id,authorId:req.currentUser._id,universityId:deps.config.universityId,status:'published'},{$set:changes},{new:true,runValidators:true});
  if(!updated) throw new HttpError(409,'ANNOUNCEMENT_CHANGED','Announcement is no longer editable');
  return res.json({data:announcementView(updated)});
 }));
 router.post('/admin/announcements/:id/moderation',auth,asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const id=requireObjectId(req.params.id),body=requireBody(req.body,['reason']);
  textField(body.reason,'reason',5,1000);
  const changed=await Announcement.findOneAndUpdate({_id:id,universityId:deps.config.universityId,status:'published'},{$set:{status:'archived'}},{new:true});
  if(!changed) throw new HttpError(404,'ANNOUNCEMENT_NOT_FOUND','Announcement not found');
  return res.json({data:announcementView(changed)});
 }));
 return router;
}
