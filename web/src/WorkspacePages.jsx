import React,{useState} from 'react';
import {buildEventPayload,buildAnnouncementPayload,canOrganize,displayRole,eventFull,formatDate,hasRole,isVerifiedFaculty,myRegistration} from './dashboard-domain.js';

function Head({tag,title,detail,right}){return <div className="wc-head"><div><span className="wc-kicker">{tag}</span><h2>{title}</h2>{detail&&<p>{detail}</p>}</div>{right}</div>;}
function Empty({title,detail}){return <div className="wc-empty"><span>◇</span><h3>{title}</h3><p>{detail}</p></div>;}
function Metric({icon,label,value,detail}){return <div className="wc-metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><em>{detail}</em></div>;}
function Tag({children,kind='neutral'}){return <span className={'wc-tag '+kind}>{children}</span>;}
function EventCard({event,registrations=[],profile,busy,register,showRoster,openRoster,rosters,privateView=false}){
 const own=myRegistration(event.id,registrations),full=eventFull(event);
 const open=event.registrationOpen===true&&!full&&event.status==='published';
 return <article className="wc-event"><div className="wc-event-band"><span>◷ {formatDate(event.startsAt)}</span><Tag kind={own?'good':full?'warn':open?'good':'neutral'}>{own?'Registered':full?'Full':open?'Open':'Unavailable'}</Tag></div>
  <div className="wc-event-details"><h3>{event.title}</h3><p>{event.description}</p><div className="wc-event-venue">⌖ {event.venue}</div>
   <div className="wc-seats"><span>{event.confirmedCount}/{event.capacity} confirmed</span><span>{Math.max(0,event.capacity-event.confirmedCount)} seats left</span></div>
   <div className="wc-capacity"><div style={{width:Math.min(100,event.capacity?(event.confirmedCount/event.capacity)*100:0)+'%'}}/></div>
   <div className="wc-event-actions">
    {hasRole(profile,'student')&&!privateView&&<button disabled={busy||own||!open} className="wc-primary" onClick={()=>register(event)}>{own?'✓ Confirmed':!open?'Registration unavailable':'Register'}</button>}
    {privateView&&<button className="wc-outline" onClick={()=>showRoster(event.id)}>{openRoster===event.id?'Hide private roster':'View private attendees'}</button>}
   </div>
   {own&&!privateView&&<p className="wc-private-note">Your registration is visible to you and authorized organizers only.</p>}
   {privateView&&openRoster===event.id&&<div className="wc-roster"><strong>Restricted attendee list</strong><small>Available only to this event's current organizer or an Administrator.</small>{!rosters[event.id]?<p>Loading authorized attendee records…</p>:rosters[event.id].length===0?<p>No registered attendees yet.</p>:<ul>{rosters[event.id].map(person=><li key={person.id}><strong>{person.studentName||'Attendee'}</strong><small>{person.universityEmail||''} {person.registrationNo||''}</small></li>)}</ul>}</div>}
  </div></article>;
}
export function Overview({data,profile,choose}){
 const events=(data.events||[]).filter(x=>new Date(x.startsAt)>new Date()),notes=data.announcements||[],regs=data.registrations||[];
 return <><div className="wc-metrics">
  <Metric icon="▣" label="Upcoming events" value={events.length} detail="Campus listings"/>
  <Metric icon="◉" label="Announcements" value={notes.length} detail="Latest notices"/>
  <Metric icon="✓" label="My registrations" value={hasRole(profile,'student')?regs.length:'—'} detail="Private to your account"/>
  <Metric icon="✦" label="Your role" value={displayRole(profile)} detail="Server-verified access"/>
 </div><div className="wc-columns">
 <section className="wc-panel"><Head tag="HAPPENING NEXT" title="Featured events" right={<button className="wc-link" onClick={()=>choose('events')}>See all ↗</button>}/>{events.length?events.slice(0,4).map(e=><div className="wc-compact" key={e.id}><span>▣</span><div><strong>{e.title}</strong><small>{formatDate(e.startsAt)} · {e.confirmedCount}/{e.capacity} confirmed</small></div></div>):<Empty title="No events published yet" detail="Upcoming events will appear as soon as organizers publish them."/>}</section>
 <section className="wc-panel"><Head tag="CAMPUS BULLETIN" title="Recent announcements" right={<button className="wc-link" onClick={()=>choose('announcements')}>See all ↗</button>}/>{notes.length?notes.slice(0,4).map(n=><div className="wc-compact" key={n.id}><span>◉</span><div><strong>{n.title}</strong><small>{n.scope} · {formatDate(n.publishedAt)}</small></div></div>):<Empty title="No announcements yet" detail="You will see relevant campus notices here."/>}</section>
 </div></>;
}
export function Events({data,profile,busy,register}){
 const events=data.events||[],regs=data.registrations||[];
 return <section className="wc-panel"><Head tag="CAMPUS CALENDAR" title="Published events" detail="You can see event details and seat totals. Other students' names and registrations are private." right={<Tag kind="blue">{events.length} events</Tag>}/>{events.length?<div className="wc-event-grid">{events.map(event=><EventCard key={event.id} event={event} registrations={regs} profile={profile} busy={busy} register={register}/>)}</div>:<Empty title="No events yet" detail="Faculty and Society Managers can publish events once their real roles are approved."/>}</section>;
}
export function Registrations({data,choose}){
 const regs=data.registrations||[],events=data.events||[];
 return <section className="wc-panel"><Head tag="ONLY YOU CAN SEE THIS" title="My confirmed registrations" detail="This view is filtered by your authenticated student ID on the backend." right={<Tag kind="good">{regs.length} confirmed</Tag>}/>{regs.length?regs.map(r=>{const e=events.find(x=>x.id===r.eventId);return <div className="wc-compact" key={r.id}><span>✓</span><div><strong>{e?.title||'Event unavailable or cancelled'}</strong><small>Confirmed {formatDate(r.confirmedAt)} · {e?formatDate(e.startsAt):'Contact organizer'}</small></div><Tag kind="good">Confirmed</Tag></div>}):<Empty title="Nothing registered yet" detail="Browse events and register during an open registration window."/>}<button className="wc-outline" onClick={()=>choose('events')}>Browse events ↗</button></section>;
}
export function Announcements({data}){
 const notes=data.announcements||[];
 return <section className="wc-panel"><Head tag="OFFICIAL UPDATES" title="Campus announcements" detail="Published messages available to your campus audience."/>{notes.length?<div className="wc-notice-grid">{notes.map(a=><article className="wc-announcement" key={a.id}><div><Tag kind="blue">{a.scope}</Tag><small>{formatDate(a.publishedAt)}</small></div><h3>{a.title}</h3><p>{a.body}</p></article>)}</div>:<Empty title="No announcements" detail="Relevant official notices will appear here once published."/>}</section>;
}
const blankEvent={title:'',description:'',venue:'',capacity:'50',registrationOpensAt:'',registrationClosesAt:'',startsAt:'',endsAt:'',societyId:''};
export function Organizer({data,profile,act,call,busy,showRoster,openRoster,rosters}){
 const faculty=isVerifiedFaculty(profile),manager=hasRole(profile,'societyManager');
 const managed=data.managed||[],organized=data.organized||[];
 const [eventForm,setEventForm]=useState(blankEvent);
 const [notice,setNotice]=useState(()=>({title:'',body:'',scope:faculty?'university':'society',societyId:''}));
 const update=(set,form,key,value)=>set({...form,[key]:value});
 async function createEvent(e){
  e.preventDefault();
  let body;try{body=buildEventPayload(eventForm);}catch(err){await act(()=>Promise.reject(err),'');return;}
  const success=await act(()=>call('/events',{method:'POST',body}),'Event published on CampusConnect.');
  if(success)setEventForm(blankEvent);
 }
 async function publish(e){
  e.preventDefault();
  let body;try{body=buildAnnouncementPayload(notice,profile);}catch(err){await act(()=>Promise.reject(err),'');return;}
  const success=await act(()=>call('/announcements',{method:'POST',body}),'Announcement published to the selected audience.');
  if(success)setNotice({title:'',body:'',scope:faculty?'university':'society',societyId:''});
 }
 return <div className="wc-stack">
  <div className="wc-metrics"><Metric icon="✦" label="Current permission" value={faculty?'Verified Faculty':'Society Manager'} detail="Approved on server"/><Metric icon="▣" label="Your events" value={organized.length} detail="Current organizer access"/><Metric icon="◈" label="Managed societies" value={manager?managed.length:'—'} detail="Active society assignments"/></div>
  <div className="wc-columns"><section className="wc-panel"><Head tag="EVENT PUBLISHING" title="Create an event" detail="Registration and event times must be chronological, with future deadlines."/>
   <form className="wc-form" onSubmit={createEvent}><label>Event title<input required minLength="3" maxLength="150" value={eventForm.title} onChange={e=>update(setEventForm,eventForm,'title',e.target.value)} placeholder="Software workshop"/></label>
    <label>Description<textarea required minLength="10" rows="3" value={eventForm.description} onChange={e=>update(setEventForm,eventForm,'description',e.target.value)} placeholder="What will students learn?"/></label>
    <div className="wc-form-pair"><label>Venue<input required value={eventForm.venue} onChange={e=>update(setEventForm,eventForm,'venue',e.target.value)} placeholder="CS Auditorium"/></label><label>Capacity<input required type="number" min="1" max="100000" value={eventForm.capacity} onChange={e=>update(setEventForm,eventForm,'capacity',e.target.value)}/></label></div>
    <label>Publish as<select value={eventForm.societyId} onChange={e=>update(setEventForm,eventForm,'societyId',e.target.value)}>{faculty?<option value="">Verified Faculty</option>:<option value="">Choose an assigned society</option>}{managed.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="wc-form-pair">{[['registrationOpensAt','Registration opens'],['registrationClosesAt','Registration closes'],['startsAt','Event starts'],['endsAt','Event ends']].map(([key,label])=><label key={key}>{label}<input type="datetime-local" required value={eventForm[key]} onChange={e=>update(setEventForm,eventForm,key,e.target.value)}/></label>)}</div>
    <button className="wc-primary" disabled={busy||(!faculty&&(!managed.length||!eventForm.societyId))}>Publish event ↗</button>
    {!faculty&&!managed.length&&<p className="wc-hint">You need an active society assignment before you can publish.</p>}
   </form></section>
   <section className="wc-panel"><Head tag="CAMPUS COMMUNICATION" title="Publish an announcement"/><form className="wc-form" onSubmit={publish}>
    <label>Title<input required minLength="3" value={notice.title} onChange={e=>update(setNotice,notice,'title',e.target.value)} placeholder="Academic notice"/></label>
    <label>Message<textarea required minLength="5" rows="5" value={notice.body} onChange={e=>update(setNotice,notice,'body',e.target.value)} placeholder="Write the message..."/></label>
    <label>Audience<select value={notice.scope} onChange={e=>setNotice({...notice,scope:e.target.value,societyId:''})}>{faculty&&<option value="university">University</option>}{faculty&&profile.departmentId&&<option value="department">My department</option>}{manager&&<option value="society">Assigned society</option>}</select></label>
    {notice.scope==='society'&&<label>Society<select value={notice.societyId} required onChange={e=>update(setNotice,notice,'societyId',e.target.value)}><option value="">Choose a society</option>{managed.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    <button disabled={busy||(!faculty&&!managed.length)} className="wc-primary">Publish notice ↗</button>
   </form></section></div>
  <section className="wc-panel"><Head tag="AUTHORIZED ORGANIZER" title="My managed events" detail="Individual attendee details are available only to the event's current organizer or Admin."/>
   {organized.length?<div className="wc-event-grid">{organized.map(e=><EventCard event={e} key={e.id} privateView profile={profile} showRoster={showRoster} openRoster={openRoster} rosters={rosters}/>)}</div>:<Empty title="No managed events" detail="Create an event above to manage registrations and see a private roster."/>}
  </section>
 </div>;
}

export {default as Admin} from './AdminPanel.jsx';
