// Synthetic labeled query pools after the route's campus/category/ownership filters.
// Position in a pool is recency order. Labels describe identity, independent of rank.
import assert from 'node:assert/strict';
import {rankLostFoundMatches} from '../src/services/lost-found-validation.js';
const cases=[
 ['USB drive','CS lab',[['USB stick','West gate',1],['Phone charger','CS lab',0]]],
 ['Blue bottle','Gym',[['Blue flask','Gym',1],['Red bottle','Stadium',0],['Black flask','Cafe',0]]],
 ['Student ID','Main hall',[['Identity card','Main hall',1],['Bus card','Main hall',0]]],
 ['لیپ ٹاپ','لائبریری',[['لیپ ٹاپ','گیٹ',1],['چارجر','گیٹ',0]]],
 ['ＵＳＢ stick','Library',[['usb flash','Gate',1],['Earphones','Hall',0]]],
 ['Watch','Gate',[['Bracelet','Lobby',0],['Ring','Gate',0]]],
 ['Earbuds','Hostel',[['Headphones','Dormitory',1],['Speaker','Lobby',0]]],
 ['Black notebook','Room 4',Array.from({length:6},(_,i)=>['Black notebook','Room 4',Number(i===5)])],
];
function evaluate(titleOnly){
 let hits=0,returned=0,relevant=0;
 for(const [title,location,pool] of cases){
  const source={title,locationText:titleOnly?'':location};
  const candidates=pool.map(([name,place],i)=>({_id:String(i),title:name,locationText:titleOnly?'':place}));
  const rows=rankLostFoundMatches(source,candidates);
  returned+=rows.length;
  relevant+=pool.filter(row=>row[2]).length;
  hits+=rows.filter(row=>pool[Number(row.item.id)][2]).length;
 }
 return {hits,returned,relevant,missed:relevant-hits,precision:hits/returned,recall:hits/relevant};
}
const baseline=evaluate(false),titleOnly=evaluate(true);
console.table({baseline,titleOnly});
assert.equal(baseline.relevant,7);
