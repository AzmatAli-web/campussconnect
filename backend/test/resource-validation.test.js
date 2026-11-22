import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResourceMetadata,validatePdf,safeDownloadName,
  validateResourceFilter,parseSavedResourceIds,resourceView} from '../src/services/resource-validation.js';

const meta={title:'Week 1 Lecture Notes',description:'PDF slides',
  program:'BSE',semester:'7',courseCode:'CSC494'};
test('resource metadata rejects role injection, invalid values and unknown fields',()=>{
 const valid=validateResourceMetadata(meta);
 assert.equal(valid.semester,7);
 assert.equal(valid.courseCodeKey,'CSC494');
 assert.equal(valid.programKey,'BSE');
 for(const invalid of [
  {...meta,uploadedBy:'self'},
  {...meta,semester:'99'},
  {...meta,program:'<script>'},
  {...meta,courseCode:'C$C'},
  {...meta,title:'x'},
 ]){
  assert.throws(()=>validateResourceMetadata(invalid));
 }
});
test('PDF gate checks bytes, not just the user-supplied content type',()=>{
 const fakePdf={originalname:'notes.pdf',mimetype:'application/pdf',
  buffer:Buffer.from('this is NOT PDF')};
 assert.throws(()=>validatePdf(fakePdf),/PDF/);
 const realPdf={...fakePdf,buffer:Buffer.from('%PDF-1.4\nexample fixture')};
 assert.equal(validatePdf(realPdf).length,realPdf.buffer.length);
 assert.throws(()=>validatePdf({...realPdf,originalname:'notes.exe'}),/PDF/);
 assert.throws(()=>validatePdf({...realPdf,mimetype:'image/png'}),/PDF/);
 assert.throws(()=>validatePdf({...realPdf,buffer:Buffer.alloc(8*1024*1024+1)}),/PDF/);
});
test('download filename strips traversal and control characters',()=>{
 assert.equal(safeDownloadName('..\\windows\\notes.pdf'),'notes.pdf');
 assert.equal(safeDownloadName('../../lecture.pdf'),'lecture.pdf');
 assert.equal(safeDownloadName('weird\r\nname.pdf'),'weird__name.pdf');
 assert.equal(safeDownloadName('javascript.html'),'campus-notes.pdf');
});
test('catalog filter validates limit/cohort and does not accept uploader IDs',()=>{
 const {filter,limit}=validateResourceFilter({program:'bse',semester:'7',courseCode:'csc494',limit:'20'});
 assert.deepEqual(filter,{programKey:'BSE',semester:7,courseCodeKey:'CSC494'});
 assert.equal(limit,20);
 assert.throws(()=>validateResourceFilter({limit:'1000'}));
 assert.throws(()=>validateResourceFilter({uploadedBy:'secret-id'}));
});
test('catalog strips file storage key and uploader identity',()=>{
 const view=resourceView({_id:'test',title:'Lecture',description:'',
   program:'BSE',semester:7,courseCode:'CSC494',fileName:'a.pdf',
   sizeBytes:100,status:'published',createdAt:new Date(),
   storageKey:'private.pdf',uploadedBy:'hidden'});
 assert.equal(view.id,'test');
 assert.equal(Object.hasOwn(view,'storageKey'),false);
 assert.equal(Object.hasOwn(view,'uploadedBy'),false);
});

test('saved resource lookup accepts only a bounded ordered list of exact IDs',()=>{
 const a='a'.repeat(24),b='b'.repeat(24);
 assert.deepEqual(parseSavedResourceIds({ids:[b,a,b].join(',')}),[b,a]);
 for(const query of [{},{ids:[a,b]},{ids:a,universityId:b},{ids:a+','},{ids:'wrong'},
  {ids:Array.from({length:51},()=>a).join(',')}]){
  assert.throws(()=>parseSavedResourceIds(query),{code:'INVALID_SAVED_RESOURCE_IDS'});
 }
});

test('keyword search validates length and escapes Mongo regex metacharacters',()=>{
 const result=validateResourceFilter({q:'CS.C*',semester:'7',limit:'12'});
 assert.equal(result.limit,12);
 assert.equal(result.filter.semester,7);
 assert.deepEqual(result.filter.$or.map(x=>Object.values(x)[0].$options),['i','i','i']);
 assert.equal(result.filter.$or[0].title.$regex,'CS\\.C\\*');
 for(const q of ['', 'x', 'x'.repeat(65), '\\n', ['CSC494']]){
  assert.throws(()=>validateResourceFilter({q}),{code:'INVALID_RESOURCE_FILTER'});
 }
});
