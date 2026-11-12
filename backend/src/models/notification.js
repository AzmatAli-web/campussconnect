import mongoose from 'mongoose';
const {Schema}=mongoose;
const oid={type:Schema.Types.ObjectId,required:true};
const retentionDays=90;
export const notificationRetentionMs=retentionDays*24*60*60*1000;

const personalSchema=new Schema({
 universityId:oid,recipientId:oid,
 type:{type:String,required:true,enum:['event_registration','membership_approved','membership_rejected','membership_removed']},
 sourceKey:{type:String,required:true,maxlength:180},
 sourceId:{type:Schema.Types.ObjectId,required:true},
 title:{type:String,required:true,maxlength:150},
 body:{type:String,required:true,maxlength:350},
 readAt:{type:Date,default:null},
 expiresAt:{type:Date,required:true},
 pushState:{type:String,enum:['pending','sending','retry','sent','failed','skipped'],default:'pending'},
 pushAttempts:{type:Number,default:0,min:0},
 pushNextAt:{type:Date,default:Date.now},
 pushClaimedAt:{type:Date,default:null},
 pushLastError:{type:String,default:null,maxlength:100}
},{timestamps:true,collection:'notifications',versionKey:false});
personalSchema.index({universityId:1,recipientId:1,createdAt:-1,_id:-1});
personalSchema.index({universityId:1,recipientId:1,readAt:1,createdAt:-1});
personalSchema.index({universityId:1,recipientId:1,sourceKey:1},{unique:true});
personalSchema.index({universityId:1,pushState:1,pushNextAt:1,createdAt:1});
personalSchema.index({expiresAt:1},{expireAfterSeconds:0});

const readSchema=new Schema({
 universityId:oid,recipientId:oid,announcementId:oid,
 readAt:{type:Date,required:true,default:Date.now},
 expiresAt:{type:Date,required:true}
},{collection:'notification_announcement_reads',versionKey:false});
readSchema.index({universityId:1,recipientId:1,announcementId:1},{unique:true});
readSchema.index({expiresAt:1},{expireAfterSeconds:0});

const deviceSchema=new Schema({
 universityId:oid,userId:oid,
 tokenHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},
 token:{type:String,required:true,minlength:80,maxlength:4096,select:false},
 platform:{type:String,enum:['android'],required:true,default:'android'},
 lastSeenAt:{type:Date,default:Date.now,required:true}
},{timestamps:true,collection:'notification_push_devices',versionKey:false});
deviceSchema.index({universityId:1,tokenHash:1},{unique:true});
deviceSchema.index({universityId:1,userId:1,lastSeenAt:-1});

export const CampusNotification=mongoose.models.CampusNotification||
 mongoose.model('CampusNotification',personalSchema);
export const AnnouncementNotificationRead=mongoose.models.AnnouncementNotificationRead||
 mongoose.model('AnnouncementNotificationRead',readSchema);
export const NotificationPushDevice=mongoose.models.NotificationPushDevice||
 mongoose.model('NotificationPushDevice',deviceSchema);
