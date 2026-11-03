import {HttpError} from '../lib/http-error.js';

const categories=new Set(['academic','facilities','fees','other']);
const transitions={
 submitted:['in_review'],in_review:['resolved'],resolved:['closed'],closed:[]
};
function limitedText(value,field,min,max){
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max){
  throw new HttpError(422,'INVALID_COMPLAINT_'+field.toUpperCase(),
    field+' must contain '+min+'–'+max+' characters');
 }
 return value.trim();
}
function exactBody(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!allowed.includes(key))){
  throw new HttpError(422,'INVALID_COMPLAINT_BODY','Unknown or forbidden complaint field');
 }
}
export function complaintInput(body){
 exactBody(body,['category','title','description']);
 if(!categories.has(body.category)){
  throw new HttpError(422,'INVALID_COMPLAINT_CATEGORY','Choose a supported category');
 }
 return {category:body.category,
  title:limitedText(body.title,'title',5,140),
  description:limitedText(body.description,'description',15,3000)};
}
export function complaintStaffUpdate(body,current){
 exactBody(body,['status','staffResponse']);
 const status=body.status;
 if(typeof status!=='string'||!transitions[current.status]?.includes(status)){
  throw new HttpError(409,'INVALID_COMPLAINT_TRANSITION',
    'Allowed next status: '+(transitions[current.status]||[]).join(', '));
 }
 const response=body.staffResponse===undefined
  ? current.staffResponse:limitedText(body.staffResponse,'staffResponse',1,2000);
 if(status==='resolved'&&!response){
  throw new HttpError(422,'COMPLAINT_RESPONSE_REQUIRED',
    'Provide a response before resolving the complaint');
 }
 return {status,staffResponse:response};
}
export function complaintView(item){
 const c=typeof item.toObject==='function'?item.toObject():item;
 // Never expose studentId, email, assigned staff identity or internal audit fields.
 return {id:String(c._id),category:c.category,title:c.title,
  description:c.description,status:c.status,staffResponse:c.staffResponse||'',
  createdAt:c.createdAt,updatedAt:c.updatedAt};
}
