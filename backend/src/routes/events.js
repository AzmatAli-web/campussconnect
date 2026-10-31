import {Router} from 'express';
import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole,verifiedFaculty} from '../middleware/campus-user.js';
import {Event,EventRegistration,IdempotencyKey,Society,SocietyManagerAssignment} from '../models/campus-content.js';
import {eventInput,eventView,registrationInput,registrationView,privateRegistrationView,pagination,requireBody,requireObjectId,textField} from '../services/mvp-validation.js';

const has=(req,role)=>req.roles.includes(role);
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
 router.get('/me/event-registrations',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,studentId:req.currentUser._id};
  const [items,total]=await Promise.all([
   EventRegistration.find(filter).sort({confirmedAt:-1,_id:-1}).skip(skip).limit(limit).lean(),
   EventRegistration.countDocuments(filter)
  ]);
  res.set('Cache-Control','no-store');
  return res.json({data:items.map(registrationView),meta:{page,limit,total}});
 }));
 router.get('/events',auth,asyncHandler(async(req,res)=>{
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,status:'published'};
  const [items,total]=await Promise.all([
   Event.find(filter).sort({startsAt:1,_id:1}).skip(skip).limit(limit).lean(),
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
 router.post('/events/:id/registrations',auth,asyncHandler(async(req,res)=>{
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
 router.get('/events/:id/registrations',auth,asyncHandler(async(req,res)=>{
  const id=requireObjectId(req.params.id);
  const event=await Event.findOne({_id:id,universityId:deps.config.universityId}).lean();
  if(!event) throw new HttpError(404,'EVENT_NOT_FOUND','Event not found');
  if(!await authorizedOrganizer(req,event,deps.config.universityId)) throw new HttpError(403,'FORBIDDEN','Current event organizer permission or administrator role required');
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,eventId:id};
  const [items,total]=await Promise.all([EventRegistration.find(filter).sort({confirmedAt:-1}).skip(skip).limit(limit).lean(),EventRegistration.countDocuments(filter)]);
  res.set('Cache-Control','no-store');
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
