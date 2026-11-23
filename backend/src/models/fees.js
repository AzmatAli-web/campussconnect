import mongoose from 'mongoose';
const {Schema}=mongoose;
const invoiceSchema=new Schema({
 universityId:{type:Schema.Types.ObjectId,required:true},
 studentId:{type:Schema.Types.ObjectId,required:true},
 invoiceNo:{type:String,required:true,maxlength:40},
 invoiceNoKey:{type:String,required:true,maxlength:40},
 title:{type:String,required:true,minlength:5,maxlength:140},
 term:{type:String,required:true,minlength:3,maxlength:40},
 dueDate:{type:String,required:true},
 amountPkr:{type:Number,required:true,min:1,max:1000000000},
 paidPkr:{type:Number,required:true,min:0,default:0},
 issuedBy:{type:Schema.Types.ObjectId,required:true}
},{timestamps:true,versionKey:false,collection:'fee_invoices'});
invoiceSchema.index({universityId:1,invoiceNoKey:1},{unique:true});
invoiceSchema.index({universityId:1,studentId:1,dueDate:1});
const paymentSchema=new Schema({
 universityId:{type:Schema.Types.ObjectId,required:true},
 studentId:{type:Schema.Types.ObjectId,required:true},
 invoiceId:{type:Schema.Types.ObjectId,required:true},
 amountPkr:{type:Number,required:true,min:1,max:1000000000},
 receiptRef:{type:String,required:true,minlength:5,maxlength:70},
 receiptRefKey:{type:String,required:true},
 recordedBy:{type:Schema.Types.ObjectId,required:true}
},{timestamps:true,versionKey:false,collection:'fee_payment_records'});
paymentSchema.index({universityId:1,receiptRefKey:1},{unique:true});
paymentSchema.index({universityId:1,invoiceId:1,createdAt:1});
export const FeeInvoice=mongoose.models.FeeInvoice??
 mongoose.model('FeeInvoice',invoiceSchema);
export const FeePaymentRecord=mongoose.models.FeePaymentRecord??
 mongoose.model('FeePaymentRecord',paymentSchema);
