import {campusAnswer} from '../services/campus-answer.js';
import {Router} from 'express';
import {audiences,KnowledgeSource} from '../models/knowledge-source.js';
import {campusUserMiddleware,needRole} from '../middleware/campus-user.js';
import {HttpError,asyncHandler} from '../lib/http-error.js';
import {requireBody,requireObjectId,textField} from '../services/mvp-validation.js';

const publicFields='title reference audience text approvedAt';
const adminFields=publicFields+' status createdAt createdBy approvedBy withdrawnAt withdrawnBy';
const adminPath='/admin/knowledge-sources', readerPath='/knowledge-sources';

export function knowledgeSourcesRouter(deps){
 const router=Router();
 router.use([adminPath,readerPath],(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},campusUserMiddleware(deps));
 router.use(adminPath,(req,_res,next)=>{needRole(req,'admin');next();});
 const campus=req=>({universityId:req.currentUser.universityId});
 const approved=req=>({...campus(req),status:'approved',audience:{$in:['campus',...req.roles]}});
 function list(filter,fields){
  return asyncHandler(async(req,res)=>{
   const criteria=filter(req);
   if(req.query.before!==undefined)criteria._id={$lt:requireObjectId(req.query.before)};
   const rows=await KnowledgeSource.find(criteria).select(fields).sort({_id:-1}).limit(30).lean();
   res.json({data:rows});
  });
 }
 router.post(readerPath+'/answer',asyncHandler(async(req,res)=>{
  const input=requireBody(req.body,['question']);
  const question=textField(input.question,'question',3,400);
  const words=question.match(/[\p{L}\p{N}]+/gu)??[];
  const sources=words.length?await KnowledgeSource.find({...approved(req),$text:{$search:words.join(' ')}})
   .select({title:1,text:1,reference:1,score:{$meta:'textScore'}})
   .sort({score:{$meta:'textScore'},_id:1}).limit(4).lean():[];
  const answer=await campusAnswer(question,sources,deps.config.assistantModel);
  // Revalidate after a model call so a concurrent withdrawal is respected.
  if(answer.citation && !await KnowledgeSource.exists({...approved(req),_id:answer.citation.id})){
   return res.json({data:{status:'unsupported',answer:null,citation:null}});
  }
  res.json({data:answer});
 }));
 router.get(readerPath,list(approved,publicFields));
 router.get(readerPath+'/:id',asyncHandler(async(req,res)=>{
  const row=await KnowledgeSource.findOne({...approved(req),_id:requireObjectId(req.params.id)}).select(publicFields).lean();
  if(!row)throw new HttpError(404,'SOURCE_UNAVAILABLE','Source unavailable');
  res.json({data:row});
 }));
 router.get(adminPath,list(campus,adminFields));
 router.post(adminPath,asyncHandler(async(req,res)=>{
  const input=requireBody(req.body,['clientId','title','reference','text','audience']);
  if(typeof input.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.clientId))
   throw new HttpError(422,'INVALID_REQUEST_ID','A draft identifier is required');
  if(!audiences.includes(input.audience))throw new HttpError(422,'INVALID_AUDIENCE','Choose a campus audience');
  const fields={title:textField(input.title,'title',3,160),reference:textField(input.reference,'reference',3,400),
   text:textField(input.text,'text',10,6000),audience:input.audience};
  const key={...campus(req),createdBy:req.currentUser._id,clientId:input.clientId};
  let row;
  try{row=await KnowledgeSource.findOneAndUpdate(key,{$setOnInsert:fields},{upsert:true,new:true});}
  catch(error){if(error.code!==11000)throw error;row=await KnowledgeSource.findOne(key);}
  if(!row||Object.entries(fields).some(([k,v])=>row[k]!==v))throw new HttpError(409,'DRAFT_CHANGED','Draft identifier already used');
  res.json({data:{id:row._id,status:row.status}});
 }));
 router.patch(adminPath+'/:id',asyncHandler(async(req,res)=>{
  const {status}=requireBody(req.body,['status']);
  if(!['approved','withdrawn'].includes(status))throw new HttpError(422,'INVALID_STATUS','Choose approve or withdraw');
  const key={...campus(req),_id:requireObjectId(req.params.id)};
  const approving=status==='approved';
  const result=await KnowledgeSource.updateOne({...key,status:approving?'draft':{$in:['draft','approved']}},
   {$set:{status,[approving?'approvedBy':'withdrawnBy']:req.currentUser._id,[approving?'approvedAt':'withdrawnAt']:new Date()}});
  if(!result.matchedCount&&!await KnowledgeSource.exists({...key,status}))throw new HttpError(409,'SOURCE_UNAVAILABLE','Source unavailable for this change');
  res.json({data:{status}});
 }));
 return router;
}
