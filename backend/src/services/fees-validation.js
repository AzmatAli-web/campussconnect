import {HttpError} from '../lib/http-error.js';
const code=/^[A-Za-z0-9][A-Za-z0-9_/ -]*$/;
const due=/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function cleanText(value,name,min,max){
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max){
  throw new HttpError(422,'INVALID_FEE_FIELD',name+' must be '+min+'–'+max+' characters');
 }
 return value.trim().replace(/\s+/g,' ');
}
function exact(body,fields){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!fields.includes(k))){
  throw new HttpError(422,'INVALID_FEE_BODY','Unknown or privileged fee field');
 }
}
export function normalizeStudentEmail(value,domains){
 const email=cleanText(value,'studentEmail',6,253).toLowerCase();
 const at=email.lastIndexOf('@');
 if(at<1||email.indexOf('@')!==at||!domains.includes(email.slice(at+1))||
    /\s/.test(email)){
  throw new HttpError(422,'INVALID_STUDENT_EMAIL','Use a verified campus email');
 }
 return email;
}
function money(value,name){
 if(!Number.isSafeInteger(value)||value<1||value>1000000000){
  throw new HttpError(422,'INVALID_FEE_AMOUNT',
   name+' must be a whole number of PKR (1–1,000,000,000)');
 }
 return value;
}
export function feeInvoiceInput(body,domains){
 exact(body,['studentEmail','invoiceNo','title','term','dueDate','amountPkr']);
 const studentEmail=normalizeStudentEmail(body.studentEmail,domains);
 const invoiceNo=cleanText(body.invoiceNo,'invoiceNo',4,40);
 if(!code.test(invoiceNo))throw new HttpError(422,'INVALID_INVOICE_NO','Invalid invoice number');
 const title=cleanText(body.title,'title',5,140);
 const term=cleanText(body.term,'term',3,40);
 if(typeof body.dueDate!=='string'||!due.test(body.dueDate)||
    new Date(body.dueDate+'T00:00:00.000Z').toISOString().slice(0,10)!==body.dueDate){
  throw new HttpError(422,'INVALID_FEE_DUE_DATE','Use a valid YYYY-MM-DD due date');
 }
 return {studentEmail,invoiceNo,invoiceNoKey:invoiceNo.toUpperCase(),
  title,term,dueDate:body.dueDate,amountPkr:money(body.amountPkr,'amountPkr')};
}
export function feePaymentInput(body){
 exact(body,['amountPkr','receiptRef']);
 const amountPkr=money(body.amountPkr,'amountPkr');
 const receiptRef=cleanText(body.receiptRef,'receiptRef',5,70);
 if(!code.test(receiptRef)){
  throw new HttpError(422,'INVALID_RECEIPT_REF',
   'Receipt reference contains unsupported characters');
 }
 return {amountPkr,receiptRef,receiptRefKey:receiptRef.toUpperCase()};
}
export function invoiceView(doc,now=new Date()){
 const i=doc.toObject?doc.toObject():doc;
 const outstandingPkr=Math.max(0,i.amountPkr-i.paidPkr);
 const status=outstandingPkr===0?'paid':i.paidPkr>0?'partially_recorded':'unpaid';
 const today=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'
 }).format(now);
 return {id:String(i._id),invoiceNo:i.invoiceNo,title:i.title,term:i.term,
  dueDate:i.dueDate,currency:'PKR',amountPkr:i.amountPkr,paidPkr:i.paidPkr,
  outstandingPkr,status,overdue:outstandingPkr>0&&i.dueDate<today,
  createdAt:i.createdAt,updatedAt:i.updatedAt};
}
export function paymentView(doc){
 const p=doc.toObject?doc.toObject():doc;
 return {id:String(p._id),invoiceId:String(p.invoiceId),
  amountPkr:p.amountPkr,receiptRef:p.receiptRef,recordedAt:p.createdAt};
}
