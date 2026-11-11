import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('sensitive and large feature screens use route-level lazy imports',()=>{
 const source=readFileSync(new URL('../src/CampusWorkspace.jsx',import.meta.url),'utf8');
 const files=['AdminPanel','TimetablePage','AcademicResourcesPage',
   'ComplaintsPage','FeesPage','MarketplacePage','LostFoundPage','SocietiesPage'];
 for(const file of files){
  assert.ok(source.includes("lazy(()=>import('./"+file+".jsx'))"),
   file+' must be code-split and downloaded on demand');
  assert.ok(!source.includes('import '+file+' from'),
   file+' must not be eagerly loaded');
 }
 assert.match(source,/<Suspense fallback=/);
});
