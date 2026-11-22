import React,{useEffect,useState} from 'react';
import {Overview} from './WorkspacePages.jsx';
import {readAssignments,sortAssignments,countdownLabel,todayAtCampus} from './assignment-planner.js';
import {todaySchedule} from './timetable-today.js';
import {chooseTimetableGroup,readTimetablePreference} from './timetable-preference.js';
import './student-overview.css';

const days=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export default function StudentOverview({data,profile,choose,call,assignmentKey,preferenceKey}){
 const [assignments,setAssignments]=useState(()=>readAssignments(assignmentKey));
 const [now,setNow]=useState(()=>Date.now());
 const [schedule,setSchedule]=useState({loading:true,group:null,slots:[],error:''});
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  const refresh=()=>{setAssignments(readAssignments(assignmentKey));setNow(Date.now());};
  const changed=event=>{
   if(event.key===null||event.key===assignmentKey)refresh();
   if(event.key===null||event.key===preferenceKey)setReload(n=>n+1);
  };
  const tick=window.setInterval(()=>setNow(Date.now()),30_000);
  window.addEventListener('focus',refresh);
  window.addEventListener('storage',changed);
  return()=>{window.clearInterval(tick);window.removeEventListener('focus',refresh);window.removeEventListener('storage',changed);};
 },[assignmentKey,preferenceKey]);
 useEffect(()=>{
  let active=true;
  setSchedule({loading:true,group:null,slots:[],error:''});
  (async()=>{
   try{
    const groups=await call('/timetable/groups');
    if(!active)return;
    if(!Array.isArray(groups))throw Error('Invalid timetable response');
    const group=chooseTimetableGroup(groups,readTimetablePreference(preferenceKey));
    if(!group){setSchedule({loading:false,group:null,slots:[],error:''});return;}
    const params=new URLSearchParams({term:group.term,program:group.program,semester:String(group.semester),section:group.section});
    const slots=await call('/timetable/slots?'+params.toString());
    if(!active)return;
    if(!Array.isArray(slots))throw Error('Invalid class schedule response');
    setSchedule({loading:false,group,slots,error:''});
   }catch(error){
    if(active)setSchedule({loading:false,group:null,slots:[],error:error.message||'Unable to load timetable'});
   }
  })();
  return()=>{active=false;};
 },[call,preferenceKey,reload]);
 const today=todayAtCampus(new Date(now));
 const deadlines=sortAssignments(assignments.filter(item=>!item.done)).slice(0,4);
 const timed=todaySchedule(schedule.slots,now);
 const todayClasses=schedule.slots.filter(item=>item.dayOfWeek===timed.day).sort((a,b)=>a.startTime.localeCompare(b.startTime));
 const groupLabel=schedule.group?[schedule.group.program,'semester '+schedule.group.semester,'section '+schedule.group.section].join(', '):'Published academic schedule';
 return <>
  <div className="wc-student-grid">
   <section className="wc-panel" aria-label="Today's classes">
    <div className="wc-head"><div><span className="wc-kicker">TODAY IN CLASS · PKT</span><h2>Today's classes</h2>
     <p>{days[timed.day]} · {groupLabel}</p>
    </div><button className="wc-link" type="button" onClick={()=>choose('timetable')}>Full timetable</button></div>
    {schedule.loading?<p role="status">Loading today's timetable…</p>:schedule.error?
      <p role="alert">Timetable unavailable: {schedule.error}</p>:!schedule.group?
      <p>No timetable published yet.</p>:todayClasses.length===0?<p>No classes scheduled for this group today.</p>:
      <ul className="wc-student-items">{todayClasses.map(slot=><li key={slot.id}>
       <strong>{slot.courseTitle}</strong>
       <small>{slot.startTime}–{slot.endTime} PKT · {slot.room}</small>
       {timed.current?.id===slot.id&&<span className="wc-tag good">In progress</span>}
       {timed.next?.id===slot.id&&<span className="wc-tag blue">Up next</span>}
      </li>)}</ul>}
   </section>
   <section className="wc-panel" aria-label="Personal assignment deadlines">
    <div className="wc-head"><div><span className="wc-kicker">PERSONAL STUDY PLAN</span><h2>My next deadlines</h2>
     <p>Saved in this browser only · {today} PKT</p>
    </div><button className="wc-link" type="button" onClick={()=>choose('assignments')}>All assignments</button></div>
    {deadlines.length===0?<p>No open assignments in this browser.</p>:
     <ul className="wc-student-items">{deadlines.map(item=><li key={item.id}>
      <strong>{item.title}</strong>
      <small>{item.course?item.course+' · ':''}{countdownLabel(item,today)}</small>
      <span className={'wc-tag wc-priority-'+item.priority}>{item.priority} priority</span>
     </li>)}</ul>}
   </section>
  </div>
  <Overview data={data} profile={profile} choose={choose}/>
 </>;
}