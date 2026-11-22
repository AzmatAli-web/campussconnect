import assert from 'node:assert/strict';
import {test} from 'node:test';
import {groupCourseResources,cleanResourceSearch} from '../src/resource-discovery.js';
test('resource course groups are separated and stable, independent of input order',()=>{
 const input=[
  {id:'1',program:'BSE',semester:7,courseCode:'CSC494'},
  {id:'2',program:'BSE',semester:5,courseCode:'CSC322'},
  {id:'3',program:'BSE',semester:7,courseCode:'CSC494'}
 ];
 const groups=groupCourseResources(input);
 assert.deepEqual(groups.map(x=>[x.semester,x.course,x.items.length]),[[5,'CSC322',1],[7,'CSC494',2]]);
 assert.deepEqual(groups[1].items.map(x=>x.id),['1','3']);
});
test('resource search cleans fields and enforces bounded keyword length',()=>{
 assert.deepEqual(cleanResourceSearch({q:'  Operating Systems  ',program:' BSE ',semester:'7',courseCode:' CSC322 '}),
  {program:'BSE',semester:'7',courseCode:'CSC322',q:'Operating Systems'});
 assert.deepEqual(cleanResourceSearch({q:'  '}),{});
 assert.throws(()=>cleanResourceSearch({q:'x'}),/2–64/);
 assert.throws(()=>cleanResourceSearch({q:'x'.repeat(65)}),/2–64/);
});
