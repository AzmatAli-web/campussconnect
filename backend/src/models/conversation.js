import mongoose from 'mongoose';

const {Schema}=mongoose;
const id={type:Schema.Types.ObjectId,required:true};
const conversationSchema=new Schema({
 universityId:id,requester:id,recipient:id,pair:{type:String,required:true},
 requesterName:{type:String,required:true},recipientName:{type:String,required:true},
 status:{type:String,enum:['pending','accepted','declined'],default:'pending'}
},{versionKey:false});
conversationSchema.index({universityId:1,pair:1},{unique:true});
conversationSchema.index({universityId:1,requester:1,_id:-1});
conversationSchema.index({universityId:1,recipient:1,_id:-1});
const messageSchema=new Schema({
 conversationId:id,sender:id,clientId:{type:String,required:true},
 body:{type:String,required:true,maxlength:2000},createdAt:{type:Date,default:Date.now}
},{versionKey:false});
messageSchema.index({conversationId:1,sender:1,clientId:1},{unique:true});
messageSchema.index({conversationId:1,_id:-1});
export const Conversation=mongoose.model('Conversation',conversationSchema);
export const Message=mongoose.model('Message',messageSchema);
