import mongoose from 'mongoose';
const {Schema}=mongoose;
const requiredId={type:Schema.Types.ObjectId,required:true};

const schema=new Schema({
 universityId:requiredId,
 societyId:requiredId,
 studentId:requiredId,
 status:{type:String,enum:['pending','active','rejected','cancelled','left','removed'],
  required:true,default:'pending'},
 requestedAt:{type:Date,required:true,default:Date.now},
 reviewedAt:{type:Date,default:null},
 reviewedBy:{type:Schema.Types.ObjectId,default:null},
 reviewNote:{type:String,default:'',maxlength:500},
 endedAt:{type:Date,default:null},
 endedBy:{type:Schema.Types.ObjectId,default:null},
 endReason:{type:String,default:'',maxlength:500}
},{timestamps:true,collection:'society_memberships',versionKey:false});

// Idempotency across simultaneous requests and client retries.
schema.index({universityId:1,societyId:1,studentId:1},{unique:true});
schema.index({universityId:1,societyId:1,status:1,requestedAt:-1,_id:-1});
schema.index({universityId:1,studentId:1,updatedAt:-1,_id:-1});

export const SocietyMembership=mongoose.models.SocietyMembership??
 mongoose.model('SocietyMembership',schema);
