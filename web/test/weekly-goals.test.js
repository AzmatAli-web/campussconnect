import test from 'node:test';
import assert from 'node:assert/strict';
import {goalsKey,mondayOf,thisCampusWeek,shiftWeek,goalFields,readGoals,writeGoals,goalComplete,weekProgress,MAX_WEEKLY_GOALS} from '../src/weekly-goals.js';
import {plannerKey} from '../src/assignment-planner.js';
const student={status:'active',activeRoles:['student'],_id:'a'.repeat(24),universityId:'b'.repeat(24)};
const id=i=>'12345678-1234-1234-1234-'+String(i).padStart(12,'0');
const week='2026-11-23';
const sample=(i,linked=null)=>({id:id(i),title:'Review '+i,week,assignmentId:linked,done:false});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};

test('week boundaries use Pakistan campus dates and Monday starts',()=>{
 assert.equal(thisCampusWeek(new Date('2026-11-22T18:59:59Z')),'2026-11-16');
 assert.equal(thisCampusWeek(new Date('2026-11-22T19:00:00Z')),'2026-11-23');
 assert.equal(mondayOf('2028-02-29'),'2028-02-28');
 assert.equal(shiftWeek('2026-12-28',1),'2027-01-04');
 assert.equal(shiftWeek('2026-11-23',-1),'2026-11-16');
 assert.equal(mondayOf('2027-02-29'),null);
 assert.equal(shiftWeek('2026-11-24',1),null);
});
test('goals are private by account, validated, and capped',()=>{
 const a=goalsKey(plannerKey(student));
 const b=goalsKey(plannerKey({...student,_id:'c'.repeat(24)}));
 const db=storage();
 assert.ok(a&&a!==b);
 assert.equal(writeGoals(a,[sample(1)],db),true);
 assert.equal(readGoals(b,db).length,0);
 assert.equal(readGoals(a,db)[0].title,'Review 1');
 assert.equal(readGoals(a,{getItem:()=>'{broken'}).length,0);
 assert.throws(()=>goalFields({...sample(2),title:' '}),/goal/);
 assert.throws(()=>goalFields({...sample(2),week:'2026-11-24'}),/week/);
 assert.throws(()=>goalFields({...sample(2),assignmentId:'not-id'}),/linked assignment/);
 assert.equal(writeGoals(a,Array.from({length:MAX_WEEKLY_GOALS+1},(_,i)=>sample(i)),db),false);
 assert.equal(writeGoals(a,[sample(1),sample(1)],db),false);
});
test('linked assignment completion is recalculated, manual goal status is independent',()=>{
 const assignment=id(90),manual=sample(1),linked=sample(2,assignment);
 const rows=[manual,linked];
 assert.deepEqual(weekProgress(rows,[],week),{total:2,completed:0,remaining:2,percent:0});
 assert.equal(goalComplete(linked,[{id:assignment,done:true}]),true);
 assert.deepEqual(weekProgress(rows,[{id:assignment,done:true}],week),{total:2,completed:1,remaining:1,percent:50});
 assert.equal(goalComplete(linked,[{id:assignment,done:false}]),false);
 assert.deepEqual(weekProgress([{...manual,done:true},linked],[],week),{total:2,completed:1,remaining:1,percent:50});
 assert.deepEqual(weekProgress(rows,[], '2026-11-16'),{total:0,completed:0,remaining:0,percent:0});
});
