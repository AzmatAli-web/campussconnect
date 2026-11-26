import {Router} from 'express';
import {Conversation,Message} from '../models/conversation.js';
import {User} from '../models/user.js';
import {campusUserMiddleware} from '../middleware/campus-user.js';
import {asyncHandler,HttpError} from '../lib/http-error.js';
import {requireBody,requireObjectId,textField} from '../services/mvp-validation.js';

const pageSize=30;
function older(query){
 return query.before===undefined?{}:{_id:{$lt:requireObjectId(query.before)}};
}
function view(thread,user){
 const outgoing=thread.requester.equals(user._id);
 return {id:String(thread._id),name:outgoing?thread.recipientName:thread.requesterName,
  incoming:!outgoing,status:thread.status};
}
function messageView(message,user){
 return {id:String(message._id),mine:message.sender.equals(user._id),body:message.body,createdAt:message.createdAt};
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
 router.use('/conversations',(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},campusUserMiddleware(deps));
 router.get('/conversations',asyncHandler(async(req,res)=>{
  const rows=await Conversation.find({...member(req.currentUser),...older(req.query)}).sort({_id:-1}).limit(pageSize);
  res.json({data:rows.map(row=>view(row,req.currentUser))});
 }));
 router.post('/conversations',asyncHandler(async(req,res)=>{
  const user=req.currentUser;
  const {email}=requireBody(req.body,['email']);
  const emailNormalized=textField(email,'email',3,254).toLowerCase();
  const target=await User.findOne({emailNormalized,universityId:user.universityId,status:'active','activeRoles.0':{$exists:true}});
  if(!target||target._id.equals(user._id))throw new HttpError(422,'RECIPIENT_UNAVAILABLE','Choose another active campus member');
  const key={universityId:user.universityId,pair:[String(user._id),String(target._id)].sort().join(':')};
  const thread=await insertOnce(Conversation,key,{requester:user._id,recipient:target._id,requesterName:user.fullName,recipientName:target.fullName});
  res.json({data:view(thread,user)});
 }));
 router.patch('/conversations/:id',asyncHandler(async(req,res)=>{
  const {status}=requireBody(req.body,['status']);
  if(!['accepted','declined'].includes(status))throw new HttpError(422,'INVALID_DECISION','Choose accept or decline');
  const thread=await Conversation.findOneAndUpdate({_id:requireObjectId(req.params.id),universityId:req.currentUser.universityId,
   recipient:req.currentUser._id,status:{$in:['pending',status]}},{$set:{status}},{new:true});
  if(!thread)throw new HttpError(404,'REQUEST_UNAVAILABLE','Conversation request unavailable');
  res.json({data:view(thread,req.currentUser)});
 }));
 router.get('/conversations/:id/messages',asyncHandler(async(req,res)=>{
  const thread=await accepted(req);
  const rows=await Message.find({conversationId:thread._id,...older(req.query)}).sort({_id:-1}).limit(pageSize);
  res.json({data:rows.map(row=>messageView(row,req.currentUser))});
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
  const message=await insertOnce(Message,{conversationId:thread._id,sender:user._id,clientId:input.clientId},{body});
  if(message.body!==body)throw new HttpError(409,'MESSAGE_CHANGED','Message identifier already used');
  res.json({data:messageView(message,user)});
 }));
 return router;
}
