import {HttpError} from '../lib/http-error.js';
import {pagination,requireBody,textField} from './mvp-validation.js';
import {MARKET_CATEGORIES,MARKET_CONDITIONS} from '../models/marketplace.js';

function choice(value,allowed,name){
 if(!allowed.includes(value))throw new HttpError(422,'INVALID_'+name.toUpperCase(),name+' is invalid');
 return value;
}
function price(value){
 if(!Number.isSafeInteger(value)||value<0||value>5000000)
  throw new HttpError(422,'INVALID_PRICE','pricePkr must be a whole PKR amount between 0 and 5,000,000');
 return value;
}
function consent(value){
 if(typeof value!=='boolean')
  throw new HttpError(422,'INVALID_CONSENT','contactConsent must be true or false');
 return value;
}
const fieldRules={
 title:v=>textField(v,'title',5,160),
 description:v=>textField(v,'description',20,3000),
 category:v=>choice(v,MARKET_CATEGORIES,'category'),
 condition:v=>choice(v,MARKET_CONDITIONS,'condition'),
 pricePkr:price,
 contactConsent:consent
};
export function marketplaceInput(body,{partial=false}={}){
 requireBody(body,Object.keys(fieldRules));
 if(partial && Object.keys(body).length===0) throw new HttpError(422,'EMPTY_UPDATE','Provide at least one field');
 if(!partial && Object.keys(body).length!==Object.keys(fieldRules).length)
  throw new HttpError(422,'REQUIRED_FIELDS','title, description, category, condition, pricePkr and contactConsent are required');
 const result={};
 for(const [key,value] of Object.entries(body))result[key]=fieldRules[key](value);
 return result;
}
export function marketplaceFilter(query){
 const allowed=['page','limit','q','category','minPrice','maxPrice'];
 if(Object.keys(query).some(k=>!allowed.includes(k)))
  throw new HttpError(400,'INVALID_MARKETPLACE_FILTER','Unsupported search field');
 const {page,limit,skip}=pagination(query);
 const filter={};
 if(query.category!==undefined)filter.category=choice(query.category,MARKET_CATEGORIES,'category');
 const min=query.minPrice===undefined?0:Number(query.minPrice);
 const max=query.maxPrice===undefined?5000000:Number(query.maxPrice);
 if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<0||max>5000000||min>max)
  throw new HttpError(400,'INVALID_PRICE_FILTER','Invalid price range');
 if(query.minPrice!==undefined||query.maxPrice!==undefined)filter.pricePkr={$gte:min,$lte:max};
 if(query.q!==undefined){
  const q=textField(query.q,'q',2,60).replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
  filter.$or=[{title:{$regex:q,$options:'i'}},{description:{$regex:q,$options:'i'}}];
 }
 return {filter,page,limit,skip};
}
export function marketplaceReportInput(body){
 requireBody(body,['reason','detail']);
 const reason=choice(body.reason,['spam','scam','prohibited','misleading','other'],'reason');
 const detail=body.detail===undefined?'':(body.detail===''?'':textField(body.detail,'detail',3,1000));
 return {reason,detail};
}
export function marketplaceResolutionInput(body){
 requireBody(body,['action','note']);
 const action=choice(body.action,['dismiss','archive'],'action');
 const note=textField(body.note,'note',5,1000);
 return {action,note};
}
export function marketplaceView(value){
 const x=value.toObject?.()??value;
 return {
  id:String(x._id),title:x.title,description:x.description,
  category:x.category,condition:x.condition,pricePkr:x.pricePkr,
  status:x.status,contactAvailable:x.contactConsent===true,
  hasImage:Boolean(x.imageKey),createdAt:x.createdAt,updatedAt:x.updatedAt
 };
}
export function reportView(value){
 const x=value.toObject?.()??value;
 return {
  id:String(x._id),listingId:String(x.listingId),
  reason:x.reason,detail:x.detail,status:x.status,
  resolutionNote:x.resolutionNote,createdAt:x.createdAt,resolvedAt:x.resolvedAt
 };
}
export function validateMarketplaceImage(file){
 if(!file?.buffer||file.buffer.length<12||file.buffer.length>2*1024*1024)
  throw new HttpError(422,'INVALID_MARKET_IMAGE','Choose a JPEG, PNG or WebP photo up to 2 MB');
 const b=file.buffer;
 const jpg=b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
 const png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 const expected=jpg?'image/jpeg':png?'image/png':webp?'image/webp':null;
 if(!expected||file.mimetype!==expected ||
    !({ 'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i,'image/webp':/\.webp$/i })[expected].test(file.originalname))
  throw new HttpError(415,'UNSUPPORTED_MARKET_IMAGE','Image must be a real JPEG, PNG or WebP matching its filename');
 return {buffer:b,mime:expected,ext:jpg?'.jpg':png?'.png':'.webp'};
}
