import React,{useEffect,useRef,useState} from 'react';
import {MAX_ASSIGNMENTS,assignmentFields,assignmentStatus,formatDeadline,
 readAssignments,todayAtCampus,writeAssignments} from './assignment-planner.js';
import './assignment-planner.css';

const empty = {title:'',course:'',due:''};
const labels = {completed:'Completed',overdue:'Overdue',today:'Due today',upcoming:'Upcoming'};

export default function AssignmentPlanner({storageKey}) {
 const [rows,setRows] = useState(()=>readAssignments(storageKey));
 const [form,setForm] = useState(empty),[edit,setEdit] = useState(null),[remove,setRemove] = useState(null);
 const [filter,setFilter] = useState('open'),[error,setError] = useState(''),[message,setMessage] = useState('');
 const [today,setToday] = useState(todayAtCampus);
 const titleInput = useRef(null), listHeading = useRef(null);
 useEffect(()=>{
  const updateDate = ()=>setToday(todayAtCampus());
  const sync = event=>{
   if(event.key===null || event.key===storageKey) setRows(readAssignments(storageKey));
  };
  const clock = window.setInterval(updateDate,30_000);
  window.addEventListener('focus',updateDate);
  window.addEventListener('storage',sync);
  return ()=>{
   window.clearInterval(clock);
   window.removeEventListener('focus',updateDate);
   window.removeEventListener('storage',sync);
  };
 },[storageKey]);
 function save(next,text) {
  setMessage('');
  if(!writeAssignments(storageKey,next)){
   setError('Could not save to this browser. Check whether browser storage is available and try again.');
   return false;
  }
  setRows(next);setError('');setMessage(text);
  return true;
 }
 function reset(){setForm(empty);setEdit(null);}
 function submit(event) {
  event.preventDefault();
  setMessage('');
  try {
   const fields = assignmentFields(form);
   const current = readAssignments(storageKey);
   if(edit&&!current.some(row=>row.id===edit)) throw new Error('This assignment was removed in another tab. Cancel editing and try again.');
   if(!edit&&current.length>=MAX_ASSIGNMENTS) throw new Error('Remove an entry before adding another. The planner holds up to 60 assignments.');
   const next = edit ? current.map(row=>row.id===edit?{...row,...fields}:row)
    : [...current,{id:crypto.randomUUID(),...fields,done:false}];
   if(save(next,edit?'Assignment updated.':'Assignment added.')) {
    if(!edit) setFilter('open');
    reset();
   }
  } catch(e) {setError(e.message);}
 }
 if(!storageKey)return <section className="wc-panel"><h2>Planner unavailable</h2>
  <p>Sign in with an active student profile to use the planner.</p></section>;
 const visible = rows.filter(row=>filter==='all'||(filter==='completed'?row.done:!row.done))
  .sort((a,b)=>Number(a.done)-Number(b.done)||a.due.localeCompare(b.due)||a.title.localeCompare(b.title));
 return <div className="wc-stack wc-planner">
  <section className="wc-panel">
   <div className="wc-head"><div><h2>{edit?'Edit assignment':'Add an assignment'}</h2>
    <p>Personal reminders for this campus account on this browser. This is not an official submission record and does not sync across devices.</p></div></div>
   <form className="wc-form" onSubmit={submit}>
    <label>Assignment title<input ref={titleInput} required maxLength={100} value={form.title}
     onChange={event=>setForm({...form,title:event.target.value})}/></label>
    <div className="wc-form-pair">
     <label>Course (optional)<input maxLength={40} value={form.course}
      onChange={event=>setForm({...form,course:event.target.value})}/></label>
     <label>Due date (PKT)<input type="date" required min="2000-01-01" max="2099-12-31" value={form.due}
      onChange={event=>setForm({...form,due:event.target.value})}/></label>
    </div>
    <div className="wc-planner-actions">
     <button className="wc-primary">{edit?'Save changes':'Add assignment'}</button>
     {edit&&<button type="button" className="wc-outline" onClick={()=>{reset();setError('');titleInput.current?.focus();}}>Cancel editing</button>}
    </div>
   </form>
   {error&&<p role="alert" className="wc-planner-feedback">{error}</p>}
   <p role="status" className="wc-planner-feedback">{message}</p>
  </section>
  <section className="wc-panel" aria-labelledby="assignment-list-heading">
   <div className="wc-head"><div><h2 id="assignment-list-heading" tabIndex={-1} ref={listHeading}>My assignments</h2>
    <p>{rows.filter(row=>!row.done).length} open · {rows.filter(row=>assignmentStatus(row,today)==='overdue').length} overdue</p></div>
    <label className="wc-planner-filter">Show assignments <select value={filter} onChange={event=>{setRemove(null);setFilter(event.target.value);}}>
     <option value="open">Open</option><option value="completed">Completed</option><option value="all">All</option>
    </select></label></div>
   {visible.length===0?<div className="wc-empty"><h3>No {filter==='all'?'':filter+' '}assignments</h3></div>:
    <ul className="wc-planner-list">{visible.map(row=>{
     const status = assignmentStatus(row,today);
     return <li key={row.id}>
      <article className="wc-planner-card" aria-label={row.title}>
       <div><h3>{row.title}</h3>
        <p>{row.course&&<>{row.course} · </>}Due <time dateTime={row.due}>{formatDeadline(row.due)}</time></p>
        <span className={'wc-tag '+(status==='overdue'||status==='today'?'warn':status==='completed'?'good':'')}>{labels[status]}</span></div>
       <div className="wc-planner-actions">
        <button type="button" className="wc-outline" onClick={()=>{
         const current = readAssignments(storageKey);
         if(save(current.map(item=>item.id===row.id?{...item,done:!item.done}:item),
          row.done?'Assignment reopened.':'Assignment completed.')) listHeading.current?.focus();
        }}>{row.done?'Reopen':'Mark complete'}</button>
        <button type="button" className="wc-outline" onClick={()=>{
         setEdit(row.id);setForm({title:row.title,course:row.course,due:row.due});
         setError('');setMessage('');titleInput.current?.focus();
        }}>Edit</button>
        <button type="button" className="wc-outline dangerous" aria-expanded={remove===row.id}
         onClick={()=>setRemove(remove===row.id?null:row.id)}>Remove</button>
       </div>
       {remove===row.id&&<div className="wc-planner-actions">
        <span>Remove this assignment from your planner?</span>
        <button type="button" className="wc-outline dangerous" onClick={()=>{
         if(save(readAssignments(storageKey).filter(item=>item.id!==row.id),'Assignment removed.')){
          if(edit===row.id)reset();
          setRemove(null);listHeading.current?.focus();
         }
        }}>Confirm removal</button>
       </div>}
      </article>
     </li>;
    })}</ul>}
  </section>
 </div>;
}
