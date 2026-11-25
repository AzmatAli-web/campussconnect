import {foldLine,textValue,utc} from './event-calendar.js';
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
 const midnight=Date.parse(day+'T00:00:00+05:00');
 const weekday=(new Date(day+'T00:00:00Z').getUTCDay()+6)%7+1;
 const items=[];
 for(const slot of slots){
  if(slot?.dayOfWeek!==weekday||typeof slot.startTime!=='string')continue;
  items.push({id:'class:'+slot.id+':'+day,kind:'class',
   title:slot.courseTitle||slot.courseCode||'Class',time:slot.startTime,
   start:Date.parse(day+'T'+slot.startTime+':00+05:00'),end:Date.parse(day+'T'+slot.endTime+':00+05:00'),
   detail:[slot.courseCode,slot.room].filter(Boolean).join(' · ')});
 }
 for(const event of events){
  const stamp=eventCampusStamp(event?.startsAt);
  if(event?.status!=='published'||!event.startsAt||!stamp||stamp.day>day)continue;
  const continuing=stamp.day<day;
  if(continuing && !(Date.parse(event.endsAt)>midnight))continue;
  items.push({id:'event:'+event.id,kind:'event',title:event.title||'Campus event',
   start:Math.max(midnight,Date.parse(event.startsAt)),end:Math.min(midnight+dayMs,Date.parse(event.endsAt)),
   time:continuing?'':stamp.time,detail:[continuing?'Continues from an earlier day':'',event.venue].filter(Boolean).join(' · ')});
 }
 for(const item of assignments){
  if(item?.done!==false||item.due!==day)continue;
  items.push({id:'assignment:'+item.id,kind:'assignment',title:item.title,
   time:'',detail:[item.course,item.priority+' priority'].filter(Boolean).join(' · ')});
 }
 const timed=items.filter(item=>item.end>item.start).sort((a,b)=>a.start-b.start);
 let latestEnd=null;
 for(const item of timed){
  if(latestEnd && item.start<latestEnd.end){
   item.conflict=true;
   latestEnd.conflict=true;
  }
  if(!latestEnd || item.end>latestEnd.end)latestEnd=item;
 }
 const rank={class:0,event:1,assignment:2};
 return items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')
  ||rank[a.kind]-rank[b.kind]||a.title.localeCompare(b.title));
}
export function calendarToday(now=new Date()){return todayAtCampus(now);}

export function weeklyCalendarFile(selected,slots,events,assignments,enabled,now=Date.now()){
 const dates=calendarDates('week',selected);
 if(!dates.length||dates.some(day=>!day))return null;
 const start=Date.parse(dates[0]+'T00:00:00+05:00'),end=start+7*dayMs;
 const rows=[],seen=new Set();
 function entry(id,domain,title,times,location){
  if(typeof id!=='string'||!/^[-\w]+$/.test(id)||!title)return;
  const uid=id+'@'+domain+'.campusconnect.invalid';
  if(seen.has(uid))return;
  seen.add(uid);
  rows.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+utc(now),...times,'SUMMARY:'+textValue(title),
   ...(location?['LOCATION:'+textValue(location)]:[]),'END:VEVENT');
 }
 if(enabled.class)for(const slot of slots){
  const day=dates[slot.dayOfWeek-1];
  if(!day||!slot.id)continue;
  const from=Date.parse(day+'T'+slot.startTime+':00+05:00'),to=Date.parse(day+'T'+slot.endTime+':00+05:00');
  if(to>from)entry(slot.id+'-'+day,'classes',slot.courseTitle||slot.courseCode,['DTSTART:'+utc(from),'DTEND:'+utc(to)],slot.room);
 }
 if(enabled.event)for(const event of events){
  const from=Date.parse(event.startsAt),to=Date.parse(event.endsAt);
  if(event.status==='published'&&from<end&&to>start&&to>from)
   entry(event.id,'events',event.title,['DTSTART:'+utc(from),'DTEND:'+utc(to)],event.venue);
 }
 if(enabled.assignment)for(const task of assignments){
  if(task.done===false&&dates.includes(task.due)){
   const due=dateMs(task.due);
   entry(task.id,'assignments',task.title,['DTSTART;VALUE=DATE:'+iso(due).replaceAll('-',''),
    'DTEND;VALUE=DATE:'+iso(due+dayMs).replaceAll('-','')]);
  }
 }
 if(!rows.length)return null;
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusConnect//Weekly Agenda//EN',...rows,'END:VCALENDAR'];
 return {name:'campusconnect-week-'+dates[0]+'.ics',contents:lines.map(foldLine).join('\r\n')+'\r\n'};
}
