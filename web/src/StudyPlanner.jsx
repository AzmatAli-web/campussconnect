import React,{useEffect,useState} from 'react';
import {readAssignments} from './assignment-planner.js';
import {goalsKey,thisCampusWeek,shiftWeek,readGoals,writeGoals,goalFields,goalComplete,weekProgress,MAX_WEEKLY_GOALS,MAX_STORED_GOALS} from './weekly-goals.js';
import './study-planner.css';

export default function StudyPlanner({assignmentKey}){
 const key=goalsKey(assignmentKey);
 const [week,setWeek]=useState(thisCampusWeek);
 const [goals,setGoals]=useState(()=>readGoals(key));
 const [assignments,setAssignments]=useState(()=>readAssignments(assignmentKey));
 const [title,setTitle]=useState(''),[assignmentId,setAssignmentId]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  const sync=event=>{
   if(event.key===null||event.key===key)setGoals(readGoals(key));
   if(event.key===null||event.key===assignmentKey)setAssignments(readAssignments(assignmentKey));
  };
  const focus=()=>sync({key:null});
  window.addEventListener('storage',sync);window.addEventListener('focus',focus);
  return()=>{window.removeEventListener('storage',sync);window.removeEventListener('focus',focus);};
 },[key,assignmentKey]);
 const current=goals.filter(goal=>goal.week===week);
 const progress=weekProgress(goals,assignments,week);
 function persist(next,description){
  if(!writeGoals(key,next)){setError('Unable to save your study goals in this browser.');setNotice('');return false;}
  setGoals(next);setError('');setNotice(description);return true;
 }
 function add(event){
  event.preventDefault();
  try {
   if(current.length>=MAX_WEEKLY_GOALS)throw Error('Maximum 12 goals per week.');
   if(goals.length>=MAX_STORED_GOALS)throw Error('Maximum 120 stored goals. Remove an older goal to continue.');
   const fields=goalFields({title,week,assignmentId:assignmentId||null});
   const latest=readGoals(key);
   if(latest.filter(x=>x.week===week).length>=MAX_WEEKLY_GOALS)throw Error('Maximum 12 goals per week.');
   if(persist([...latest,{id:crypto.randomUUID(),...fields,done:false}],'Study goal added.')){
    setTitle('');setAssignmentId('');
   }
  }catch(e){setError(e.message);}
 }
 function toggle(goal) {
  if(goal.assignmentId)return;
  persist(readGoals(key).map(g=>g.id===goal.id?{...g,done:!g.done}:g),
   goal.done?'Goal reopened.':'Goal completed.');
 }
 function remove(id) {
  persist(readGoals(key).filter(g=>g.id!==id),'Goal removed.');
 }
 if(!key)return <section className="wc-panel"><h2>Study planner unavailable</h2><p>Sign in as an active student.</p></section>;
 return <div className="wc-stack wc-study-planner">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">PERSONAL LEARNING PLAN</span>
    <h2>Weekly study goals</h2><p>Goals stay in this browser and campus account, not in official academic records.</p></div></div>
   <div className="wc-study-week">
    <button type="button" className="wc-outline" onClick={()=>setWeek(shiftWeek(week,-1))}>Previous week</button>
    <strong>Week starting <time dateTime={week}>{week}</time> (PKT)</strong>
    <button type="button" className="wc-outline" onClick={()=>setWeek(shiftWeek(week,1))}>Next week</button>
    <button type="button" className="wc-outline" onClick={()=>setWeek(thisCampusWeek())}>This week</button>
   </div>
   <div className="wc-study-progress">
    <strong>{progress.completed} of {progress.total} goals completed ({progress.percent}%)</strong>
    <progress value={progress.completed} max={Math.max(1,progress.total)} aria-label="Weekly goal completion"/>
   </div>
   <form className="wc-form" onSubmit={add}>
    <label>Study goal<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Review chapter 3"/></label>
    <label>Linked assignment (optional)<select value={assignmentId} onChange={e=>setAssignmentId(e.target.value)}>
     <option value="">No linked assignment — track manually</option>
     {assignments.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
    </select></label>
    <p className="wc-study-note">Linked goals are counted as complete when the selected assignment is marked complete in Assignment Tracker.</p>
    <button className="wc-primary" type="submit">Add weekly goal</button>
   </form>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="wc-panel" aria-label="Goals for selected week">
   <div className="wc-head"><div><h2>Goals for this week</h2><p>{progress.remaining} remaining</p></div></div>
   {current.length===0?<p>No study goals yet for this week.</p>:
    <ul className="wc-study-goals">{current.map(goal=>{
     const done=goalComplete(goal,assignments);
     const related=goal.assignmentId?assignments.find(a=>a.id===goal.assignmentId):null;
     return <li key={goal.id}><div><strong>{goal.title}</strong>
      <small>{goal.assignmentId?(related?'Linked: '+related.title:'Linked assignment unavailable'):'Manual goal'}</small>
      <span className={'wc-tag '+(done?'good':'')}>{done?'Completed':'Open'}</span></div>
      <div className="wc-planner-actions">
       {!goal.assignmentId&&<button className="wc-outline" type="button" onClick={()=>toggle(goal)}>{goal.done?'Reopen':'Mark complete'}</button>}
       <button className="wc-outline dangerous" type="button" onClick={()=>remove(goal.id)} aria-label={'Remove goal: '+goal.title}>Remove</button>
      </div>
     </li>;
    })}</ul>}
  </section>
 </div>;
}
