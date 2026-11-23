import {todayAtCampus} from './assignment-planner.js';

const datePattern=/^20\d\d-\d\d-\d\d$/;
const dayMs=86400000;
function dateMs(value){
 if(typeof value!=='string'||!datePattern.test(value))return NaN;
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value)return NaN;
 return date.valueOf();
}
const iso=ms=>new Date(ms).toISOString().slice(0,10);
export function addCampusDays(value,days){
 const start=dateMs(value);
 if(!Number.isFinite(start)||!Number.isInteger(days)||Math.abs(days)>370)return null;
 const result=iso(start+days*dayMs);
 return result.startsWith('20')?result:null;
}
export function campusWeekStart(value){
 const ms=dateMs(value);
 if(!Number.isFinite(ms))return null;
 return addCampusDays(value,-((new Date(ms).getUTCDay()+6)%7));
}
export function campusMonthStart(value){
 return Number.isFinite(dateMs(value))?value.slice(0,7)+'-01':null;
}
export function calendarDates(view,anchor){
 if(!['week','month'].includes(view)||!Number.isFinite(dateMs(anchor)))return [];
 const start=campusWeekStart(view==='month'?campusMonthStart(anchor):anchor);
 return Array.from({length:view==='month'?42:7},(_,i)=>addCampusDays(start,i));
}
export function moveCalendar(view,anchor,direction){
 if(![-1,1].includes(direction)||!Number.isFinite(dateMs(anchor)))return null;
 if(view==='week')return addCampusDays(anchor,direction*7);
 if(view!=='month')return null;
 const year=Number(anchor.slice(0,4)),month=Number(anchor.slice(5,7));
 const result=new Date(Date.UTC(year,month-1+direction,1)).toISOString().slice(0,10);
 return result.startsWith('20')?result:null;
}
const eventClock=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
export function eventCampusStamp(value){
 const date=new Date(value);
 if(!Number.isFinite(date.valueOf()))return null;
 const parts=Object.fromEntries(eventClock.formatToParts(date).map(({type,value})=>[type,value]));
 return {day:[parts.year,parts.month,parts.day].join('-'),time:parts.hour+':'+parts.minute};
}
export function itemsOnCampusDay(day,{slots=[],events=[],assignments=[]}={}){
 if(!Number.isFinite(dateMs(day)))return [];
 const weekday=(new Date(day+'T00:00:00Z').getUTCDay()+6)%7+1;
 const items=[];
 for(const slot of slots){
  if(slot?.dayOfWeek!==weekday||typeof slot.startTime!=='string')continue;
  items.push({id:'class:'+slot.id+':'+day,kind:'class',
   title:slot.courseTitle||slot.courseCode||'Class',time:slot.startTime,
   detail:[slot.courseCode,slot.room].filter(Boolean).join(' · ')});
 }
 for(const event of events){
  const stamp=eventCampusStamp(event?.startsAt);
  if(event?.status!=='published'||!stamp||stamp.day!==day)continue;
  items.push({id:'event:'+event.id,kind:'event',title:event.title||'Campus event',
   time:stamp.time,detail:event.venue||''});
 }
 for(const item of assignments){
  if(item?.done!==false||item.due!==day)continue;
  items.push({id:'assignment:'+item.id,kind:'assignment',title:item.title,
   time:'',detail:[item.course,item.priority+' priority'].filter(Boolean).join(' · ')});
 }
 const rank={class:0,event:1,assignment:2};
 return items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')
  ||rank[a.kind]-rank[b.kind]||a.title.localeCompare(b.title));
}
export function calendarToday(now=new Date()){return todayAtCampus(now);}
