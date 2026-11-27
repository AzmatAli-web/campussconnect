import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createApp} from '../src/app.js';
import {KnowledgeSource} from '../src/models/knowledge-source.js';
import {User} from '../src/models/user.js';
import {cases,sources} from '../qa/campus-assistant-cases.js';

const model=process.env.CAMPUS_ASSISTANT_MODEL?.trim()||'';
const campus=new mongoose.Types.ObjectId(),other=new mongoose.Types.ObjectId();
const email='pilot-reader@example.test';
const server=await MongoMemoryServer.create({binary:{version:process.env.MONGOMS_VERSION||'7.0.24'}});
try{
 await mongoose.connect(server.getUri());
 await KnowledgeSource.createIndexes();
 const user=await User.create({universityId:campus,firebaseUid:'reader',emailNormalized:email,fullName:'Pilot Reader',
  requestedRole:'student',activeRoles:['student'],status:'active'});
 const entries=new Map();
 for(const [key,title,text,reference,audience='campus',status='approved',tenant] of sources){
  const row=await KnowledgeSource.create({universityId:tenant==='other'?other:campus,createdBy:user._id,clientId:randomUUID(),title,text,reference,audience,status});
  entries.set(key,row);
 }
 const firebaseAuth={async verifyIdToken(token){
  if(token!=='pilot-reader')throw new Error('Unknown fixture');
  return {uid:'reader',email,email_verified:true};
 }};
 const app=createApp({firebaseAuth,config:{universityId:String(campus),nodeEnv:'test',domains:['example.test'],assistantModel:model}});
 const base='/api/v1/knowledge-sources',auth={Authorization:'Bearer pilot-reader'};
 const results=[];
 for(const item of cases){
  const expected=entries.get(item.expected);
  const response=await request(app).post(base+'/answer').set(auth).send({question:item.question});
  const data=response.body.data;
  let citationCorrect=false;
  if(data?.citation?.id){
   const citation=await request(app).get(base+'/'+data.citation.id).set(auth);
   citationCorrect=Boolean(expected && citation.status===200 && citation.body.data._id===String(expected._id)
    && data.citation.reference===expected.reference && data.citation.title===expected.title);
  }
  const relevant=Boolean(expected && data?.status==='answered' && data.answer===expected.text);
  const abstained=response.status===200 && data?.status==='unsupported' && data.answer===null && data.citation===null;
  results.push({case:item.key,group:item.group,http:response.status,outcome:data?.status??'error',
   expected:expected?'answered':'unsupported',relevant,citationCorrect,abstained});
 }
 const rate=(set,field)=>({correct:set.filter(row=>row[field]).length,total:set.length});
 const answerable=results.filter(row=>row.expected==='answered');
 const negative=results.filter(row=>row.expected==='unsupported');
 const report={model:model||null,results,relevance:rate(answerable,'relevant'),
  citations:rate(answerable,'citationCorrect'),abstention:rate(negative,'abstained'),
  visibility:rate(results.filter(row=>row.group==='visibility'),'abstained')};
 console.log(JSON.stringify(report));
 if(process.env.ASSISTANT_EVAL_OUTPUT)await writeFile(process.env.ASSISTANT_EVAL_OUTPUT,JSON.stringify(report,null,2)+'\n');
 // FAQ-only mode intentionally abstains on paraphrases; report their true quality score above.
 const failed=results.filter(row=>row.expected==='unsupported'||(!model && row.group==='paraphrase')?
  !row.abstained:!(row.relevant&&row.citationCorrect));
 if(failed.length){console.error('Unmet cases:',failed.map(row=>row.case).join(', '));process.exitCode=1;}
}finally{await mongoose.disconnect();await server.stop();}
