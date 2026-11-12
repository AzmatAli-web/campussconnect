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
