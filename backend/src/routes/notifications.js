import {createHash} from 'node:crypto';
import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware} from '../middleware/campus-user.js';
import {requireObjectId,requireBody} from '../services/mvp-validation.js';
import {Announcement} from '../models/campus-content.js';
import {
 CampusNotification,AnnouncementNotificationRead,
 NotificationPushDevice,notificationRetentionMs
} from '../models/notification.js';
import {
 notificationAudience,notificationLimit,notificationCursor,
 notificationFeed,limitNotificationBody
} from '../services/notification-feed.js';

function tokenDigest(token){return createHash('sha256').update(token).digest('hex');}
function requirePushToken(body,withConsent=false){
 requireBody(body,withConsent?['token','consent']:['token']);
 const token=body.token;
 if(typeof token!=='string'||token.length<80||token.length>4096||
    !/^[a-zA-Z0-9:_.-]+$/.test(token))
  throw new HttpError(422,'INVALID_PUSH_TOKEN','Invalid Firebase registration token');
 if(withConsent&&body.consent!==true)
  throw new HttpError(422,'PUSH_CONSENT_REQUIRED','Explicit notification consent is required');
 return token;
}
export function notificationsRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 router.get('/notifications',auth,asyncHandler(async(req,res)=>{
  const limit=notificationLimit(req.query);
  const cursor=notificationCursor(req.query.cursor);
  const page=await notificationFeed(req,{limit,cursor});
  return res.json({data:{items:page.data,...page.meta}});
 }));
 router.post('/notifications/:kind/:id/read',auth,asyncHandler(async(req,res)=>{
  limitNotificationBody(req.body);
  const id=requireObjectId(req.params.id);
  const uni=req.currentUser.universityId,recipientId=req.currentUser._id;
  if(req.params.kind==='personal'){
   const doc=await CampusNotification.findOneAndUpdate({
    _id:id,universityId:uni,recipientId,readAt:null
   },{$set:{readAt:new Date()}},{new:true}).select('_id readAt').lean();
   if(doc)return res.json({data:{id,kind:'personal',readAt:doc.readAt}});
   const prior=await CampusNotification.findOne({
    _id:id,universityId:uni,recipientId
   }).select('readAt').lean();
   if(!prior)throw new HttpError(404,'NOTIFICATION_NOT_FOUND','Notification unavailable');
   return res.json({data:{id,kind:'personal',readAt:prior.readAt}});
  }
  if(req.params.kind!=='announcement')
   throw new HttpError(400,'INVALID_NOTIFICATION_KIND','Unknown notification kind');
  const filter={
   _id:id,universityId:uni,status:'published',
   publishedAt:{$gte:new Date(Date.now()-notificationRetentionMs)},
   ...await notificationAudience(req)
  };
  const announcement=await Announcement.findOne(filter).select('_id publishedAt').lean();
  if(!announcement)throw new HttpError(404,'NOTIFICATION_NOT_FOUND','Notification unavailable');
  const expiresAt=new Date(new Date(announcement.publishedAt).getTime()+notificationRetentionMs);
  try{
   const result=await AnnouncementNotificationRead.findOneAndUpdate({
    universityId:uni,recipientId,announcementId:announcement._id
   },{$setOnInsert:{readAt:new Date(),expiresAt}},
    {new:true,upsert:true,setDefaultsOnInsert:true}).lean();
   return res.json({data:{id,kind:'announcement',readAt:result.readAt}});
  }catch(error){
   if(error?.code!==11000)throw error;
   const existing=await AnnouncementNotificationRead.findOne({
    universityId:uni,recipientId,announcementId:announcement._id
   }).lean();
   if(!existing)throw error;
   return res.json({data:{id,kind:'announcement',readAt:existing.readAt}});
  }
 }));
 router.get('/notifications/push-status',auth,asyncHandler(async(req,res)=>{
  const count=await NotificationPushDevice.countDocuments({
   universityId:req.currentUser.universityId,userId:req.currentUser._id
  });
  return res.json({data:{enabled:count>0,devices:count}});
 }));
 router.post('/notifications/push-devices',auth,asyncHandler(async(req,res)=>{
  const token=requirePushToken(req.body,true);
  const uni=req.currentUser.universityId,userId=req.currentUser._id;
  const hash=tokenDigest(token);
  const known=await NotificationPushDevice.findOne({
   universityId:uni,tokenHash:hash
  }).select('_id').lean();
  if(!known){
   const count=await NotificationPushDevice.countDocuments({universityId:uni,userId});
   if(count>=5)throw new HttpError(409,'PUSH_DEVICE_LIMIT',
    'Up to five push devices per account; remove an old device first');
  }
  try{
   await NotificationPushDevice.findOneAndUpdate({
    universityId:uni,tokenHash:hash
   },{$set:{userId,token,platform:'android',lastSeenAt:new Date()}},
   {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});
  }catch(error){
   if(error?.code!==11000)throw error;
   // Concurrent registration/rotation, retry on the unique token hash.
   await NotificationPushDevice.updateOne({
    universityId:uni,tokenHash:hash
   },{$set:{userId,token,platform:'android',lastSeenAt:new Date()}});
  }
  return res.json({data:{enabled:true}});
 }));
 router.post('/notifications/push-devices/revoke',auth,asyncHandler(async(req,res)=>{
  const token=requirePushToken(req.body);
  const removed=await NotificationPushDevice.deleteOne({
   universityId:req.currentUser.universityId,
   userId:req.currentUser._id,tokenHash:tokenDigest(token)
  });
  return res.json({data:{revoked:removed.deletedCount>0}});
 }));
 return router;
}
