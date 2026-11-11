import {HttpError} from '../lib/http-error.js';
import {pagination,requireBody,textField} from './mvp-validation.js';

const managerStatuses=['pending','active'];
const actions=['approve','reject','remove'];
export function emptySocietyBody(body){
 requireBody(body??{},[]);
 if(Object.keys(body??{}).length)throw new HttpError(422,'UNEXPECTED_FIELDS','No fields are accepted');
}
export function societyMembersFilter(query){
 if(Object.keys(query).some(k=>!['page','limit','status'].includes(k)))
  throw new HttpError(400,'INVALID_MEMBERSHIP_FILTER','Unsupported membership filter');
 const {page,limit,skip}=pagination(query);
 const status=query.status??'pending';
 if(!managerStatuses.includes(status))
  throw new HttpError(400,'INVALID_MEMBERSHIP_STATUS','Choose pending or active');
 return {page,limit,skip,status};
}
export function reviewSocietyMembership(body){
 requireBody(body,['action','note']);
 if(!actions.includes(body.action))
  throw new HttpError(422,'INVALID_MEMBERSHIP_ACTION','Choose approve, reject or remove');
 const action=body.action;
 const note=body.note===undefined?'':textField(body.note,'note',5,500);
 if(action!=='approve'&&!note)
  throw new HttpError(422,'MEMBERSHIP_REASON_REQUIRED','Reject/remove needs a reason');
 return {action,note};
}
export function societyMembershipView(doc){
 const m=doc.toObject?.()??doc;
 return {
  id:String(m._id),
  societyId:String(m.societyId),
  status:m.status,
  requestedAt:m.requestedAt,
  reviewedAt:m.reviewedAt??null,
  reviewNote:m.reviewNote??'',
  endedAt:m.endedAt??null
 };
}
export function privateSocietyMemberView(doc,user){
 return {
  ...societyMembershipView(doc),
  student:{name:user?.fullName??'Unavailable',email:user?.emailNormalized??null}
 };
}
