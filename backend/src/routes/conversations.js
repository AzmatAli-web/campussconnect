import {Router} from 'express';
import {Conversation,ConversationReport,Message} from '../models/conversation.js';
import {User} from '../models/user.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {asyncHandler,HttpError} from '../lib/http-error.js';
import {requireBody,requireObjectId,textField} from '../services/mvp-validation.js';

const pageSize=30;
function older(query){
 return query.before===undefined?{}:{_id:{$lt:requireObjectId(query.before)}};
}
function view(thread,user){
 const outgoing=thread.requester.equals(user._id);
 return {id:String(thread._id),name:outgoing?thread.recipientName:thread.requesterName,
  incoming:!outgoing,status:thread.status,paused:thread.blockedBy.length>0,blockedByMe:thread.blockedBy.some(id=>id.equals(user._id))};
}
function messageView(message,user){
 return {id:String(message._id),mine:message.sender.equals(user._id),unread:!message.readAt&&!message.sender.equals(user._id),body:message.body,createdAt:message.createdAt};
}
function member(user){
 return {universityId:user.universityId,$or:[{requester:user._id},{recipient:user._id}]};
}
async function accepted(req){
 const thread=await Conversation.findOne({...member(req.currentUser),_id:requireObjectId(req.params.id),status:'accepted'});
 if(!thread)throw new HttpError(404,'THREAD_UNAVAILABLE','Accepted conversation unavailable');
 return thread;
}
// Unique database indexes arbitrate simultaneous deliveries from multiple replicas.
async function insertOnce(model,key,fields){
 try{return await model.create({...key,...fields});}
 catch(error){
  if(error.code!==11000)throw error;
  const existing=await model.findOne(key);
  if(!existing)throw error;
  return existing;
 }
}
export function conversationsRouter(deps){
 const router=Router();
 router.use(['/conversations','/admin/conversation-reports'],(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},campusUserMiddleware(deps));
 router.get('/conversations',asyncHandler(async(req,res)=>{
  const rows=await Conversation.find({...member(req.currentUser),...older(req.query)}).sort({_id:-1}).limit(pageSize);
  const counts=await Message.aggregate([
   {$match:{conversationId:{$in:rows.map(row=>row._id)},sender:{$ne:req.currentUser._id},readAt:null}},
   {$group:{_id:'$conversationId',count:{$sum:1}}}
  ]);
  const unread=new Map(counts.map(row=>[String(row._id),row.count]));
  res.json({data:rows.map(row=>({...view(row,req.currentUser),unread:unread.get(String(row._id))??0}))});
 }));
 const participant=async req=>{
  const thread=await Conversation.findOne({...member(req.currentUser),_id:requireObjectId(req.params.id)});
  if(!thread)throw new HttpError(404,'THREAD_UNAVAILABLE','Conversation unavailable');
  return thread;
 };
 router.get('/conversations/:id',asyncHandler(async(req,res)=>{
  res.json({data:view(await participant(req),req.currentUser)});
 }));
 router.patch('/conversations/:id/block',asyncHandler(async(req,res)=>{
  const {blocked}=requireBody(req.body,['blocked']);
  if(typeof blocked!=='boolean')throw new HttpError(422,'INVALID_BLOCK','Choose block or unblock');
  const user=req.currentUser;
  const update=blocked?{$addToSet:{blockedBy:user._id}}:{$pull:{blockedBy:user._id}};
  const thread=await Conversation.findOneAndUpdate({...member(user),_id:requireObjectId(req.params.id)},update,{new:true});
  if(!thread)throw new HttpError(404,'THREAD_UNAVAILABLE','Conversation unavailable');
  req.app.emit('conversationChanged',[thread.requester,thread.recipient]);
  res.json({data:view(thread,user)});
 }));
 router.post('/conversations/:id/reports',asyncHandler(async(req,res)=>{
  const thread=await participant(req),user=req.currentUser;
  const input=requireBody(req.body,['reason','messageId']);
  const reason=textField(input.reason,'reason',3,500);
  const messageId=input.messageId==null?null:requireObjectId(input.messageId);
  const subject=thread.requester.equals(user._id)?thread.recipient:thread.requester;
  let excerpt;
  if(messageId){
   const message=await Message.findOne({_id:messageId,conversationId:thread._id,sender:subject});
   if(!message)throw new HttpError(404,'MESSAGE_UNAVAILABLE','Reported message unavailable');
   excerpt=message.body;
  }
  const report=await insertOnce(ConversationReport,{conversationId:thread._id,reporter:user._id,messageId},
   {universityId:user.universityId,subject,reason,excerpt});
  res.json({data:{id:String(report._id)}});
 }));
 router.get('/admin/conversation-reports',asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const rows=await ConversationReport.find({universityId:req.currentUser.universityId,reviewedAt:null}).sort({_id:1}).limit(pageSize).lean();
  res.json({data:rows.map(row=>({id:row._id,subject:row.subject,reason:row.reason,excerpt:row.excerpt,createdAt:row.createdAt}))});
 }));
 router.patch('/admin/conversation-reports/:id',asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const key={_id:requireObjectId(req.params.id),universityId:req.currentUser.universityId};
  const result=await ConversationReport.updateOne({...key,reviewedAt:null},{$set:{reviewedAt:new Date(),reviewer:req.currentUser._id}});
  if(!result.matchedCount && !await ConversationReport.exists(key))throw new HttpError(404,'REPORT_UNAVAILABLE','Report unavailable');
  res.json({data:{reviewed:true}});
 }));
 router.post('/conversations',asyncHandler(async(req,res)=>{
  const user=req.currentUser;
  const {email}=requireBody(req.body,['email']);
  const emailNormalized=textField(email,'email',3,254).toLowerCase();
  const target=await User.findOne({emailNormalized,universityId:user.universityId,status:'active','activeRoles.0':{$exists:true}});
  if(!target||target._id.equals(user._id))throw new HttpError(422,'RECIPIENT_UNAVAILABLE','Choose another active campus member');
  const key={universityId:user.universityId,pair:[String(user._id),String(target._id)].sort().join(':')};
  const thread=await insertOnce(Conversation,key,{requester:user._id,recipient:target._id,requesterName:user.fullName,recipientName:target.fullName});
  if(thread.blockedBy.length)throw new HttpError(409,'CONTACT_PAUSED','Messaging is paused');
  req.app.emit('conversationChanged',[thread.requester,thread.recipient]);
  res.json({data:view(thread,user)});
 }));
 router.patch('/conversations/:id',asyncHandler(async(req,res)=>{
  const {status}=requireBody(req.body,['status']);
  if(!['accepted','declined'].includes(status))throw new HttpError(422,'INVALID_DECISION','Choose accept or decline');
  const thread=await Conversation.findOneAndUpdate({_id:requireObjectId(req.params.id),universityId:req.currentUser.universityId,
   recipient:req.currentUser._id,'blockedBy.0':{$exists:false},status:{$in:['pending',status]}},{$set:{status}},{new:true});
  if(!thread)throw new HttpError(404,'REQUEST_UNAVAILABLE','Conversation request unavailable');
  req.app.emit('conversationChanged',[thread.requester,thread.recipient]);
  res.json({data:view(thread,req.currentUser)});
 }));
 router.get('/conversations/:id/messages',asyncHandler(async(req,res)=>{
  const thread=await accepted(req);
  const rows=await Message.find({conversationId:thread._id,...older(req.query)}).sort({_id:-1}).limit(pageSize);
  res.json({data:rows.map(row=>messageView(row,req.currentUser))});
 }));
 router.patch('/conversations/:id/read',asyncHandler(async(req,res)=>{
  const thread=await accepted(req);
  const {ids}=requireBody(req.body,['ids']);
  if(!Array.isArray(ids)||!ids.length||ids.length>pageSize)throw new HttpError(422,'INVALID_PAGE','Choose up to 30 messages');
  const result=await Message.updateMany({conversationId:thread._id,sender:{$ne:req.currentUser._id},
   _id:{$in:ids.map(id=>requireObjectId(id))},readAt:null},{$set:{readAt:new Date()}});
  if(result.modifiedCount)req.app.emit('conversationChanged',[req.currentUser._id]);
  res.json({data:{updated:result.modifiedCount}});
 }));
 router.post('/conversations/:id/messages',asyncHandler(async(req,res)=>{
  const thread=await accepted(req),user=req.currentUser;
  const other=thread.requester.equals(user._id)?thread.recipient:thread.requester;
  if(!await User.exists({_id:other,universityId:user.universityId,status:'active','activeRoles.0':{$exists:true}}))
   throw new HttpError(409,'RECIPIENT_UNAVAILABLE','Recipient unavailable');
  const input=requireBody(req.body,['body','clientId']);
  const body=textField(input.body,'body',1,2000);
  if(typeof input.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.clientId))
   throw new HttpError(422,'INVALID_CLIENT_ID','A message identifier is required');
  const key={conversationId:thread._id,sender:user._id,clientId:input.clientId};
  // Serialize block and send on the same conversation across replicas.
  const message=await Conversation.db.transaction(async session=>{
   const gate=await Conversation.updateOne({_id:thread._id,'blockedBy.0':{$exists:false}},{$inc:{sendRevision:1}},{session});
   if(!gate.matchedCount)throw new HttpError(409,'CONTACT_PAUSED','Messaging is paused');
   return Message.findOneAndUpdate(key,{$setOnInsert:{...key,body}},{upsert:true,new:true,session});
  });
  if(message.body!==body)throw new HttpError(409,'MESSAGE_CHANGED','Message identifier already used');
  req.app.emit('conversationChanged',[thread.requester,thread.recipient]);
  res.json({data:messageView(message,user)});
 }));
 return router;
}
