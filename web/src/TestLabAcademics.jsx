import React,{useState} from 'react';

const groups=[
 {id:'a',label:'BSE · Semester 7 · Section A',classes:[
  {day:'Monday',time:'09:00–10:30',course:'Software Project Management',room:'Demo Lab 3'},
  {day:'Wednesday',time:'11:00–12:30',course:'Software Quality Engineering',room:'Demo Room 2'},
 ]},
 {id:'b',label:'BSE · Semester 7 · Section B',classes:[
  {day:'Tuesday',time:'10:00–11:30',course:'Software Project Management',room:'Demo Lab 2'},
  {day:'Thursday',time:'13:00–14:30',course:'Software Quality Engineering',room:'Demo Room 4'},
 ]},
];

export function DemoTimetable(){
 const [id,setId]=useState(groups[0].id);
 const group=groups.find(item=>item.id===id);
 return <section className="lab-card lab-academics">
  <div className="lab-card-head"><div><span className="lab-overline">FICTIONAL CLASS SCHEDULE</span>
   <h2>Weekly timetable</h2></div></div>
  <label className="lab-cohort">Class group
   <select value={id} onChange={e=>setId(e.target.value)}>
    {groups.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   </select>
  </label>
  <p>Times are campus-local. These sample classes are not an official schedule.</p>
  <ul className="lab-class-list">
   {group.classes.map(item=><li key={item.day}><strong>{item.day} · {item.time}</strong>
    <span>{item.course} · {item.room}</span></li>)}
  </ul>
 </section>;
}

export function DemoNotes(){
 return <section className="lab-card lab-academics">
  <div className="lab-card-head"><div><span className="lab-overline">FICTIONAL COURSE LIBRARY</span>
   <h2>Faculty notes</h2></div></div>
  <article className="lab-event">
   <h3>Project scheduling and dependencies</h3>
   <p>CSC494 · BSE · Semester 7 · Sample faculty material</p>
   <details><summary>Preview sample notes</summary>
    <p>List activities and dependencies before estimating the project timeline. The critical path is the longest dependency path through the schedule. A delay on that path can delay the whole project.</p>
   </details>
  </article>
  <p>This is a text preview. PDF uploads and downloads are part of the connected portal, not this simulation.</p>
 </section>;
}
