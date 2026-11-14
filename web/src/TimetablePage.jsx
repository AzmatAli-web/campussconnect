import React,{useEffect,useState} from 'react';
import {hasRole} from './dashboard-domain.js';
import {chooseTimetableGroup,groupId,readTimetablePreference,saveTimetablePreference} from './timetable-preference.js';

const days=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const initialForm={
 term:'Fall 2026',program:'BSE',semester:'7',section:'A',dayOfWeek:'1',
 startTime:'08:00',endTime:'09:30',courseCode:'',courseTitle:'',
 instructorName:'',room:''
};
const label=g=>g.term+' · '+g.program+' · Semester '+g.semester+' · Section '+g.section;

export default function TimetablePage({profile,call,act,busy,preferenceKey}){
 const canPublish=hasRole(profile,'admin')||hasRole(profile,'staff');
 const [groups,setGroups]=useState([]);
 const [preferred,setPreferred]=useState(()=>readTimetablePreference(preferenceKey));
 const [slotResult,setSlotResult]=useState(null);
 const [slotRevision,setSlotRevision]=useState(0);
 const [loading,setLoading]=useState(true);
 const [groupError,setGroupError]=useState('');
 const [form,setForm]=useState(initialForm);
 const chosen=chooseTimetableGroup(groups,preferred);
 const selected=chosen?groupId(chosen):'';
 const slotKey=JSON.stringify([selected,slotRevision]);
 const slots=slotResult?.key===slotKey?slotResult.rows:[];
 const slotsLoading=Boolean(chosen)&&slotResult?.key!==slotKey;
 const error=groupError||(slotResult?.key===slotKey?slotResult.error:'');

 async function loadGroups(isCurrent=()=>true){
  setLoading(true);
  try{
   const found=await call('/timetable/groups');
   if(isCurrent()){
    setGroups(Array.isArray(found)?found:[]);
    setGroupError('');
   }
  }catch(e){if(isCurrent())setGroupError(e.message||'Unable to load official timetables.');}
  finally{if(isCurrent())setLoading(false);}
 }
 useEffect(()=>{
  let live=true;
  loadGroups(()=>live);
  return()=>{live=false;};
 },[]);

 useEffect(()=>{
  if(!chosen)return;
  let live=true;
  const query=new URLSearchParams({
   term:chosen.term,program:chosen.program,
   semester:String(chosen.semester),section:chosen.section
  });
  call('/timetable/slots?'+query.toString())
   .then(rows=>{if(live)setSlotResult({key:slotKey,rows:Array.isArray(rows)?rows:[],error:''});})
   .catch(e=>{if(live)setSlotResult({key:slotKey,rows:[],error:e.message||'Unable to load timetable classes.'});});
  return()=>{live=false;};
 },[slotKey]);

 function selectGroup(id){
  const group=groups.find(item=>groupId(item)===id);
  if(!group)return;
  setPreferred(id);
  setSlotRevision(n=>n+1);
  saveTimetablePreference(preferenceKey,group);
 }

 async function reloadSchedule(){
  await loadGroups();
  setSlotRevision(n=>n+1);
 }
 const set=(field,value)=>setForm(previous=>({...previous,[field]:value}));
 async function publish(event){
  event.preventDefault();
  const payload={...form,semester:Number(form.semester),dayOfWeek:Number(form.dayOfWeek)};
  const saved=await act(()=>call('/timetable/slots',{method:'POST',body:payload}),
    'Timetable class published for this section.');
  if(saved)await reloadSchedule();
 }
 async function archive(slot){
  if(!window.confirm('Archive this published class? Students will no longer see it.'))return;
  const saved=await act(()=>call('/timetable/slots/'+slot.id+'/archive',
    {method:'POST',body:{}}),'Class archived.');
  if(saved)await reloadSchedule();
 }
 return <div className="wc-stack">
  <section className="wc-panel">
   <div className="wc-head"><div>
    <span className="wc-kicker">ACADEMIC SCHEDULE</span>
    <h2>Official weekly timetable</h2>
    <p>Choose a published program, semester and section. Weekly times are campus-local and do not depend on your phone timezone.</p>
   </div></div>
   {loading?<p>Loading schedules…</p>:groups.length===0?
    <div className="wc-empty"><span>▦</span><h3>No timetable published yet</h3>
     <p>Once authorized academic staff publish a timetable, you can view it here and on your phone.</p></div>:
    <>
     <label className="wc-timetable-picker">Available class group
      <select aria-label="Available class group" value={selected}
       onChange={e=>selectGroup(e.target.value)}>
       {groups.map(g=><option key={groupId(g)} value={groupId(g)}>{label(g)}</option>)}
      </select>
     </label>
     {preferenceKey&&<p>Your selection is remembered in this browser for this account.</p>}
     {slotsLoading?<p>Loading classes…</p>:slots.length===0?
      <div className="wc-empty"><h3>No classes for this group</h3></div>:
      <div className="wc-timetable-days">{[1,2,3,4,5,6,7].map(day=>{
       const classes=slots.filter(row=>row.dayOfWeek===day);
       return classes.length?<section key={day} className="wc-timetable-day">
        <h3>{days[day]}</h3><div className="wc-timetable-cards">
         {classes.map(slot=><article className="wc-timetable-card" key={slot.id}>
          <strong>{slot.startTime}–{slot.endTime}</strong>
          <div><b>{slot.courseCode}</b> · {slot.courseTitle}
          <small>{slot.instructorName} · {slot.room}</small></div>
          {canPublish&&<button type="button" disabled={busy}
            className="wc-outline dangerous" onClick={()=>archive(slot)}>Archive</button>}
         </article>)}
        </div></section>:null;
      })}</div>}
    </>}
   {error&&<p role="alert" className="wc-timetable-error">{error}</p>}
  </section>
  {canPublish&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">ACADEMIC OFFICE ONLY</span>
    <h2>Publish a class</h2>
    <p>Only authenticated Admin or Staff roles can publish. Overlapping classes for the same section are blocked by the database.</p>
   </div></div>
   <form className="wc-form" onSubmit={publish}>
    <div className="wc-form-pair">
     <label>Academic term<input required maxLength={40} value={form.term}
      onChange={e=>set('term',e.target.value)} placeholder="Fall 2026"/></label>
     <label>Program<input required maxLength={24} value={form.program}
      onChange={e=>set('program',e.target.value)} placeholder="BSE"/></label>
     <label>Semester<input required type="number" min="1" max="12"
      value={form.semester} onChange={e=>set('semester',e.target.value)}/></label>
     <label>Section<input required maxLength={12} value={form.section}
      onChange={e=>set('section',e.target.value)}/></label>
     <label>Day<select value={form.dayOfWeek} onChange={e=>set('dayOfWeek',e.target.value)}>
      {days.slice(1).map((d,i)=><option value={String(i+1)} key={d}>{d}</option>)}
     </select></label>
     <label>Course code<input required maxLength={24} value={form.courseCode}
      onChange={e=>set('courseCode',e.target.value)} placeholder="CSC494"/></label>
     <label>Start time<input required type="time" step="900"
      value={form.startTime} onChange={e=>set('startTime',e.target.value)}/></label>
     <label>End time<input required type="time" step="900"
      value={form.endTime} onChange={e=>set('endTime',e.target.value)}/></label>
    </div>
    <label>Course title<input required maxLength={160} value={form.courseTitle}
     onChange={e=>set('courseTitle',e.target.value)}
     placeholder="Software Project Management"/></label>
    <div className="wc-form-pair">
     <label>Instructor<input required maxLength={120} value={form.instructorName}
      onChange={e=>set('instructorName',e.target.value)}/></label>
     <label>Classroom<input required maxLength={80} value={form.room}
      onChange={e=>set('room',e.target.value)}/></label>
    </div>
    <button disabled={busy} className="wc-primary" type="submit">
     {busy?'Publishing…':'Publish official class'}
    </button>
   </form>
  </section>}
 </div>;
}
