import mongoose from 'mongoose';
const {Schema}=mongoose;
const oid={type:Schema.Types.ObjectId,required:true};

export const LOST_FOUND_KINDS=['lost','found'];
export const LOST_FOUND_CATEGORIES=['electronics','documents','keys','clothing','accessories','other'];
export const CONTACT_PREFERENCES=['adminMediated','helpdesk'];

const schema=new Schema({
 universityId:oid,reporterId:oid,
 kind:{type:String,enum:LOST_FOUND_KINDS,required:true},
 title:{type:String,required:true,minlength:5,maxlength:160},
 description:{type:String,required:true,minlength:20,maxlength:3000},
 category:{type:String,enum:LOST_FOUND_CATEGORIES,required:true},
 locationText:{type:String,required:true,minlength:5,maxlength:250},
 occurredAt:{type:Date,default:null},
 contactPreference:{type:String,enum:CONTACT_PREFERENCES,required:true},
 images:{type:[Schema.Types.ObjectId],default:[]},
 status:{type:String,enum:['open','resolved','removed'],default:'open',required:true},
 resolvedAt:{type:Date,default:null},
 removedAt:{type:Date,default:null},
 removedBy:{type:Schema.Types.ObjectId,default:null},
 removalReason:{type:String,default:'',maxlength:1000}
},{timestamps:true,collection:'lost_found_items',versionKey:false});
schema.index({universityId:1,status:1,kind:1,createdAt:-1,_id:-1});
schema.index({universityId:1,reporterId:1,createdAt:-1,_id:-1});
schema.index({universityId:1,status:1,category:1,createdAt:-1});
export const LostFoundItem=mongoose.models.LostFoundItem??
 mongoose.model('LostFoundItem',schema);
