import {HttpError} from '../lib/http-error.js';

const OBJECT_ID=/^[a-f\d]{24}$/i;
const OFFSET=/(?:Z|[+-]\d\d:\d\d)$/;
const EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function requireObjectId(value) {
 if(typeof value!=='string'||!OBJECT_ID.test(value)) throw new HttpError(400,'INVALID_ID','Invalid identifier');
 return value;
}
export function requireBody(value,fields) {
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new HttpError(400,'INVALID_BODY','JSON object expected');
 if(Object.keys(value).some(k=>!fields.includes(k))) throw new HttpError(422,'UNKNOWN_FIELD','Unknown or forbidden field');
 return value;
}
export function textField(value,name,min=1,max=2000) {
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max) throw new HttpError(422,'INVALID_'+name.toUpperCase(),name+' must contain '+min+'-'+max+' characters');
 return value.trim();
}
export function dateField(value,name) {
 if(typeof value!=='string'||!OFFSET.test(value)||!Number.isFinite(Date.parse(value))) throw new HttpError(422,'INVALID_DATE',name+' requires an ISO date-time with timezone');
 return new Date(value);
}
export function eventInput(input,now=new Date()) {
 requireBody(input,['title','description','venue','startsAt','endsAt','registrationOpensAt','registrationClosesAt','capacity','societyId']);
 const title=textField(input.title,'title',3,150);
 const description=textField(input.description,'description',10,5000);
 const venue=textField(input.venue,'venue',2,250);
 const startsAt=dateField(input.startsAt,'startsAt');
 const endsAt=dateField(input.endsAt,'endsAt');
 const registrationOpensAt=dateField(input.registrationOpensAt,'registrationOpensAt');
 const registrationClosesAt=dateField(input.registrationClosesAt,'registrationClosesAt');
 const capacity=input.capacity;
 if(!Number.isInteger(capacity)||capacity<1||capacity>100000) throw new HttpError(422,'INVALID_CAPACITY','Capacity must be 1-100000');
 if(!(startsAt>now && endsAt>startsAt && registrationOpensAt<registrationClosesAt && registrationClosesAt<=startsAt && registrationClosesAt>now))
  throw new HttpError(422,'INVALID_EVENT_DATES','Check future event and chronological registration dates');
 const societyId=input.societyId??null;
 if(societyId!==null) requireObjectId(societyId);
 return {title,description,venue,startsAt,endsAt,registrationOpensAt,registrationClosesAt,capacity,societyId};
}
export function registrationInput(input,email,userRegistrationNo=null) {
 requireBody(input,['universityEmail','registrationNo']);
 if(typeof input.universityEmail!=='string'||!EMAIL.test(input.universityEmail.trim())) throw new HttpError(422,'INVALID_EMAIL','University email required');
 const normalized=input.universityEmail.trim().toLowerCase();
 if(normalized!==email.toLowerCase()) throw new HttpError(403,'EMAIL_MISMATCH','Use your verified university email');
 let registrationNo=userRegistrationNo??null;
 if(input.registrationNo!==undefined&&input.registrationNo!==null){
  registrationNo=textField(input.registrationNo,'registrationNo',3,40).toUpperCase();
  if(userRegistrationNo && userRegistrationNo.toUpperCase()!==registrationNo) throw new HttpError(422,'REGISTRATION_MISMATCH','Registration number must match your profile');
 }
 return {universityEmailNormalized:normalized,registrationNoSnapshot:registrationNo};
}
export function announcementInput(input) {
 requireBody(input,['title','body','scope','departmentId','societyId']);
 const title=textField(input.title,'title',3,180),body=textField(input.body,'body',5,10000);
 if(!['university','department','society'].includes(input.scope)) throw new HttpError(422,'INVALID_SCOPE','Invalid audience scope');
 const departmentId=input.departmentId??null,societyId=input.societyId??null;
 if(departmentId!==null) requireObjectId(departmentId);
 if(societyId!==null) requireObjectId(societyId);
 if(input.scope==='society' && (!societyId||departmentId)) throw new HttpError(422,'INVALID_SCOPE','Society scope needs a society only');
 if(input.scope==='department' && (!departmentId||societyId)) throw new HttpError(422,'INVALID_SCOPE','Department scope needs a department only');
 if(input.scope==='university'&&(departmentId||societyId)) throw new HttpError(422,'INVALID_SCOPE','University scope cannot have a narrower target');
 return {title,body,scope:input.scope,departmentId,societyId};
}
export function pagination(query){
 const page=query.page===undefined?1:Number(query.page),limit=query.limit===undefined?20:Number(query.limit);
 if(!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>100) throw new HttpError(400,'INVALID_PAGINATION','Page or limit is invalid');
 return {page,limit,skip:(page-1)*limit};
}
export function availability(event,now=new Date()){
 return {isFull:event.confirmedCount>=event.capacity,registrationOpen:event.status==='published'&&now>=event.registrationOpensAt&&now<event.registrationClosesAt&&now<event.startsAt&&event.confirmedCount<event.capacity};
}
export function eventView(doc,now=new Date()){
 const event=doc.toObject?doc.toObject():doc;
 return {id:String(event._id),title:event.title,description:event.description,venue:event.venue,startsAt:event.startsAt,endsAt:event.endsAt,registrationOpensAt:event.registrationOpensAt,registrationClosesAt:event.registrationClosesAt,capacity:event.capacity,confirmedCount:event.confirmedCount,status:event.status,...availability(event,now)};
}
export function registrationView(doc){
 const r=doc.toObject?doc.toObject():doc;
 return {id:String(r._id),eventId:String(r.eventId),studentId:String(r.studentId),status:r.status,confirmedAt:r.confirmedAt};
}
export function announcementView(doc){
 const a=doc.toObject?doc.toObject():doc;
 return {id:String(a._id),title:a.title,body:a.body,scope:a.scope,status:a.status,publishedAt:a.publishedAt};
}
