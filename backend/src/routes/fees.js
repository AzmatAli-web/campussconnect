import mongoose from 'mongoose';
import {Router} from 'express';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {requireObjectId,pagination} from '../services/mvp-validation.js';
import {User} from '../models/user.js';
import {FeeInvoice,FeePaymentRecord} from '../models/fees.js';
import {
 normalizeStudentEmail,feeInvoiceInput,feePaymentInput,invoiceView,paymentView
} from '../services/fees-validation.js';

async function validStudent(email,config){
 const student=await User.findOne({
  universityId:config.universityId,emailNormalized:email,
  status:'active',activeRoles:'student'
 }).lean();
 if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND',
  'Active student with that campus email not found');
 return student;
}
function exactQuery(query,fields){
 if(Object.keys(query).some(k=>!fields.includes(k))){
  throw new HttpError(400,'INVALID_FEE_QUERY','Unsupported fee filter');
 }
}
export function feesRouter(deps){
 const router=Router(),auth=campusUserMiddleware(deps);
 router.use((_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 // Students can only see invoices and recorded payment entries assigned to them.
 router.get('/me/fees',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  exactQuery(req.query,['page','limit']);
  const {page,limit,skip}=pagination(req.query);
  const filter={universityId:deps.config.universityId,
   studentId:req.currentUser._id};
  const [items,total]=await Promise.all([
   FeeInvoice.find(filter).sort({dueDate:-1,_id:-1})
    .skip(skip).limit(limit).lean(),FeeInvoice.countDocuments(filter)
  ]);
  return res.json({data:items.map(i=>invoiceView(i)),meta:{page,limit,total}});
 }));
 router.get('/me/fees/:id/payments',auth,asyncHandler(async(req,res)=>{
  needRole(req,'student');
  const id=requireObjectId(req.params.id);
  const invoice=await FeeInvoice.findOne({
   _id:id,universityId:deps.config.universityId,
   studentId:req.currentUser._id
  }).lean();
  if(!invoice)throw new HttpError(404,'FEE_NOT_FOUND','Fee record not found');
  const rows=await FeePaymentRecord.find({
   universityId:deps.config.universityId,invoiceId:id,
   studentId:req.currentUser._id
  }).sort({createdAt:1,_id:1}).limit(100).lean();
  return res.json({data:rows.map(paymentView)});
 }));
 // Staff must specify ONE campus email; no unbounded cross-student finance directory.
 router.get('/staff/fees',auth,asyncHandler(async(req,res)=>{
  needRole(req,'staff','admin');
  exactQuery(req.query,['studentEmail']);
  const email=normalizeStudentEmail(req.query.studentEmail,deps.config.domains);
  const student=await validStudent(email,deps.config);
  const rows=await FeeInvoice.find({
   universityId:deps.config.universityId,studentId:student._id
  }).sort({dueDate:-1,_id:-1}).limit(100).lean();
  return res.json({data:rows.map(invoiceView)});
 }));
 router.post('/staff/fees',auth,asyncHandler(async(req,res)=>{
  needRole(req,'staff','admin');
  const data=feeInvoiceInput(req.body,deps.config.domains);
  const student=await validStudent(data.studentEmail,deps.config);
  const {studentEmail,...input}=data;
  try{
   const invoice=await FeeInvoice.create({
    ...input,universityId:deps.config.universityId,studentId:student._id,
    paidPkr:0,issuedBy:req.currentUser._id
   });
   return res.status(201).json({data:invoiceView(invoice)});
  }catch(error){
   if(error?.code===11000)throw new HttpError(409,'INVOICE_EXISTS',
    'Invoice number is already assigned in this university');
   throw error;
  }
 }));
 // This is an administrative entry for an already verified OFFLINE payment.
 // It is NOT a bank transfer, gateway charge or verification of a bank receipt.
 router.post('/staff/fees/:id/payments',auth,asyncHandler(async(req,res)=>{
  needRole(req,'staff','admin');
  const id=requireObjectId(req.params.id);
  const payment=feePaymentInput(req.body);
  const session=await mongoose.startSession();
  let result;
  try{
   await session.withTransaction(async()=>{
    const invoice=await FeeInvoice.findOne({
     _id:id,universityId:deps.config.universityId
    }).session(session).lean();
    if(!invoice)throw new HttpError(404,'FEE_NOT_FOUND','Fee record not found');
    if(invoice.amountPkr-invoice.paidPkr<payment.amountPkr){
     throw new HttpError(409,'FEE_OVERPAYMENT',
      'Recorded payment exceeds the current outstanding balance');
    }
    const next=await FeeInvoice.findOneAndUpdate({
      _id:id,universityId:deps.config.universityId,
      paidPkr:{$lte:invoice.amountPkr-payment.amountPkr}
     },{$inc:{paidPkr:payment.amountPkr}},
     {session,new:true,runValidators:true});
    if(!next)throw new HttpError(409,'FEE_CHANGED',
     'Fee record changed; refresh and try again');
    const [entry]=await FeePaymentRecord.create([{
     universityId:deps.config.universityId,studentId:invoice.studentId,
     invoiceId:invoice._id,...payment,recordedBy:req.currentUser._id
    }],{session});
    result={invoice:invoiceView(next),payment:paymentView(entry)};
   });
  }catch(error){
   if(error?.code===11000)throw new HttpError(409,'RECEIPT_ALREADY_RECORDED',
    'This receipt reference was already used');
   if(error?.errorLabels?.includes('TransientTransactionError')){
    throw new HttpError(409,'FEE_CONCURRENT_UPDATE',
     'Fee changed concurrently; refresh before recording another payment');
   }
   throw error;
  }finally{
   await session.endSession();
  }
  return res.status(201).json({data:result});
 }));
 return router;
}
