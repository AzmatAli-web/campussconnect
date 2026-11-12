import {readdirSync,readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';

const assets=resolve('dist/assets');
const files=readdirSync(assets).filter(file=>file.endsWith('.js'));
const featureModules=['AdminPanel','TimetablePage','AcademicResourcesPage',
  'ComplaintsPage','FeesPage','MarketplacePage','LostFoundPage','SocietiesPage','NotificationsPage'];
const missing=featureModules.filter(name=>
  !files.some(file=>file.startsWith(name+'-'))
);
if(missing.length){
 console.error('Missing independent lazy-loaded feature chunks:',missing.join(', '));
 process.exitCode=1;
}else{
 console.log('Lazy-loaded feature chunks verified:',featureModules.join(', '));
}
const totals=files.reduce((acc,file)=>{
 const contents=readFileSync(join(assets,file));
 acc.raw+=contents.length;
 acc.gzip+=gzipSync(contents).length;
 return acc;
},{raw:0,gzip:0});
console.log('Build JS asset count:',files.length);
console.log('All JS chunks combined:',Math.round(totals.raw/1024)+' KiB raw / '+
  Math.round(totals.gzip/1024)+' KiB gzipped (total, not initial download)');


// Milestone 25: explicitly report the initial JS entry size separately from
// all lazily loaded feature chunks. Combined size is not initial download.
const sizes=files.map(file=>{
 const buffer=readFileSync(join(assets,file));
 return {file,raw:buffer.length,gzip:gzipSync(buffer).length};
});
const entry=sizes.filter(x=>/^index-[^/]+\.js$/.test(x.file));
if(entry.length!==1){
 console.error('Expected exactly one hashed Vite index entry, found',entry.length);
 process.exitCode=1;
}else{
 const kb=entry[0].gzip/1024;
 console.log('Initial application entry JS:',kb.toFixed(1)+' KiB gzip');
 const budget=Number(process.env.QA25_ENTRY_GZIP_BUDGET_KIB||0);
 if(budget>0&&kb>budget){
  console.error('Entry JS gzip budget exceeded:',kb.toFixed(1),'KiB >',budget,'KiB');
  process.exitCode=1;
 }
}
console.log('Largest JS chunks (gzipped):');
for(const item of sizes.sort((a,b)=>b.gzip-a.gzip).slice(0,6)){
 console.log(' ',item.file,(item.gzip/1024).toFixed(1)+' KiB');
}
