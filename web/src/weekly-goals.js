import {todayAtCampus} from './assignment-planner.js';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const validWeek=/^20\d\d-\d\d-\d\d$/;
export const MAX_WEEKLY_GOALS=12;
export const MAX_STORED_GOALS=120;

export function goalsKey(assignmentKey) {
 if(typeof assignmentKey!=='string'||!assignmentKey.includes(':assignment-planner:'))return null;
 return assignmentKey.replace(':assignment-planner:',':weekly-goals:');
}
export function mondayOf(date) {
 if(typeof date!=='string'||!validWeek.test(date))return null;
 const day=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)return null;
 const offset=(day.getUTCDay()+6)%7;
 day.setUTCDate(day.getUTCDate()-offset);
 return day.toISOString().slice(0,10);
}
export function thisCampusWeek(now=new Date()) {
 return mondayOf(todayAtCampus(now));
}
export function shiftWeek(week,delta) {
 const start=mondayOf(week);
 if(start!==week||!Number.isInteger(delta)||Math.abs(delta)>52)return null;
 const day=new Date(week+'T00:00:00Z');
 day.setUTCDate(day.getUTCDate()+delta*7);
 const date=day.toISOString().slice(0,10);
 return date.startsWith('20')?date:null;
}
export function goalFields(value) {
 const title=typeof value?.title==='string'?value.title.trim():'';
 const week=mondayOf(value?.week);
 const assignmentId=value?.assignmentId??null;
 if(!title||title.length>100)throw Error('Enter a goal of 1 to 100 characters.');
 if(!week||week!==value.week)throw Error('Choose a valid campus week.');
 if(assignmentId!==null&&(typeof assignmentId!=='string'||!uuid.test(assignmentId)))throw Error('Choose a valid linked assignment.');
 return {title,week,assignmentId};
}
function validRows(rows) {
 if(!Array.isArray(rows))return [];
 const result=[],ids=new Set();
 for(const item of rows){
  if(result.length>=MAX_STORED_GOALS)break;
  if(typeof item?.id!=='string'||!uuid.test(item.id)||ids.has(item.id)||typeof item.done!=='boolean')continue;
  try {result.push({id:item.id,...goalFields(item),done:item.done});ids.add(item.id);}catch{/* invalid local entry */}
 }
 return result;
}
export function readGoals(key,storage) {
 if(!key)return [];
 try{return validRows(JSON.parse((storage??globalThis.localStorage)?.getItem(key)??'[]'));}
 catch{return [];}
}
export function writeGoals(key,rows,storage) {
 if(!key||!Array.isArray(rows)||rows.length>MAX_STORED_GOALS)return false;
 const clean=validRows(rows);
 if(clean.length!==rows.length||new Set(rows.map(x=>x.id)).size!==rows.length)return false;
 if(new Set(rows.map(x=>x.week)).size>52)return false;
 const countByWeek={};
 for(const row of clean){countByWeek[row.week]=(countByWeek[row.week]??0)+1;if(countByWeek[row.week]>MAX_WEEKLY_GOALS)return false;}
 try{(storage??globalThis.localStorage).setItem(key,JSON.stringify(clean));return true;}
 catch{return false;}
}
export function goalComplete(goal,assignments) {
 if(!goal.assignmentId)return goal.done;
 return assignments.some(assignment=>assignment.id===goal.assignmentId&&assignment.done===true);
}
export function weekProgress(goals,assignments,week) {
 const visible=goals.filter(goal=>goal.week===week);
 const completed=visible.filter(goal=>goalComplete(goal,assignments)).length;
 return {total:visible.length,completed,remaining:visible.length-completed,
  percent:visible.length?Math.round(100*completed/visible.length):0};
}
