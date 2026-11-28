import mongoose from 'mongoose';

const {Schema}=mongoose;
export const audiences=['campus','student','faculty','societyManager','staff','financeOfficer','admin'];
const id={type:Schema.Types.ObjectId,required:true};
const schema=new Schema({
 universityId:id,createdBy:id,clientId:{type:String,required:true},
 title:{type:String,required:true,maxlength:160},reference:{type:String,required:true,maxlength:400},
 text:{type:String,required:true,maxlength:6000},audience:{type:String,enum:audiences,required:true},
 status:{type:String,enum:['draft','approved','withdrawn'],default:'draft'},
 approvedAt:Date,approvedBy:Schema.Types.ObjectId,withdrawnAt:Date,withdrawnBy:Schema.Types.ObjectId
},{timestamps:true,versionKey:false});
schema.index({universityId:1,createdBy:1,clientId:1},{unique:true});
schema.index({universityId:1,status:1,audience:1,_id:-1});
schema.index({universityId:1,_id:-1});
schema.index({universityId:1,title:'text',text:'text'},{weights:{title:5,text:1}});
export const KnowledgeSource=mongoose.model('KnowledgeSource',schema);
