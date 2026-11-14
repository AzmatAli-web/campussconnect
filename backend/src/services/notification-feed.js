import {HttpError} from '../lib/http-error.js';
import {CampusNotification,AnnouncementNotificationRead,notificationRetentionMs} from '../models/notification.js';
import {Announcement,SocietyManagerAssignment} from '../models/campus-content.js';
import {SocietyMembership} from '../models/society-membership.js';
import {requireBody} from './mvp-validation.js';

const HEX=/^[a-f0-9]{24}$/i;
export function notificationLimit(query){
 if(Object.keys(query).some(x=>!['limit','cursor'].includes(x)))
  throw new HttpError(400,'INVALID_NOTIFICATIONS_QUERY','Only limit and cursor are allowed');
 const limit=query.limit===undefined?20:Number(query.limit);
 if(!Number.isInteger(limit)||limit<1||limit>40)
  throw new HttpError(400,'INVALID_NOTIFICATIONS_LIMIT','Limit must be 1-40');
 return limit;
}
export function notificationCursor(encoded){
 if(encoded===undefined)return null;
 if(typeof encoded!=='string'||!/^[a-zA-Z0-9_-]{20,160}$/.test(encoded))
  throw new HttpError(400,'INVALID_NOTIFICATIONS_CURSOR','Invalid inbox cursor');
 const decoded=Buffer.from(encoded,'base64url').toString('utf8');
 const parts=decoded.split('|');
 if(parts.length!==2||!/^\d{4}-\d{2}-\d{2}T/.test(parts[0])||
    !/Z$/.test(parts[0])||!HEX.test(parts[1]))
  throw new HttpError(400,'INVALID_NOTIFICATIONS_CURSOR','Invalid inbox cursor');
 const date=new Date(parts[0]);
 if(!Number.isFinite(date.getTime())||date.toISOString()!==parts[0]||
    date.getTime()>Date.now()+60_000)
  throw new HttpError(400,'INVALID_NOTIFICATIONS_CURSOR','Invalid inbox cursor');
 return {at:date,id:parts[1].toLowerCase()};
}
export function encodeNotificationCursor(item){
 return Buffer.from(new Date(item.createdAt).toISOString()+'|'+item.id).toString('base64url');
}
export function beforeCursor(cursor,dateField='createdAt'){
 if(!cursor)return {};
 return {$or:[
  {[dateField]:{$lt:cursor.at}},
  {[dateField]:cursor.at,_id:{$lt:cursor.id}}
 ]};
}
export function limitNotificationBody(body){
 requireBody(body??{},[]);
}
export function personalNotificationView(n){
 return {
  id:String(n._id),kind:'personal',type:n.type,title:n.title,body:n.body,
  sourceId:String(n.sourceId),createdAt:n.createdAt,
  readAt:n.readAt??null
 };
}
export function announcementNotificationView(a,read){
 return {
  id:String(a._id),kind:'announcement',type:'announcement',
  title:a.title,body:a.body.slice(0,240),
  sourceId:String(a._id),createdAt:a.publishedAt,
  readAt:read?.readAt??null
 };
}
export async function notificationAudience(req){
 const uni=req.currentUser.universityId,id=req.currentUser._id;
 const scopes=[{scope:'university'}];
 if(req.currentUser.departmentId)
  scopes.push({scope:'department',departmentId:req.currentUser.departmentId});
 // Manager and student membership records are read only to derive allowed audiences.
 // Society broadcasts are ONE shared document; no per-student fanout.
 if(req.roles.includes('admin')){
  scopes.push({scope:'society'});
 }else{
  const [memberSocieties,managedSocieties]=await Promise.all([
   req.roles.includes('student')?SocietyMembership.distinct('societyId',{
    universityId:uni,studentId:id,status:'active'
   }):[],
   req.roles.includes('societyManager')?SocietyManagerAssignment.distinct('societyId',{
    universityId:uni,userId:id,status:'active'
   }):[]
  ]);
  const ids=[...new Set([...memberSocieties,...managedSocieties].map(String))];
  if(ids.length)scopes.push({scope:'society',societyId:{$in:ids}});
 }
 return {$or:scopes};
}
export function personalNotificationData({universityId,recipientId,type,sourceId,sourceKey,title,body,at=new Date()}){
 return {universityId,recipientId,type,sourceId,sourceKey,title,body,
  expiresAt:new Date(at.getTime()+notificationRetentionMs),pushState:'pending',
  pushNextAt:at};
}
export async function notificationFeed(req,{limit,cursor}){
 const uni=req.currentUser.universityId,recipientId=req.currentUser._id;
 const minDate=new Date(Date.now()-notificationRetentionMs);
 const audience=await notificationAudience(req);
 const personalMatch={
  universityId:uni,recipientId,createdAt:{$gte:minDate},
  ...beforeCursor(cursor,'createdAt')
 };
 const announcementsMatch={
  universityId:uni,status:'published',publishedAt:{$gte:minDate},
  $and:[audience,beforeCursor(cursor,'publishedAt')]
 };
 const [personal,announcements]=await Promise.all([
  CampusNotification.find(personalMatch)
   .select('_id type title body sourceId readAt createdAt')
   .sort({createdAt:-1,_id:-1}).limit(limit+1).lean(),
  Announcement.find(announcementsMatch)
   .select('_id title body publishedAt scope societyId departmentId')
   .sort({publishedAt:-1,_id:-1}).limit(limit+1).lean()
 ]);
 // Stable merge of two already-indexed and bounded source windows.
 const candidates=[
  ...personal.map(personalNotificationView),
  ...announcements.map(a=>announcementNotificationView(a,null))
 ].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||
    (a.id<b.id?1:a.id>b.id?-1:0));
 const hasMore=candidates.length>limit;
 const items=candidates.slice(0,limit);
 const announcementIds=items.filter(i=>i.kind==='announcement').map(i=>i.id);
 if(announcementIds.length){
  const reads=await AnnouncementNotificationRead.find({
   universityId:uni,recipientId,announcementId:{$in:announcementIds}
  }).select('announcementId readAt').lean();
  const known=new Map(reads.map(r=>[String(r.announcementId),r.readAt]));
  for(const item of items){
   if(item.kind==='announcement')item.readAt=known.get(item.id)??null;
  }
 }
 return {
  data:items,
  meta:{
   limit,hasMore,nextCursor:hasMore&&items.length?
    encodeNotificationCursor(items[items.length-1]):null,
   unreadOnPage:items.filter(i=>!i.readAt).length
  }
 };
}
