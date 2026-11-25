import {Router} from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import {createHash,randomBytes} from 'node:crypto';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole,verifiedFaculty} from '../middleware/campus-user.js';
import {Event,EventRegistration,IdempotencyKey,Society,SocietyManagerAssignment} from '../models/campus-content.js';
import {CampusNotification} from '../models/notification.js';
import {personalNotificationData} from '../services/notification-feed.js';
import {eventInput,eventView,registrationInput,registrationView,privateRegistrationView,registeredEventView,pagination,eventBrowseQuery,requireBody,requireObjectId,textField} from '../services/mvp-validation.js';

const has=(req,role)=>req.roles.includes(role);
const noStore=(_req,res,next)=>{res.set('Cache-Control','no-store');next();};
const organizer=async(req,universityId,societyId)=>{
 if(societyId){
  needRole(req,'societyManager');
  const society=await Society.findOne({_id:societyId,universityId,status:'active'}).lean();
  if(!society) throw new HttpError(404,'SOCIETY_NOT_FOUND','Society not found');
  const assignment=await SocietyManagerAssignment.exists({universityId,societyId,userId:req.currentUser._id,status:'active'});
  if(!assignment) throw new HttpError(403,'NOT_SOCIETY_MANAGER','Active society assignment required');
  return 'societyManager';
 }
 if(!verifiedFaculty(req)) throw new HttpError(403,'FACULTY_NOT_VERIFIED','Verified faculty role required');
 return 'faculty';
};
function idempotencyHeader(req){
 const key=req.get('Idempotency-Key');
 if(typeof key!=='string'||!/^[a-zA-Z0-9._-]{8,128}$/.test(key)) throw new HttpError(400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key must be 8-128 safe characters');
 return key;
}
function receiptResult(prior,hash){
 if(prior.requestHash!==hash) throw new HttpError(409,'IDEMPOTENCY_CONFLICT','Key reused with different request');
 if(prior.status!=='completed') throw new HttpError(409,'REQUEST_IN_PROGRESS','Request with this key is already processing');
 return {status:prior.responseCode,body:prior.responseBody};
}
async function authorizedOrganizer(req,event,universityId) {
 if(has(req,'admin')) return true;
 if(String(event.organizerId)!==String(req.currentUser._id)) return false;
 if(event.organizerType==='faculty') return verifiedFaculty(req);
 if(event.organizerType!=='societyManager'||!has(req,'societyManager')||!event.societyId) return false;
 const assignment=await SocietyManagerAssignment.exists({
  universityId,societyId:event.societyId,userId:req.currentUser._id,status:'active'
 });
 return Boolean(assignment);
}
export function eventsRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.get('/me/organized-events',auth,asyncHandler(async(req,res)=>{
  if(!verifiedFaculty(req)&&!has(req,'societyManager')) throw new HttpError(403,'FORBIDDEN','Organizer role required');
  const {page,limit,skip}=pagination(req.query);
  const universityId=deps.config.universityId,organizerId=req.currentUser._id;
  const authorized=[];
  if(verifiedFaculty(req)) authorized.push({organizerType:'faculty'});
  if(has(req,'societyManager')){
   const societyIds=await SocietyManagerAssignment.distinct('societyId',{
    universityId,userId:organizerId,status:'active'
   });
   if(societyIds.length) authorized.push({organizerType:'societyManager',societyId:{$in:societyIds}});
  }
  if(!authorized.length) return res.json({data:[],meta:{page,limit,total:0}});
  const filter={universityId,organizerId,$or:authorized};
  const [items,total]=await Promise.all([
   Event.find(filter).sort({startsAt:-1,_id:-1}).skip(skip).limit(limit).lean(),
   Event.countDocuments(filter)
  ]);
  res.set('Cache-Control','no-store');
  return res.json({data:items.map(e=>eventView(e)),meta:{page,limit,total}});
 }));
 router.get('/me/event-registrations',noStore,auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,studentId:req.currentUser._id};
  const includeEvent=req.query.includeEvent;
  if(includeEvent!==undefined&&includeEvent!=='1'){
   throw new HttpError(400,'INVALID_REGISTRATION_FILTER','includeEvent must be 1');
  }
  const [items,total]=await Promise.all([
   EventRegistration.find(filter).sort({confirmedAt:-1,_id:-1}).skip(skip).limit(limit).lean(),
   EventRegistration.countDocuments(filter)
  ]);
  const meta={page,limit,total};
  if(includeEvent===undefined)return res.json({data:items.map(registrationView),meta});
  const events=items.length?await Event.find({
   _id:{$in:items.map(row=>row.eventId)},universityId:filter.universityId
  }).select('title venue startsAt endsAt status').lean():[];
  const byId=new Map(events.map(event=>[String(event._id),registeredEventView(event)]));
  return res.json({data:items.map(row=>{
   const receipt=registrationView(row);
   return {...receipt,event:byId.get(receipt.eventId)??null};
  }),meta});
 }));
 router.post('/me/event-registrations/:id/ticket',noStore,auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const filter={_id:requireObjectId(req.params.id),studentId:req.currentUser._id,universityId:deps.config.universityId,status:'confirmed'};
  const receipt=await EventRegistration.findOne(filter).lean();
  if(!receipt)throw new HttpError(404,'NOT_FOUND','Registration unavailable');
  const event=await Event.findOne({_id:receipt.eventId,universityId:filter.universityId,status:'published',endsAt:{$gt:new Date()}}).lean();
  if(!event)throw new HttpError(409,'EVENT_UNAVAILABLE','Event unavailable');
  const code=receipt._id+'.'+randomBytes(24).toString('hex');
  const expiresAt=new Date(Math.min(Date.now()+5*60000,event.endsAt.getTime()));
  const image=await QRCode.toDataURL(code,{width:300,margin:4});
  const changed=await EventRegistration.updateOne({...filter,checkedInAt:null},{$set:{
   ticketHash:createHash('sha256').update(code).digest('hex'),ticketExpiresAt:expiresAt
  }});
  if(!changed.matchedCount)throw new HttpError(409,'ALREADY_CHECKED_IN','Registration already checked in');
  res.json({data:{code,image,expiresAt}});
 }));
 router.post('/events/:id/check-in',noStore,auth,asyncHandler(async(req,res)=>{
  const universityId=deps.config.universityId,eventId=requireObjectId(req.params.id);
  const event=await Event.findOne({_id:eventId,universityId}).lean();
  if(!event||!await authorizedOrganizer(req,event,universityId))throw new HttpError(403,'FORBIDDEN','Current event organizer or admin required');
  const now=new Date();
  if(event.status!=='published'||event.endsAt<=now||event.startsAt.getTime()>now.getTime()+30*60000)
   throw new HttpError(409,'CHECK_IN_CLOSED','Check-in opens 30 minutes before the event and closes at its end');
  const {code}=requireBody(req.body,['code']);
  if(typeof code!=='string'||!/^[a-f0-9]{24}\.[a-f0-9]{48}$/.test(code))throw new HttpError(422,'INVALID_TICKET','Invalid ticket');
  const result=await EventRegistration.updateOne({_id:code.slice(0,24),eventId,universityId,status:'confirmed',
   ticketHash:createHash('sha256').update(code).digest('hex'),ticketExpiresAt:{$gt:now},checkedInAt:null},
   {$set:{checkedInAt:now,checkedInBy:req.currentUser._id},$unset:{ticketHash:1,ticketExpiresAt:1}});
  if(!result.modifiedCount)throw new HttpError(409,'TICKET_UNAVAILABLE','Ticket expired, replaced, already used or for another event');
  res.json({data:{checkedInAt:now}});
 }));
 router.get('/events',auth,asyncHandler(async(req,res)=>{
  const {page,limit,skip,filter:criteria,sort}=eventBrowseQuery(req.query);
  const filter={...criteria,universityId:deps.config.universityId,status:'published'};
  const [items,total]=await Promise.all([
   Event.find(filter).sort(sort).skip(skip).limit(limit).lean(),
   Event.countDocuments(filter)
  ]);
  return res.json({data:items.map(x=>eventView(x)),meta:{page,limit,total}});
 }));
 router.post('/events',auth,asyncHandler(async(req,res)=>{
  const input=eventInput(req.body);
  const organizerType=await organizer(req,deps.config.universityId,input.societyId);
  const created=await Event.create({...input,universityId:deps.config.universityId,organizerId:req.currentUser._id,organizerType,confirmedCount:0,status:'published'});
  return res.status(201).json({data:eventView(created)});
 }));
 router.get('/events/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const found=await Event.findOne({_id:id,universityId:deps.config.universityId,status:'published'}).lean();
  if(!found) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
  return res.json({data:eventView(found)});
 }));
 router.patch('/events/:id',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const patch=requireBody(req.body,['title','description','venue','startsAt','endsAt','registrationOpensAt','registrationClosesAt','capacity']);
  if(!Object.keys(patch).length) throw new HttpError(422,'EMPTY_UPDATE','Provide at least one editable field');
  const current=await Event.findOne({_id:id,universityId:deps.config.universityId,status:'published'}).lean();
  if(!current) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
  if(String(current.organizerId)!==String(req.currentUser._id)) throw new HttpError(403,'FORBIDDEN','Event owner required');
  await organizer(req,deps.config.universityId,current.societyId);
  if(current.confirmedCount>0) throw new HttpError(409,'EVENT_FROZEN','Event details cannot change after registration');
  if(current.startsAt<=new Date()) throw new HttpError(409,'EVENT_STARTED','Cannot edit started event');
  const validated=eventInput({
    title:current.title,description:current.description,venue:current.venue,
    startsAt:current.startsAt.toISOString(),endsAt:current.endsAt.toISOString(),
    registrationOpensAt:current.registrationOpensAt.toISOString(),
    registrationClosesAt:current.registrationClosesAt.toISOString(),
    capacity:current.capacity,societyId:current.societyId?String(current.societyId):null,
    ...patch
  },new Date());
  const {societyId,...updates}=validated;
  const changed=await Event.findOneAndUpdate({_id:id,universityId:deps.config.universityId,status:'published',confirmedCount:0,startsAt:{$gt:new Date()}},{$set:updates},{new:true,runValidators:true});
  if(!changed) throw new HttpError(409,'EVENT_FROZEN','Event was registered for or changed');
  return res.json({data:eventView(changed)});
 }));
 router.post('/events/:id/registrations',noStore,auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id);
  const key=idempotencyHeader(req);
  const input=registrationInput(req.body,req.currentUser.emailNormalized,req.currentUser.registrationNo);
  const universityId=deps.config.universityId,studentId=req.currentUser._id;
  const scope='events.register:'+id;
  const selector={universityId,actorId:studentId,scope,key};
  const hash=createHash('sha256').update(JSON.stringify({eventId:id,email:input.universityEmailNormalized,registrationNo:input.registrationNoSnapshot})).digest('hex');
  const replay=await IdempotencyKey.findOne(selector).lean();
  if(replay){const result=receiptResult(replay,hash);return res.status(result.status).json(result.body);}
  const session=await mongoose.startSession();
  let responseBody;
  try{
   await session.withTransaction(async()=>{
    const now=new Date();
    const receipt=new IdempotencyKey({...selector,requestHash:hash,status:'processing',expiresAt:new Date(now.getTime()+24*60*60*1000)});
    await receipt.save({session});
    const event=await Event.findOneAndUpdate({
     _id:id,universityId,status:'published',
     registrationOpensAt:{$lte:now},registrationClosesAt:{$gt:now},startsAt:{$gt:now},
     $expr:{$lt:['$confirmedCount','$capacity']}
    },{$inc:{confirmedCount:1}},{session,new:true});
    if(!event){
     const exists=await Event.exists({_id:id,universityId}).session(session);
     if(!exists) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
     throw new HttpError(409,'REGISTRATION_UNAVAILABLE','Registration is closed or event is full');
    }
    const [registration]=await EventRegistration.create([{
     universityId,eventId:event._id,studentId,
     universityEmailNormalized:input.universityEmailNormalized,
     registrationNoSnapshot:input.registrationNoSnapshot,
     studentNameSnapshot:req.currentUser.fullName,
     status:'confirmed',confirmedAt:now
    }],{session});
    // Same transaction as registration, so a failed seat reservation never
    // creates a false confirmation and an idempotent replay never duplicates it.
    await CampusNotification.create([personalNotificationData({
     universityId,recipientId:studentId,
     type:'event_registration',sourceId:event._id,
     sourceKey:'event-registration:'+String(registration._id),
     title:'Event registration confirmed',
     body:'Your campus event registration was confirmed. Open My registrations for details.',
     at:now
    })],{session});
    responseBody={data:registrationView(registration)};
    receipt.status='completed';receipt.responseCode=201;receipt.responseBody=responseBody;
    await receipt.save({session});
   },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  }catch(err){
   if(err?.code===11000||err?.hasErrorLabel?.('TransientTransactionError')){
    const existing=await IdempotencyKey.findOne(selector).lean();
    if(existing){const result=receiptResult(existing,hash);return res.status(result.status).json(result.body);}
    if(err?.code===11000) throw new HttpError(409,'ALREADY_REGISTERED','Student already registered or another request is processing');
    throw new HttpError(503,'RETRY_REGISTRATION','Concurrent registration; retry using same Idempotency-Key');
   }
   throw err;
  }finally{await session.endSession();}
  return res.status(201).json(responseBody);
 }));
 router.get('/events/:id/attendance',noStore,auth,asyncHandler(async(req,res)=>{
  const event=await Event.findOne({_id:requireObjectId(req.params.id),universityId:deps.config.universityId}).lean();
  if(!event) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
  if(!await authorizedOrganizer(req,event,event.universityId))
   throw new HttpError(403,'FORBIDDEN','Current event organizer permission or administrator role required');
  const [summary]=await EventRegistration.aggregate([
   {$match:{universityId:event.universityId,eventId:event._id,status:'confirmed'}},
   {$group:{_id:null,registered:{$sum:1},checkedIn:{$sum:{$cond:[{$eq:[{$type:'$checkedInAt'},'date']},1,0]}}}}
  ]);
  const {registered=0,checkedIn=0}=summary??{};
  res.json({data:{registered,checkedIn,attendancePercent:registered?Math.round(100*checkedIn/registered):null}});
 }));
 router.get('/events/:id/registrations',noStore,auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const event=await Event.findOne({_id:id,universityId:deps.config.universityId}).lean();
  if(!event) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
  if(!await authorizedOrganizer(req,event,deps.config.universityId)) throw new HttpError(403,'FORBIDDEN','Current event organizer permission or administrator role required');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,eventId:id};
  const [items,total]=await Promise.all([EventRegistration.find(filter).sort({confirmedAt:-1}).skip(skip).limit(limit).lean(),EventRegistration.countDocuments(filter)]);
  return res.json({data:items.map(privateRegistrationView),meta:{page,limit,total}});
 }));
 router.post('/admin/events/:id/cancel',auth,asyncHandler(async(req,res)=>{
  needRole(req,'admin');
  const id=requireObjectId(req.params.id);
  const body=requireBody(req.body,['reason']);
  const reason=textField(body.reason,'reason',5,1000);
  const event=await Event.findOneAndUpdate({_id:id,universityId:deps.config.universityId,status:'published'},{$set:{status:'cancelled',cancelledBy:req.currentUser._id,cancelReason:reason}},{new:true});
  if(!event) throw new HttpError(409,'EVENT_NOT_CANCELLABLE','Event missing or not published');
  return res.json({data:eventView(event)});
 }));
 return router;
}
