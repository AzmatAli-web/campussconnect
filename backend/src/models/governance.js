import mongoose from 'mongoose';

const {Schema}=mongoose;
const objectId={type:Schema.Types.ObjectId,required:true};

const bootstrapSchema=new Schema({
  universityId:{...objectId,unique:true},
  adminUserId:objectId,
  firebaseUid:{type:String,required:true},
  createdAt:{type:Date,default:Date.now}
},{collection:'admin_bootstraps',versionKey:false});
bootstrapSchema.index({universityId:1},{unique:true});

const auditSchema=new Schema({
  universityId:objectId,
  actorId:objectId,
  action:{type:String,required:true,maxlength:100},
  targetType:{type:String,required:true,maxlength:60},
  targetId:objectId,
  details:{type:Schema.Types.Mixed,default:{}},
  occurredAt:{type:Date,default:Date.now}
},{collection:'audit_logs',versionKey:false});
auditSchema.index({universityId:1,occurredAt:-1});

const staffInvitationSchema=new Schema({
  universityId:objectId,
  universityEmailNormalized:{type:String,required:true,lowercase:true,trim:true},
  invitedBy:objectId,
  status:{type:String,enum:['pending','activated','revoked'],default:'pending',required:true},
  expiresAt:{type:Date,required:true},
  activatedBy:{type:Schema.Types.ObjectId,default:null},
  activatedUserId:{type:Schema.Types.ObjectId,default:null},
  revokedBy:{type:Schema.Types.ObjectId,default:null}
},{timestamps:true,collection:'staff_invitations',versionKey:false});
staffInvitationSchema.index({universityId:1,universityEmailNormalized:1},{unique:true,partialFilterExpression:{status:'pending'}});
staffInvitationSchema.index({universityId:1,status:1,expiresAt:1});

export const AdminBootstrap=mongoose.models.AdminBootstrap??mongoose.model('AdminBootstrap',bootstrapSchema);
export const AuditLog=mongoose.models.AuditLog??mongoose.model('AuditLog',auditSchema);
export const StaffInvitation=mongoose.models.StaffInvitation??mongoose.model('StaffInvitation',staffInvitationSchema);
