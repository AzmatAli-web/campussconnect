import {HttpError} from '../lib/http-error.js';
import {requireBody,textField,pagination} from './mvp-validation.js';
import {
 LOST_FOUND_KINDS,LOST_FOUND_CATEGORIES,CONTACT_PREFERENCES
} from '../models/lost-found.js';

function selected(value,options,name){
 if(!options.includes(value))throw new HttpError(422,'INVALID_'+name.toUpperCase(),name+' is invalid');
 return value;
}
const fields={
 kind:v=>selected(v,LOST_FOUND_KINDS,'kind'),
 title:v=>textField(v,'title',5,160),
 description:v=>textField(v,'description',20,3000),
 category:v=>selected(v,LOST_FOUND_CATEGORIES,'category'),
 locationText:v=>textField(v,'locationText',5,250),
 contactPreference:v=>selected(v,CONTACT_PREFERENCES,'contactPreference'),
 occurredAt:value=>{
  if(value===null)return null;
  if(typeof value!=='string'||!/Z$|[+-]\d\d:\d\d$/.test(value)||
      !Number.isFinite(Date.parse(value)))
   throw new HttpError(422,'INVALID_OCCURRENCE_DATE','occurredAt must be an ISO date with timezone or null');
  const date=new Date(value);
  if(date.getTime()>Date.now()+5*60_000)
   throw new HttpError(422,'FUTURE_OCCURRENCE','Occurrence time cannot be in the future');
  return date;
 }
};
export function lostFoundCreate(body){
 requireBody(body,Object.keys(fields));
 const required=['kind','title','description','category','locationText','contactPreference'];
 for(const k of required)if(!Object.hasOwn(body,k))
  throw new HttpError(422,'REQUIRED_FIELDS','Missing '+k);
 const out={};
 for(const [key,value] of Object.entries(body))out[key]=fields[key](value);
 return out;
}
export function lostFoundPatch(body){
 requireBody(body,['title','description','locationText','status']);
 if(Object.keys(body).length===0)throw new HttpError(422,'EMPTY_UPDATE','No changes supplied');
 const result={};
 for(const [k,v] of Object.entries(body)){
  result[k]=k==='status'?selected(v,['resolved'],'status'):fields[k](v);
 }
 return result;
}
export function lostFoundFilter(query){
 if(Object.keys(query).some(k=>!['page','limit','kind','category','q'].includes(k)))
  throw new HttpError(400,'INVALID_LOST_FOUND_QUERY','Unsupported report filter');
 const {page,limit,skip}=pagination(query);
 const filter={};
 if(query.kind!==undefined)filter.kind=selected(query.kind,LOST_FOUND_KINDS,'kind');
 if(query.category!==undefined)filter.category=selected(query.category,LOST_FOUND_CATEGORIES,'category');
 if(query.q!==undefined){
  const q=textField(query.q,'q',2,60).replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
  filter.$or=[{title:{$regex:q,$options:'i'}},
   {description:{$regex:q,$options:'i'}},{locationText:{$regex:q,$options:'i'}}];
 }
 return {filter,page,limit,skip};
}
export function lostFoundModeration(body){
 requireBody(body,['action','reason']);
 if(body.action!=='remove')throw new HttpError(422,'INVALID_MODERATION_ACTION','Only remove is permitted');
 return {action:'remove',reason:textField(body.reason,'reason',5,1000)};
}
export function lostFoundView(value){
 const v=value.toObject?.()??value;
 return {id:String(v._id),kind:v.kind,title:v.title,description:v.description,
  category:v.category,locationText:v.locationText,occurredAt:v.occurredAt??null,
  contactPreference:v.contactPreference,status:v.status,createdAt:v.createdAt,
  updatedAt:v.updatedAt};
}
