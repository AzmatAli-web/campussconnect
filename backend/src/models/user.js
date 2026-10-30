import mongoose from 'mongoose';
const {Schema}=mongoose;
const roles=['student','faculty','societyManager','staff','admin'];
const schema=new Schema({
 universityId:{type:Schema.Types.ObjectId,required:true,immutable:true,ref:'University'},
 firebaseUid:{type:String,required:true,immutable:true,trim:true},
 emailNormalized:{type:String,required:true,immutable:true,lowercase:true,trim:true},
 emailVerifiedAt:{type:Date,default:null},
 fullName:{type:String,required:true,trim:true,minlength:2,maxlength:120},
 departmentId:{type:Schema.Types.ObjectId,default:null},
 registrationNo:{type:String,default:null,uppercase:true,trim:true},
 requestedRole:{type:String,enum:['student','faculty'],required:true},
 activeRoles:{type:[{type:String,enum:roles}],default:[]},
 status:{type:String,enum:['pending','active','suspended'],required:true},
 facultyVerificationStatus:{type:String,enum:['unverified','pending','verified','rejected'],default:'unverified'}
},{timestamps:true,collection:'users',versionKey:false});
schema.index({firebaseUid:1},{unique:true});
schema.index({emailNormalized:1},{unique:true});
schema.index({universityId:1,registrationNo:1},{unique:true,partialFilterExpression:{registrationNo:{$type:'string'}}});
schema.index({universityId:1,status:1});
export const User=mongoose.models.User??mongoose.model('User',schema);
