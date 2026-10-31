import React,{useMemo,useState} from 'react';
import {applyDemoAction,createInitialLab,eventSeats,visibleActivity,registrantsForViewer} from './test-lab-domain.js';
import './test-lab.css';

const sections=[
 ['overview','Overview','◈'],
 ['events','Events','▣'],
 ['announcements','Announcements','◉'],
 ['access','Role management','⛨']
];
const roleLabel=person=>person.roles.includes('admin')?'Administrator':person.roles.includes('faculty')?'Faculty':person.roles.includes('societyManager')?'Society Manager':person.roles.includes('student')?'Student':'Pending Faculty';
const canPublish=person=>person.status==='active' && (person.roles.includes('faculty')||(person.roles.includes('societyManager')&&person.societyIds.length>0));
function Stat({label,value,sub}){
 return <article className="lab-stat"><div>{label}</div><strong>{value}</strong><small>{sub}</small></article>;
}
export default function TestLab(){
 const [data,setData]=useState(createInitialLab);
 const [actorId,setActorId]=useState('demo-admin');
 const [section,setSection]=useState('overview');
 const [feedback,setFeedback]=useState(null);
 const [eventForm,setEventForm]=useState({title:'',venue:'',capacity:5});
 const [noticeForm,setNoticeForm]=useState({title:'',body:''});
 const actor=useMemo(()=>data.people.find(p=>p.id===actorId),[data.people,actorId]);
 const isAdmin=actor?.roles.includes('admin')&&actor.status==='active';
 const isStudent=actor?.roles.includes('student')&&actor.status==='active';
 const isPublisher=canPublish(actor);
 const confirmed=data.registrations.length;
 const activity=useMemo(()=>visibleActivity(data,actorId),[data,actorId]);
 const act=(type,payload)=>{
  const r=applyDemoAction(data,actorId,type,payload);
  setFeedback({kind:r.ok?'success':'error',code:r.code,text:r.message});
  if(r.ok)setData(r.next);
  return r.ok;
 };
 const reset=()=>{setData(createInitialLab());setActorId('demo-admin');setFeedback({kind:'info',text:'Reset complete: all simulated records were discarded.'});setSection('overview');};
 return <div className="lab">
  <aside className="lab-sidebar">
   <div className="lab-brand"><span className="lab-brand-icon">C<span>·</span></span><div><strong>CampusConnect</strong><small>Interactive Test Lab</small></div></div>
   <div className="lab-sidebar-label">WORKSPACE</div>
   <nav aria-label="Lab navigation">
    {sections.map(([id,name,emoji])=><button key={id} type="button" className={'lab-navitem '+(section===id?'selected':'')} onClick={()=>{setSection(id);setFeedback(null);}}><span>{emoji}</span>{name}</button>)}
   </nav>
   <div className="lab-sidebar-label lab-persona-label">SIMULATED IDENTITY</div>
   <div className="lab-personas">
    {data.people.map(p=><button type="button" key={p.id} onClick={()=>{setActorId(p.id);setFeedback(null);}} className={'lab-persona '+(actorId===p.id?'selected':'')}>
     <span className="lab-avatar">{p.name.split(' ').map(x=>x[0]).slice(-2).join('')}</span>
     <span className="lab-personatext"><strong>{p.name}</strong><small>{roleLabel(p)}</small></span>
     {actorId===p.id&&<span className="lab-dot"/>}
    </button>)}
   </div>
   <button type="button" onClick={reset} className="lab-reset">↻ Reset all demo data</button>
  </aside>
  <main className="lab-main">
   <header className="lab-top"><span><span className="lab-live-dot"/> LOCAL SIMULATION <span className="lab-sep">/</span> NO LIVE DATA</span><a href="/">Back to CampusConnect ↗</a></header>
   <div className="lab-content">
    <div className="lab-heading"><div><span className="lab-overline">ENGINEERING PREVIEW / ROLE TESTING</span><h1>{sections.find(x=>x[0]===section)?.[1]}</h1><p>Switch between test personas to review approvals, publishing, and event registration without a real Admin account.</p></div><span className="lab-userflag"><span className="lab-live-dot"/> {roleLabel(actor)}</span></div>
    <div className="lab-warning"><span>🧪</span><div><strong>Test environment — not a real login</strong><p>These are fictional users in browser memory. Actions are not sent to Firebase, MongoDB, or the CampusConnect API. Server concurrency and security are tested separately in automated integration tests.</p></div></div>
    {feedback&&<div role="status" className={'lab-feedback '+feedback.kind}><strong>{feedback.kind==='success'?'✓':feedback.kind==='error'?'!':'ℹ'}</strong><span>{feedback.code&&<small>{feedback.code} — </small>}{feedback.text}</span><button type="button" aria-label="Dismiss notification" onClick={()=>setFeedback(null)}>×</button></div>}
    <div className="lab-stats">
     <Stat label="Simulated users" value={data.people.length} sub="Four roles · one sandbox"/>
     <Stat label="Published events" value={data.events.length} sub="Campus-wide listings"/>
     <Stat label="Confirmations" value={confirmed} sub="Capacity-protected"/>
     <Stat label="Announcements" value={data.announcements.length} sub="Role-gated publishing"/>
    </div>

    {section==='overview'&&<div className="lab-two">
      <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">ACCESS CONTROL</span><h2>Current test persona</h2></div><span className="lab-rolepill">{roleLabel(actor)}</span></div>
       <div className="lab-current"><span className="lab-avatar large">{actor.name.split(' ').map(x=>x[0]).slice(-2).join('')}</span><div><strong>{actor.name}</strong><span>{actor.email}</span><small>{actor.status==='active'?'● Active fixture':'○ Pending verification'}</small></div></div>
       <div className="lab-inline-metrics"><div><small>Can publish events</small><strong>{isPublisher?'Yes':'No'}</strong></div><div><small>Can manage roles</small><strong>{isAdmin?'Yes':'No'}</strong></div><div><small>Can register</small><strong>{isStudent?'Yes':'No'}</strong></div></div>
       <button type="button" className="lab-primary" onClick={()=>setSection('access')}>Review permissions <span>↗</span></button>
      </section>
      <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">SIMULATED ACTIVITY</span><h2>Activity feed</h2></div><span className="lab-counter">{activity.length} visible</span></div>
       <div className="lab-audit">{activity.slice(0,6).map(a=><div className="lab-audit-row" key={a.id}><span className="lab-audit-indicator"/><div><strong>{a.label}</strong><small>{new Date(a.createdAt).toLocaleTimeString()}</small></div></div>)}{activity.length===0&&<p className="lab-privacy-note">No activity is visible for this account yet.</p>}</div>
      </section>
    </div>}

    {section==='events'&&<div className="lab-two">
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">PUBLISHED</span><h2>Campus events</h2></div><span className="lab-counter">{data.events.length} events</span></div>
      <div className="lab-eventlist">{data.events.map(e=>{const seats=eventSeats(data,e.id),registered=data.registrations.some(r=>r.eventId===e.id&&r.studentId===actor.id),registrants=registrantsForViewer(data,actorId,e.id);return <div className="lab-event" key={e.id}><div className="lab-event-top"><strong>{e.title}</strong><span className={seats.available===0?'lab-full':'lab-open'}>{seats.available===0?'Full':'Open'}</span></div><p>{e.venue} · {e.organizer}</p><div className="lab-capacity"><span style={{width:(seats.occupied/seats.capacity*100)+'%'}}/></div><div className="lab-event-bottom"><small>{seats.occupied} / {seats.capacity} confirmed</small>{isStudent&&<button type="button" disabled={registered} onClick={()=>act('register',{eventId:e.id})}>{registered?'Registered ✓':'Register'}</button>}</div>{registered&&<div className="lab-private-status">✓ Your own registration is confirmed. Other students cannot see your identity.</div>}{registrants!==null&&<details className="lab-attendee-details"><summary>Private attendee list · Organizer / Admin only ({registrants.length})</summary>{registrants.length===0?<p>No confirmed attendees yet.</p>:<ul>{registrants.map(r=><li key={r.id}>{r.name}</li>)}</ul>}</details>}</div>})}</div>
     </section>
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">ORGANIZER CONSOLE</span><h2>Create an event</h2></div></div>
      {isPublisher?<form className="lab-form" onSubmit={e=>{e.preventDefault();if(act('createEvent',eventForm))setEventForm({title:'',venue:'',capacity:5});}}>
       <label>Event title<input required minLength="3" value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})} placeholder="AI & Robotics Workshop"/></label>
       <label>Venue<input required minLength="2" value={eventForm.venue} onChange={e=>setEventForm({...eventForm,venue:e.target.value})} placeholder="CS Auditorium"/></label>
       <label>Capacity<input required type="number" min="1" max="1000" value={eventForm.capacity} onChange={e=>setEventForm({...eventForm,capacity:e.target.value})}/></label>
       <button className="lab-primary">Publish demo event ↗</button>
      </form>:<div className="lab-locked"><span>⛨</span><strong>Publishing restricted</strong><p>Approve the Faculty applicant or assign the Society Manager using the Demo Admin persona. Ordinary Students cannot publish.</p><button type="button" onClick={()=>setSection('access')}>View role controls →</button></div>}
     </section>
    </div>}

    {section==='announcements'&&<div className="lab-two">
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">CAMPUS BULLETIN</span><h2>Announcements</h2></div><span className="lab-counter">{data.announcements.length} notices</span></div>
      {data.announcements.map(n=><article className="lab-announcement" key={n.id}><div><span className="lab-rolepill">{n.scope}</span><small>{new Date(n.createdAt).toLocaleDateString()}</small></div><h3>{n.title}</h3><p>{n.body}</p></article>)}
     </section>
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">AUTHOR TOOLS</span><h2>Publish a notice</h2></div></div>
      {isPublisher?<form className="lab-form" onSubmit={e=>{e.preventDefault();if(act('publishAnnouncement',noticeForm))setNoticeForm({title:'',body:''});}}>
       <label>Title<input required minLength="3" value={noticeForm.title} onChange={e=>setNoticeForm({...noticeForm,title:e.target.value})} placeholder="Upcoming semester notice"/></label>
       <label>Message<textarea required minLength="5" rows="5" value={noticeForm.body} onChange={e=>setNoticeForm({...noticeForm,body:e.target.value})} placeholder="Write the announcement..."/></label>
       <button className="lab-primary">Publish demo notice ↗</button>
      </form>:<div className="lab-locked"><span>⛨</span><strong>Author access required</strong><p>Faculty must be approved, and Society Managers must have an assignment.</p></div>}
     </section>
    </div>}

    {section==='access'&&<div className="lab-two">
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">ADMIN WORKFLOWS</span><h2>Role approvals</h2></div><span className="lab-counter">{isAdmin?'Authorized fixture':'Read only'}</span></div>
       <div className="lab-approval"><span className="lab-approval-icon">F</span><div><strong>Faculty applicant</strong><p>Approve faculty status after evidence review.</p><small>{data.people.find(p=>p.id==='demo-faculty').status}</small></div><button type="button" onClick={()=>act('approveFaculty')} disabled={!isAdmin||data.people.find(p=>p.id==='demo-faculty').status==='active'}>Approve</button></div>
       <div className="lab-approval"><span className="lab-approval-icon">M</span><div><strong>Computing Society manager</strong><p>Assign the manager to an active society.</p><small>{data.people.find(p=>p.id==='demo-manager').societyIds.length?'assigned':'unassigned'}</small></div><button type="button" onClick={()=>act('assignManager')} disabled={!isAdmin||data.people.find(p=>p.id==='demo-manager').societyIds.length>0}>Assign</button></div>
       {!isAdmin&&<div className="lab-inline-notice">Switch to <strong>Demo Administrator</strong> in the sidebar to test approval actions. Other personas are correctly restricted.</div>}
     </section>
     <section className="lab-card"><div className="lab-card-head"><div><span className="lab-overline">POLICY MATRIX</span><h2>What each role can do</h2></div></div>
       <div className="lab-policy">{[['Student','Browse events, register once'],['Faculty','Publish after Admin verification'],['Society Manager','Publish after society assignment'],['Admin','Approve roles, oversee campus']].map(([r,d])=><div className="lab-policy-row" key={r}><strong>{r}</strong><span>{d}</span></div>)}</div>
       <div className="lab-inline-notice">These approvals change <strong>browser-only fixture state</strong>; the server never receives this data.</div>
     </section>
    </div>}
    <footer className="lab-footer">CampusConnect Test Lab · Simulated personas only · No Firebase session · No persistent writes</footer>
   </div>
  </main>
 </div>;
}
