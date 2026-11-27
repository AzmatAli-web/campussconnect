import test from 'node:test';
import assert from 'node:assert/strict';
import {campusAnswer} from '../src/services/campus-answer.js';
const source={_id:'fixture',title:'Office hours',reference:'Handbook p. 2',text:'The office opens at nine.\n\nBring your campus card.'};
test('model selection yields only the stored passage and its citation',async()=>{
 const reply=async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  assert.equal(JSON.parse(options.body).stream,false);
  return Response.json({message:{content:'{"index":1,"answer":"invented"}'}});
 };
 const result=await campusAnswer('What should I bring?',[source],'test',reply);
 assert.equal(result.answer,'Bring your campus card.');
 assert.equal(result.citation.reference,source.reference);
});
test('unsupported, invalid or conflicting evidence produces no answer',async()=>{
 for(const index of [-1,99,'0']){
  const result=await campusAnswer('What should I bring?',[source],'test',async()=>Response.json({message:{content:JSON.stringify({index})}}));
  assert.equal(result.citation,null);
 }
 const faq={...source,title:'When does the office open?'};
 assert.equal((await campusAnswer(faq.title,[faq,{...faq,text:'At noon.'}])).status,'unsupported');
 await assert.rejects(campusAnswer('Office hours?',[source],'test',async()=>Response.error()),{status:503});
});
