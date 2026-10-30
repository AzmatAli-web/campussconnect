import mongoose from 'mongoose';
const {Schema}=mongoose;
const oid={type:Schema.Types.ObjectId,required:true};

const eventSchema=new Schema({
 universityId:oid,organizerId:oid,organizerType:{type:String,enum:['faculty','societyManager'],required:true},societyId:{type:Schema.Types.ObjectId,default:null},
 title:{type:String,required:true,maxlength:150},description:{type:String,required:true,maxlength:5000},venue:{type:String,required:true,maxlength:250},
 startsAt:{type:Date,required:true},endsAt:{type:Date,required:true},
 registrationOpensAt:{type:Date,required:true},registrationClosesAt:{type:Date,required:true},
 capacity:{type:Number,required:true,min:1,max:100000},confirmedCount:{type:Number,required:true,default:0,min:0},
 status:{type:String,enum:['published','completed','cancelled'],required:true,default:'published'},
 cancelledBy:{type:Schema.Types.ObjectId,default:null},cancelReason:{type:String,default:null}
},{timestamps:true,collection:'events',versionKey:false});
eventSchema.index({universityId:1,status:1,startsAt:1});eventSchema.index({organizerId:1,startsAt:1});
eventSchema.pre('validate',function(next){if(this.confirmedCount>this.capacity)return next(new Error('Confirmed count cannot exceed capacity'));next();});
const registrationSchema=new Schema({
 universityId:oid,eventId:oid,studentId:oid,universityEmailNormalized:{type:String,required:true},
 studentNameSnapshot:{type:String,required:true},registrationNoSnapshot:{type:String,default:null},
 status:{type:String,enum:['confirmed'],default:'confirmed',required:true},confirmedAt:{type:Date,required:true}
},{timestamps:true,collection:'event_registrations',versionKey:false});
registrationSchema.index({eventId:1,studentId:1},{unique:true});registrationSchema.index({universityId:1,eventId:1,confirmedAt:-1});
const announcementSchema=new Schema({
 universityId:oid,authorId:oid,scope:{type:String,enum:['university','department','society'],required:true},
 departmentId:{type:Schema.Types.ObjectId,default:null},societyId:{type:Schema.Types.ObjectId,default:null},
 title:{type:String,required:true,maxlength:180},body:{type:String,required:true,maxlength:10000},
 status:{type:String,enum:['published','archived'],default:'published',required:true},publishedAt:{type:Date,required:true}
},{timestamps:true,collection:'announcements',versionKey:false});
announcementSchema.index({universityId:1,status:1,publishedAt:-1});announcementSchema.index({societyId:1,publishedAt:-1});
const assignmentSchema=new Schema({
 universityId:oid,societyId:oid,userId:oid,status:{type:String,enum:['active','revoked'],required:true},
 approvedAt:{type:Date,required:true},approvedBy:{type:Schema.Types.ObjectId,default:null}
},{timestamps:true,collection:'society_manager_assignments',versionKey:false});
assignmentSchema.index({societyId:1,userId:1},{unique:true});
const societySchema=new Schema({
 universityId:oid,name:{type:String,required:true},slug:{type:String,required:true},
 description:{type:String,required:true},createdBy:oid,status:{type:String,enum:['active','archived'],required:true,default:'active'}
},{timestamps:true,collection:'societies',versionKey:false});
societySchema.index({universityId:1,slug:1},{unique:true});
const idempotencySchema=new Schema({
 universityId:oid,actorId:oid,scope:{type:String,required:true},key:{type:String,required:true},
 requestHash:{type:String,required:true},status:{type:String,enum:['processing','completed'],required:true},
 responseCode:{type:Number,default:null},responseBody:{type:Schema.Types.Mixed,default:null},
 expiresAt:{type:Date,required:true}
},{timestamps:true,collection:'idempotency_keys',versionKey:false});
idempotencySchema.index({universityId:1,actorId:1,scope:1,key:1},{unique:true});
idempotencySchema.index({expiresAt:1},{expireAfterSeconds:0});
export const Event=mongoose.models.Event??mongoose.model('Event',eventSchema);
export const EventRegistration=mongoose.models.EventRegistration??mongoose.model('EventRegistration',registrationSchema);
export const Announcement=mongoose.models.Announcement??mongoose.model('Announcement',announcementSchema);
export const SocietyManagerAssignment=mongoose.models.SocietyManagerAssignment??mongoose.model('SocietyManagerAssignment',assignmentSchema);
export const Society=mongoose.models.Society??mongoose.model('Society',societySchema);
export const IdempotencyKey=mongoose.models.IdempotencyKey??mongoose.model('IdempotencyKey',idempotencySchema);
