import {downloadCalendarFile} from './event-calendar.js';
import React,{useEffect,useMemo,useState} from 'react';
import {readAssignments} from './assignment-planner.js';
import {chooseTimetableGroup,readTimetablePreference} from './timetable-preference.js';
import {freeWindows,overlapDetails,conflictSummary,durationLabel,calendarDates,weeklyCalendarFile,moveCalendar,itemsOnCampusDay,calendarToday} from './campus-calendar.js';
import './campus-calendar.css';

const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const labels={class:'Class',event:'Campus event',assignment:'Personal deadline'};
const monthName=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const dateName=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const campusClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const clock=time=>campusClock.format(time);
function displayDate(date,format){
 return format.format(new Date(date+'T00:00:00Z'));
}
async function currentCampusRows(call,preferenceKey,day){
 const groups=await call('/timetable/groups');
 if(!Array.isArray(groups))throw new Error('Invalid timetable groups');
 const group=chooseTimetableGroup(groups,readTimetablePreference(preferenceKey));
 const slots=group?await call('/timetable/slots?'+new URLSearchParams({
  term:group.term,program:group.program,semester:String(group.semester),section:group.section
 })): [];
 if(!Array.isArray(slots))throw new Error('Invalid timetable');
 const days=calendarDates('week',day),events=[];
 for(let page=1;;page++){
  const rows=await call('/events?'+new URLSearchParams({from:days[0],to:days[6],when:'all',limit:'100',page:String(page)}));
  if(!Array.isArray(rows))throw new Error('Invalid events');
  events.push(...rows);
  if(rows.length<100)break;
 }
 return itemsOnCampusDay(day,{slots,events});
}
export default function CampusCalendar({call,assignmentKey,preferenceKey}){
 const [detailKey,setDetailKey]=useState(null);
 const [today,setToday]=useState(calendarToday);
 const [view,setView]=useState('month');
 const [anchor,setAnchor]=useState(calendarToday);
 const [selected,setSelected]=useState(calendarToday);
 const [tasks,setTasks]=useState(()=>readAssignments(assignmentKey));
 const [results,setResults]=useState({loading:true,slots:[],group:null,errors:[]});
 const dates=useMemo(()=>calendarDates(view,anchor),[view,anchor]);
 const from=dates[0],to=dates.at(-1);
 const [eventFeed,setEventFeed]=useState(null);
 const [reload,setReload]=useState(0);
 const [conflictsOnly,setConflictsOnly]=useState(false);
 const [enabled,setEnabled]=useState({class:true,event:true,assignment:true});
 useEffect(()=>{
  const sync=event=>{
   if(event.key===null||event.key===assignmentKey)setTasks(readAssignments(assignmentKey));
   if(event.key===null||event.key===preferenceKey)setReload(n=>n+1);
  };
  const focus=()=>{setToday(calendarToday());sync({key:null});};
  const timer=window.setInterval(()=>setToday(calendarToday()),30_000);
  window.addEventListener('storage',sync);window.addEventListener('focus',focus);
  return()=>{window.clearInterval(timer);window.removeEventListener('storage',sync);window.removeEventListener('focus',focus);};
 },[assignmentKey,preferenceKey]);
 useEffect(()=>{
  let current=true;
  setResults(previous=>({...previous,loading:true,errors:[]}));
  (async()=>{
   const [groupsResult]=await Promise.allSettled([call('/timetable/groups')]);
   if(!current)return;
   const errors=[];
   const groups=groupsResult.status==='fulfilled'&&Array.isArray(groupsResult.value)?groupsResult.value:[];
   if(groupsResult.status!=='fulfilled')errors.push('Academic timetable groups could not be loaded.');
   const group=chooseTimetableGroup(groups,readTimetablePreference(preferenceKey));
   let slots=[];
   if(group){
    const params=new URLSearchParams({
     term:group.term,program:group.program,semester:String(group.semester),section:group.section
    });
    try{
     const response=await call('/timetable/slots?'+params.toString());
     if(!current)return;
     if(!Array.isArray(response))throw new Error('Invalid timetable response');
     slots=response;
    }catch{if(current)errors.push('Classes for the selected timetable could not be loaded.');}
   }
   if(current)setResults({loading:false,slots,group,errors});
  })();
  return()=>{current=false;};
 },[call,preferenceKey,reload]);
 useEffect(()=>{
  let current=true;
  (async()=>{
   const events=new Map();
   try{
    for(let page=1;current;page++){
     const params=new URLSearchParams({from,to,when:'all',limit:'100',page:String(page)});
     const rows=await call('/events?'+params);
     if(!current)return;
     if(!Array.isArray(rows))throw new Error('Invalid events response');
     for(const row of rows)events.set(row.id,row);
     if(rows.length<100)break;
    }
    if(current)setEventFeed({from,to,reload,rows:[...events.values()]});
   }catch{if(current)setEventFeed({from,to,reload,rows:[],error:true});}
  })();
  return()=>{current=false;};
 },[call,from,to,reload]);
 const matching=eventFeed?.from===from&&eventFeed?.to===to&&eventFeed?.reload===reload?eventFeed:null;
 const agenda=useMemo(()=>{
  const catalog={slots:enabled.class?results.slots:[],events:enabled.event?(matching?.rows??[]):[],assignments:enabled.assignment?tasks:[]};
  return new Map(dates.map(date=>[date,itemsOnCampusDay(date,catalog)]));
 },[dates,results.slots,matching,tasks,enabled]);
 const weeklyFile=useMemo(()=>{
  if(results.loading||results.errors.length||!matching||matching.error)return null;
  return weeklyCalendarFile(selected,results.slots,matching.rows,tasks,enabled);
 },[selected,results,matching,tasks,enabled]);
 const ready=!results.loading && !results.errors.length && matching && !matching.error;
 const conflictDays=dates.filter(day=>agenda.get(day)?.some(item=>item.conflict));
 const weeklyCount=calendarDates('week',selected).filter(day=>conflictDays.includes(day)).length;
 const nextConflict=conflictDays.find(day=>day>selected)??conflictDays.find(day=>day!==selected);
 const previousConflict=conflictDays.findLast(day=>day<selected)??conflictDays.findLast(day=>day!==selected);
 const dayRows=agenda.get(selected)??[];
 const daySummary=conflictSummary(dayRows);
 const weeklyDuration=calendarDates('week',selected).reduce((total,day)=>total+conflictSummary(agenda.get(day)??[]).duration,0);
 const activeAgenda=(agenda.get(selected)??[]).filter(item=>!conflictsOnly||item.conflict);
 function jump(day){
  if(day>='2001-01-01'&&day<='2098-12-31'&&calendarDates('week',day).length){setSelected(day);setAnchor(day);}
 }
 function navigate(direction){
  const next=moveCalendar(view,anchor,direction);
  if(next){setAnchor(next);setSelected(next);}
 }
 function todayClick(){
  const now=calendarToday();setToday(now);setAnchor(now);setSelected(now);
 }
 const periodLabel=view==='month'?displayDate(anchor,monthName):
   displayDate(dates[0]??anchor,dateName)+' – '+displayDate(dates[6]??anchor,dateName);
 return <div className="wc-stack wc-calendar">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">MY CAMPUS SCHEDULE</span>
    <h2>Unified campus calendar</h2>
    <p>Published classes and events, plus your personal unfinished deadlines. All dates and class times use Pakistan Standard Time (PKT).</p>
   </div></div>
   <div className="wc-calendar-toolbar">
    <div role="group" aria-label="Calendar view">
     <button type="button" className="wc-outline" aria-pressed={view==='week'} onClick={()=>{setAnchor(selected);setView('week');}}>Week</button>
     <button type="button" className="wc-outline" aria-pressed={view==='month'} onClick={()=>setView('month')}>Month</button>
    </div>
    <div>
     <button type="button" className="wc-outline" onClick={()=>navigate(-1)}>Previous {view}</button>
     <strong aria-live="polite">{periodLabel}</strong>
     <button type="button" className="wc-outline" onClick={()=>navigate(1)}>Next {view}</button>
     <button type="button" className="wc-outline" onClick={todayClick}>Today</button>
     <button type="button" className="wc-outline" disabled={!weeklyFile} onClick={()=>downloadCalendarFile(weeklyFile)}>Export selected week (.ics)</button>
     <button type="button" className="wc-outline" onClick={()=>setReload(n=>n+1)}>Refresh schedule</button>
    </div>
   </div>
   <div className="wc-calendar-legend" role="group" aria-label="Calendar categories">
    {Object.entries(labels).map(([key,label])=><label key={key}>
     <input type="checkbox" checked={enabled[key]} onChange={event=>setEnabled(current=>({...current,[key]:event.target.checked}))}/>
     {' '+label}</label>)}
   </div>
   <div className="wc-calendar-toolbar">
    <label>Jump to date <input type="date" min="2001-01-01" max="2098-12-31" value={selected} onChange={event=>jump(event.target.value)}/></label>
    <label><input type="checkbox" checked={conflictsOnly} onChange={event=>setConflictsOnly(event.target.checked)}/> Show conflicts only in agenda</label>
    <button className="wc-outline" disabled={!ready||!previousConflict} onClick={()=>setSelected(previousConflict)}>Previous conflict day</button>
    <button className="wc-outline" disabled={!ready||!nextConflict} onClick={()=>setSelected(nextConflict)}>Next conflict day</button>
   </div>
   {ready&&<p role="status">Days with scheduling conflicts this week: {weeklyCount}</p>}
   {(results.loading||!matching)&&<p role="status">Loading published campus calendar…</p>}
   {ready&&<p>Time with overlapping items this week: {durationLabel(weeklyDuration)}</p>}
   {results.errors.map(error=><p role="alert" key={error}>{error}</p>)}
   {matching?.error&&<p role="alert">Published events could not be loaded.</p>}
   {!results.loading&&!results.group&&!results.errors.some(x=>x.includes('timetable'))&&
    <p className="wc-resource-muted">No timetable group has been published. Class dates will appear when one is available.</p>}
   {results.group&&<p className="wc-resource-muted">Class group: {results.group.program} · Semester {results.group.semester} · Section {results.group.section}. Change it on the Timetable page.</p>}
   <div className="wc-calendar-weekdays" aria-hidden="true">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
   <div className="wc-calendar-grid" role="group" aria-label={view==='month'?'Month dates':'Week dates'}>
    {dates.map(date=>{
     const count={class:0,event:0,assignment:0};
     for(const item of agenda.get(date)??[])count[item.kind]++;
     const outside=view==='month'&&date.slice(0,7)!==anchor.slice(0,7);
     return <button type="button" key={date}
      className={'wc-calendar-day'+(outside?' outside':'')+(date===selected?' selected':'')+(date===today?' today':'')}
      aria-pressed={date===selected} aria-label={displayDate(date,dateName)+(conflictDays.includes(date)?', scheduling conflict':'')}
      onClick={()=>setSelected(date)}>
      <span className="wc-calendar-number">{Number(date.slice(-2))}</span>
      {conflictDays.includes(date)&&<span className="wc-calendar-clash">Conflict</span>}
      <span className="wc-calendar-counts">
       {Object.entries(count).filter(([,n])=>n>0).map(([kind,n])=>
        <span className={'wc-calendar-count '+kind} key={kind}>{n} {labels[kind]}</span>)}
      </span>
     </button>;
    })}
   </div>
  </section>
  {ready&&<FreeTimeFinder verifyDay={day=>currentCampusRows(call,preferenceKey,day)} storageKey={assignmentKey && assignmentKey+":study-blocks"} selected={selected} slots={results.slots} events={matching.rows} onSelect={setSelected}/>}
  <section className="wc-panel" aria-label="Selected day agenda">
   <div className="wc-head"><div><span className="wc-kicker">DAY AGENDA</span>
    <h2>{displayDate(selected,dateName)}</h2><p>Personal deadlines do not represent official faculty submissions.</p></div></div>
   {ready&&<p>Time with overlapping items: {durationLabel(daySummary.duration)} · Peak simultaneous items: {daySummary.peak}</p>}
   {activeAgenda.length===0?<p>No matching calendar items on this date.</p>:
    <ul className="wc-calendar-agenda">{activeAgenda.map(item=><li key={item.id}>
     <span className={'wc-tag '+(item.kind==='assignment'?'warn':item.kind==='class'?'blue':'good')}>{labels[item.kind]}</span>
     <strong>{item.title}</strong>{item.conflict&&<small>Scheduling conflict</small>}<small>{item.time?item.time+' PKT · ':''}{item.detail}</small>
     {item.conflict&&<div>
      <button type="button" className="wc-outline" aria-expanded={detailKey===selected+item.id}
       onClick={()=>setDetailKey(detailKey===selected+item.id?null:selected+item.id)}>Conflict details</button>
      {detailKey===selected+item.id&&<ul>{overlapDetails(item,dayRows).map((pair,index)=><li key={index}>
       {labels[pair.kind]} · {pair.title} · {clock(pair.start)}–{clock(pair.end)} PKT · {durationLabel(pair.end-pair.start)}
      </li>)}</ul>}
     </div>}
    </li>)}</ul>}
  </section>
 </div>;
}

function FreeTimeFinder({verifyDay,storageKey,selected,slots,events,onSelect}){
 const [blocks,setBlocks]=useState([]);
 const [editing,setEditing]=useState(null);
 const [moving,setMoving]=useState(false);
 const [topic,setTopic]=useState('');
 const [minutes,setMinutes]=useState(30);
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  function load(){
   try{setBlocks(readBlocks(storageKey));setLoaded(true);setError('');}
   catch{setLoaded(false);setError('Saved study blocks could not be loaded.');}
  }
  load();
  const sync=e=>{if(!e.key||e.key===storageKey)load();};
  window.addEventListener('storage',sync);
  return ()=>window.removeEventListener('storage',sync);
 },[storageKey]);
 async function move(original,gap){
  setMoving(true);
  try{
   const rows=await verifyDay(gap.day);
   const end=gap.start+original.end-original.start;
   const commit=()=>{
    const current=readBlocks(storageKey);
    const source=current.find(row=>row.id===original.id);
    setBlocks(current);
    if(!source||source.start!==original.start||source.end!==original.end||source.title!==original.title)
     throw new Error('The original block changed. Reopen it to reschedule.');
    if([...rows,...current.filter(row=>row.id!==source.id)].some(row=>row.start<end&&row.end>gap.start))
     throw new Error('The new time is occupied. Choose another gap.');
    const next=current.map(row=>row.id===source.id?{...row,start:gap.start,end}:row);
    localStorage.setItem(storageKey,JSON.stringify(next));
    setBlocks(next);setError('');setEditing(null);
   };
   if(navigator.locks)await navigator.locks.request(storageKey,commit);else commit();
  }catch(err){setError(err.message||'Could not reschedule the study block.');}
  finally{setMoving(false);}
 }
 async function change(block,remove=false){
  const save=()=>{
   const current=readBlocks(storageKey);
   if(!remove&&current.some(row=>row.start<block.end&&row.end>block.start)){
    setBlocks(current);setError('This time is already reserved. Choose another gap.');return;
   }
   const next=remove?current.filter(row=>row.id!==block.id):[...current,block];
   localStorage.setItem(storageKey,JSON.stringify(next));
   setBlocks(next);setError('');
  };
  try{if(navigator.locks)await navigator.locks.request(storageKey,save);else save();}
  catch{setError('Study blocks could not be saved on this device.');}
 }
 const [minimum,setMinimum]=useState(30);
 const [period,setPeriod]=useState('08-18');
 const week=calendarDates('week',selected);
 const [from,to]=period.split('-');
 const gaps=week.flatMap(day=>{
  const rows=itemsOnCampusDay(day,{slots,events});
  return freeWindows([...rows,...blocks],Date.parse(day+'T'+from+':00:00+05:00'),
   Date.parse(day+'T'+to+':00:00+05:00'),minimum).map(gap=>({...gap,day}));
 });
 const today=gaps.filter(gap=>gap.day===selected);
 const total=gaps.reduce((sum,gap)=>sum+gap.end-gap.start,0);
 const longest=gaps.reduce((best,gap)=>!best||gap.end-gap.start>best.end-best.start?gap:best,null);
 const weekStart=Date.parse(week[0]+'T00:00:00+05:00');
 const scheduled=blocks.filter(block=>block.start>=weekStart&&block.start<weekStart+7*86400000).sort((a,b)=>a.start-b.start);
 const next=gaps.find(gap=>gap.day>selected);
 return <section className="wc-panel" aria-label="Free-time finder">
  <h2>Free-time finder</h2>
  <p>Based on your timetable and published campus events. All times are in PKT.</p>
  <div className="wc-calendar-toolbar">
   <label>Minimum gap <select value={minimum} onChange={e=>setMinimum(Number(e.target.value))}>
    {[15,30,60,90].map(n=><option key={n} value={n}>{n} minutes</option>)}
   </select></label>
   <label>Search hours <select value={period} onChange={e=>setPeriod(e.target.value)}>
    {['08-18','08-12','12-18'].map(value=><option key={value} value={value}>{value.replace('-','–')+' PKT'}</option>)}
   </select></label>
  </div>
  {error&&<p role="alert">{error}</p>}
  {loaded&&<>
  <h3>Schedule a study block</h3>
  <p>Choose a gap below to reserve its start. Blocks are saved for your account on this device.</p>
  <label>Study topic <input maxLength={80} value={topic} placeholder="Personal study" onChange={e=>setTopic(e.target.value)}/></label>
  <label>Block length <select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>
   {[15,30,60,90].map(n=><option key={n} value={n}>{n} minutes</option>)}
  </select></label>
  <h3>Free on {displayDate(selected,dateName)}</h3>
  {today.length?<ul>{today.map(gap=><li key={gap.start}>{clock(gap.start)}–{clock(gap.end)} · {durationLabel(gap.end-gap.start)}{' '}
   <button type="button" disabled={!storageKey||gap.end-gap.start<minutes*60000}
    onClick={()=>change({id:crypto.randomUUID(),title:topic.trim()||'Personal study',start:gap.start,end:gap.start+minutes*60000})}>Reserve {minutes} min</button></li>)}</ul>:
   <p>No gaps match these settings on this day.</p>}
  <p>Matching free time this week: {durationLabel(total)}</p>
  {longest&&<p>Longest gap this week: {displayDate(longest.day,dateName)}, {clock(longest.start)}–{clock(longest.end)} · {durationLabel(longest.end-longest.start)}</p>}
  <button className="wc-outline" disabled={!next} onClick={()=>onSelect(next.day)}>Next available day this week</button>
  <h3>Study blocks this week</h3>
  {scheduled.length?<ul>{scheduled.map(block=><li key={block.id}>
   <strong>{block.title}</strong> · {dateName.format(block.start)} · {clock(block.start)}–{clock(block.end)} PKT
   <button type="button" disabled={moving} onClick={()=>setEditing(editing===block.id?null:block.id)}>Reschedule</button>
   {editing===block.id&&<fieldset><legend>Choose a new gap this week</legend>
    {gaps.filter(gap=>gap.end-gap.start>=block.end-block.start).length===0&&<p>No matching gap this week.</p>}
    {gaps.filter(gap=>gap.end-gap.start>=block.end-block.start).map(gap=>
     <button type="button" key={gap.start} disabled={moving} onClick={()=>move(block,gap)}>
      Move to {gap.day} · {clock(gap.start)}–{clock(gap.start+block.end-block.start)} PKT</button>)}
   </fieldset>}
   <button type="button" disabled={moving} aria-label={'Cancel '+block.title} onClick={()=>change(block,true)}>Cancel</button>
  </li>)}</ul>:<p>No study blocks scheduled this week.</p>}
  </>}
 </section>;
}

function readBlocks(key){
 if(!key)return [];
 const rows=JSON.parse(localStorage.getItem(key)??'[]');
 if(!Array.isArray(rows)||!rows.every(row=>row&&typeof row.id==='string'&&typeof row.title==='string'&&
  Number.isFinite(row.start)&&Number.isFinite(row.end)&&row.end>row.start))throw new Error('Invalid study blocks');
 return rows;
}
