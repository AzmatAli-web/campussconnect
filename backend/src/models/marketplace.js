import mongoose from 'mongoose';
const {Schema}=mongoose;
const oid={type:Schema.Types.ObjectId,required:true};
export const MARKET_CATEGORIES=['books','electronics','furniture','clothing','other'];
export const MARKET_CONDITIONS=['new','like_new','good','fair'];

const listingSchema=new Schema({
 universityId:oid,sellerId:oid,
 title:{type:String,required:true,minlength:5,maxlength:160},
 description:{type:String,required:true,minlength:20,maxlength:3000},
 category:{type:String,required:true,enum:MARKET_CATEGORIES},
 condition:{type:String,required:true,enum:MARKET_CONDITIONS},
 pricePkr:{type:Number,required:true,min:0,max:5000000},
 contactConsent:{type:Boolean,required:true,default:false},
 status:{type:String,required:true,enum:['published','sold','archived','moderated'],default:'published'},
 imageKey:{type:String,default:null},imageMime:{type:String,default:null},imageSize:{type:Number,default:0},
 moderatedBy:{type:Schema.Types.ObjectId,default:null},moderatedAt:{type:Date,default:null}
},{timestamps:true,collection:'marketplace_listings',versionKey:false});
listingSchema.index({universityId:1,status:1,createdAt:-1,_id:-1});
listingSchema.index({universityId:1,status:1,category:1,pricePkr:1});
listingSchema.index({universityId:1,sellerId:1,createdAt:-1,_id:-1});

const reportSchema=new Schema({
 universityId:oid,listingId:oid,reporterId:oid,
 reason:{type:String,required:true,enum:['spam','scam','prohibited','misleading','other']},
 detail:{type:String,default:'',maxlength:1000},
 status:{type:String,required:true,enum:['open','dismissed','actioned'],default:'open'},
 resolvedBy:{type:Schema.Types.ObjectId,default:null},resolvedAt:{type:Date,default:null},
 resolutionNote:{type:String,default:'',maxlength:1000}
},{timestamps:true,collection:'marketplace_reports',versionKey:false});
reportSchema.index({universityId:1,listingId:1,reporterId:1},{unique:true});
reportSchema.index({universityId:1,status:1,createdAt:-1,_id:-1});

export const MarketplaceListing=mongoose.models.MarketplaceListing??
 mongoose.model('MarketplaceListing',listingSchema);
export const MarketplaceReport=mongoose.models.MarketplaceReport??
 mongoose.model('MarketplaceReport',reportSchema);
