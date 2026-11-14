import test from 'node:test';
import assert from 'node:assert/strict';
import {
 feeInvoiceInput,feePaymentInput,invoiceView,paymentView,normalizeStudentEmail
} from '../src/services/fees-validation.js';

const domains=['cuiatd.edu.pk'];
const invoice={
 studentEmail:'student@cuiatd.edu.pk',
 invoiceNo:'FALL-2026-0001',title:'Semester fee invoice',
 term:'Fall 2026',dueDate:'2026-11-15',amountPkr:15000
};
test('finance invoice requires a valid campus student, date and whole PKR amount',()=>{
 const data=feeInvoiceInput(invoice,domains);
 assert.equal(data.studentEmail,invoice.studentEmail);
 assert.equal(data.amountPkr,15000);
 assert.equal(data.invoiceNoKey,'FALL-2026-0001');
 assert.equal(normalizeStudentEmail(' STUDENT@CUIATD.EDU.PK ',domains),
  'student@cuiatd.edu.pk');
 for(const bad of [
  {...invoice,studentEmail:'student@gmail.com'},
  {...invoice,studentId:'fake-id'},
  {...invoice,paidPkr:15000},
  {...invoice,status:'paid'},
  {...invoice,amountPkr:9.5},
  {...invoice,amountPkr:0},
  {...invoice,amountPkr:-1},
  {...invoice,amountPkr:'15000'},
  {...invoice,dueDate:'2026-02-31'},
  {...invoice,dueDate:'2026-11-15T00:00:00Z'}
 ])assert.throws(()=>feeInvoiceInput(bad,domains));
});
test('only unique, reasonably sized receipt references and whole PKR counts are accepted',()=>{
 const data=feePaymentInput({amountPkr:8000,receiptRef:'OFFICE-RECEIPT-8'});
 assert.equal(data.amountPkr,8000);
 assert.equal(data.receiptRefKey,'OFFICE-RECEIPT-8');
 assert.throws(()=>feePaymentInput({amountPkr:4.5,receiptRef:'OFFICE-RECEIPT-8'}));
 assert.throws(()=>feePaymentInput({amountPkr:8000,receiptRef:'bad'}));
 assert.throws(()=>feePaymentInput({amountPkr:8000,receiptRef:'OFFICE-RECEIPT-8',studentId:'other'}));
});
test('derived balances, overdue flag and status never depend on client input',()=>{
 const base={_id:'invoice-fixture',invoiceNo:'FALL-01',title:'Tuition',
  term:'Fall 2026',dueDate:'2026-11-01',amountPkr:10000,paidPkr:0,
  studentId:'private-id',issuedBy:'private-staff-id',universityId:'private-campus',
  status:'paid'};
 const now=new Date('2026-11-04T10:00:00Z');
 const unpaid=invoiceView(base,now);
 assert.equal(unpaid.status,'unpaid');
 assert.equal(unpaid.overdue,true);
 assert.equal(unpaid.outstandingPkr,10000);
 const partial=invoiceView({...base,paidPkr:2000},now);
 assert.equal(partial.status,'partially_recorded');
 assert.equal(partial.outstandingPkr,8000);
 const paid=invoiceView({...base,paidPkr:10000},now);
 assert.equal(paid.status,'paid');
 assert.equal(paid.overdue,false);
 assert.equal(paid.outstandingPkr,0);
 for(const key of ['studentId','universityId','issuedBy']){
  assert.equal(Object.hasOwn(partial,key),false);
 }
});
test('payment projection omits finance officer identities',()=>{
 const view=paymentView({_id:'receipt-fixture',invoiceId:'invoice-fixture',
  amountPkr:8000,receiptRef:'OFFICE-RECEIPT-8',
  recordedBy:'private-staff-id',studentId:'private-student',
  createdAt:new Date()});
 assert.equal(view.amountPkr,8000);
 assert.equal(Object.hasOwn(view,'recordedBy'),false);
 assert.equal(Object.hasOwn(view,'studentId'),false);
});
