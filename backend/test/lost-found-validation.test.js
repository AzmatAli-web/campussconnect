import test from 'node:test';
import assert from 'node:assert/strict';
import {
 lostFoundCreate,lostFoundPatch,lostFoundFilter,lostFoundModeration,lostFoundView
} from '../src/services/lost-found-validation.js';

const item={
 kind:'lost',title:'Missing student ID card',
 description:'I misplaced a campus card near the engineering building entrance.',
 category:'documents',locationText:'Engineering building entrance',
 contactPreference:'adminMediated'
};
test('lost/found accepts valid report and rejects client-owned identities',()=>{
 assert.deepEqual(lostFoundCreate(item),item);
 for(const bad of [
  {...item,reporterId:'injected'},
  {...item,universityId:'injected'},
  {...item,status:'removed'},
  {...item,email:'private@example.com'},
  {...item,kind:'stolen'},
  {...item,contactPreference:'publicPhone'},
  {...item,description:'too short'},
  {...item,title:''},
  {...item,images:['public-file']}
 ])assert.throws(()=>lostFoundCreate(bad));
});
test('lost/found patch requires a safe change and permits resolved status only',()=>{
 assert.deepEqual(lostFoundPatch({status:'resolved'}),{status:'resolved'});
 assert.deepEqual(lostFoundPatch({title:'Recovered student card'}),{title:'Recovered student card'});
 for(const bad of [{},{status:'removed'},{status:'open'},
  {reporterId:'another-student'},{contactPreference:'publicEmail'}])
  assert.throws(()=>lostFoundPatch(bad));
});
test('safe filter escapes literal regex and rejects unsupported fields',()=>{
 const f=lostFoundFilter({kind:'lost',category:'documents',q:'ID.*'});
 assert.equal(f.filter.kind,'lost');
 assert.equal(f.filter.category,'documents');
 assert.ok(f.filter.$or[0].title.$regex.includes('\\.'));
 for(const bad of [{q:'a'},{kind:'all'},{page:'0'},{reporterId:'123'}])
  assert.throws(()=>lostFoundFilter(bad));
});
test('Admin moderation requires reason, response redacts reporter identity',()=>{
 assert.deepEqual(lostFoundModeration({action:'remove',reason:'Unsafe or misleading public report'}),{
  action:'remove',reason:'Unsafe or misleading public report'
 });
 assert.throws(()=>lostFoundModeration({action:'remove',reason:'x'}));
 const result=lostFoundView({
  _id:'mock',...item,status:'open',
  reporterId:'secret',universityId:'secret',
  removedBy:'secret',removalReason:'secret',
  emailNormalized:'secret@example.com',createdAt:new Date()
 });
 assert.equal(result.title,item.title);
 for(const key of ['reporterId','universityId','removedBy','removalReason','emailNormalized'])
  assert.equal(Object.hasOwn(result,key),false);
});
