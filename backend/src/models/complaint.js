import mongoose from 'mongoose';
const {Schema}=mongoose;

const complaintSchema=new Schema({
  universityId:{type:Schema.Types.ObjectId,required:true},
  studentId:{type:Schema.Types.ObjectId,required:true},
  category:{type:String,enum:['academic','facilities','fees','other'],required:true},
  title:{type:String,required:true,minlength:5,maxlength:140},
  description:{type:String,required:true,minlength:15,maxlength:3000},
  status:{type:String,enum:['submitted','in_review','resolved','closed'],
    default:'submitted',required:true},
  staffResponse:{type:String,default:'',maxlength:2000},
  handledBy:{type:Schema.Types.ObjectId,default:null},
  handledAt:{type:Date,default:null}
},{timestamps:true,collection:'student_complaints',versionKey:false});

complaintSchema.index({universityId:1,studentId:1,createdAt:-1});
complaintSchema.index({universityId:1,status:1,createdAt:-1});
export const StudentComplaint=mongoose.models.StudentComplaint??
  mongoose.model('StudentComplaint',complaintSchema);
