import React,{useEffect,useState} from 'react';
import {callApi} from './api.js';
import {canExportEvent,downloadEventCalendar} from './event-calendar.js';
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
    {!privateView&&canExportEvent(event)&&<button type="button" className="wc-outline" onClick={()=>downloadEventCalendar(event)}>Add to calendar</button>}
    {privateView&&<button className="wc-outline" onClick={()=>showRoster(event.id)}>{openRoster===event.id?'Hide private roster':'View private attendees'}</button>}
   </div>
   {own&&!privateView&&<p className="wc-private-note">Your registration is visible to you and authorized organizers only.</p>}
   {privateView&&openRoster===event.id&&<div className="wc-roster"><strong>Restricted attendee list</strong><small>Available only to this event's current organizer or an Administrator.</small>{!rosters[event.id]?<p>Loading authorized attendee records…</p>:rosters[event.id].length===0?<p>No registered attendees yet.</p>:<ul>{rosters[event.id].map(person=><li key={person.id}><strong>{person.studentName||'Attendee'}</strong><small>{person.universityEmail||''} {person.registrationNo||''}</small>{person.checkedInAt&&<small>Checked in {formatDate(person.checkedInAt)}</small>}</li>)}</ul>}</div>}
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
const pageSize=12;
export function Events({data,profile,user,busy,register,revision}){
 const [input,setInput]=useState('');
 const [search,setSearch]=useState('');
 const [when,setWhen]=useState('upcoming');
 const [page,setPage]=useState(1);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState(null);
 const key=JSON.stringify([search,when,page,revision,retry]);
 const current=result?.key===key?result:null;
 const regs=data.registrations||[];
 const reload=()=>setRetry(n=>n+1);
 useEffect(()=>{
  let active=true;
  const params=new URLSearchParams({when,page:String(page),limit:String(pageSize)});
  if(search)params.set('q',search);
  callApi('/events?'+params,user,{includeMeta:true})
   .then(({data:events,meta})=>{
    if(!active)return;
    if(page>1&&Number.isInteger(meta?.total)&&meta.total<=(page-1)*pageSize){
     setPage(Math.max(1,Math.ceil(meta.total/pageSize)));
     return;
    }
    if(!Array.isArray(events))throw new Error('Invalid events response');
    setResult({key,events,total:Number.isInteger(meta?.total)?meta.total:events.length});
   })
   .catch(()=>{if(active)setResult({key,error:true});});
  return()=>{active=false;};
 },[key,user]);
 return <section className="wc-panel"><Head tag="CAMPUS CALENDAR" title="Published events"
  detail="Search by title or venue. Other students’ names and registrations are private."/>
  <form className="wc-resource-filter" onSubmit={e=>{e.preventDefault();setSearch(input.trim());setPage(1);reload();}}>
   <label>Search events<input value={input} onChange={e=>setInput(e.target.value)} maxLength={80} placeholder="Workshop or auditorium"/></label>
   <label>Event timing<select value={when} onChange={e=>{setWhen(e.target.value);setPage(1);}}>
    <option value="upcoming">Upcoming and in progress</option><option value="past">Past</option><option value="all">All published events</option>
   </select></label>
   <button className="wc-primary" type="submit">Search</button>
   <button className="wc-outline" type="button" onClick={()=>{setInput('');setSearch('');setWhen('upcoming');setPage(1);reload();}}>Clear filters</button>
  </form>
  {!current?<p role="status">Loading events…</p>:current.error?
   <p role="alert">Could not load events. <button type="button" className="wc-outline" onClick={reload}>Retry</button></p>:
   <>
    {current.events.length?<div className="wc-event-grid">{current.events.map(event=><EventCard key={event.id} event={event} registrations={regs} profile={profile} busy={busy} register={register}/>)}</div>:
     <Empty title="No matching events" detail="Try another search or change the event timing filter."/>}
    <nav className="wc-event-pagination" aria-label="Event pages">
     <button type="button" className="wc-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button>
     <span role="status">Page {page} of {Math.max(1,Math.ceil(current.total/pageSize))} · {current.total} events</span>
     <button type="button" className="wc-outline" disabled={page*pageSize>=current.total} onClick={()=>setPage(p=>p+1)}>Next</button>
    </nav>
   </>}
 </section>;
}
function Ticket({id,user}){
 const [image,setImage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function issue(){
  setBusy(true);setError('');setImage(null);
  try{setImage(await callApi('/me/event-registrations/'+id+'/ticket',user,{method:'POST'}));}
  catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <div><button disabled={busy} onClick={issue}>{image?'Refresh QR ticket':'Show QR ticket'}</button>
  {image&&<div><img width="200" alt="Your private event check-in ticket" src={image.image}/>
   <small>Valid until {formatDate(image.expiresAt)}</small></div>}{error&&<p role="alert">{error}</p>}</div>;
}
function CheckIn({eventId,call}){
 const [code,setCode]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){
  e.preventDefault();setBusy(true);setStatus('');
  try{await call('/events/'+eventId+'/check-in',{method:'POST',body:{code:code.trim()}});setStatus('Attendance recorded.');setCode('');}
  catch(err){setStatus(err.message);}finally{setBusy(false);}
 }
 return <form onSubmit={submit}><label>Scan ticket with a QR reader<input required autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label>
  <button disabled={busy}>Check in</button><p role="status">{status}</p></form>;
}
export function Registrations({user,choose,revision}){
 const [page,setPage]=useState(1);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState(null);
 const key=JSON.stringify([page,revision,retry]);
 const current=result?.key===key?result:null;
 useEffect(()=>{
  let active=true;
  const query=new URLSearchParams({page:String(page),limit:String(pageSize),includeEvent:'1'});
  callApi('/me/event-registrations?'+query,user,{includeMeta:true})
   .then(({data:rows,meta})=>{
    if(!active)return;
    if(!Array.isArray(rows))throw new Error('Invalid registration response');
    const total=Number.isInteger(meta?.total)?meta.total:rows.length;
    if(page>1&&total<=(page-1)*pageSize){
     setPage(Math.max(1,Math.ceil(total/pageSize)));
     return;
    }
    setResult({key,rows,total});
   })
   .catch(()=>{if(active)setResult({key,error:true});});
  return()=>{active=false;};
 },[key,user]);
 return <section className="wc-panel">
  <Head tag="PRIVATE REGISTRATION HISTORY" title="My confirmed registrations"
   detail="Your own confirmations, including past events and events cancelled by the campus."/>
  {!current?<p role="status">Loading registrations…</p>:current.error?
   <p role="alert">Could not load registrations. <button type="button" className="wc-outline" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:
   current.rows.length?<>
    {current.rows.map(receipt=>{
     const event=receipt.event;
     const cancelled=event?.status==='cancelled';
     const ended=event?.status==='completed'||Date.parse(event?.endsAt)<=Date.now();
     const state=!event?'Event unavailable':cancelled?'Event cancelled':ended?'Past event':
      Date.parse(event.startsAt)<=Date.now()?'In progress':'Upcoming';
     return <div className="wc-compact wc-registration-row" key={receipt.id}>
      <span aria-hidden="true">✓</span>
      <div>
       <strong>{event?.title||'Event details unavailable'}</strong>
       {event&&<small>{formatDate(event.startsAt)} · {event.venue}</small>}
       <small>Registration confirmed {formatDate(receipt.confirmedAt)}</small>
       {event&&!cancelled&&!ended&&<Ticket id={receipt.id} user={user}/>}
      </div>
      <Tag kind={cancelled?'warn':state==='Upcoming'?'good':'neutral'}>{state}</Tag>
     </div>;
    })}
    <nav className="wc-event-pagination" aria-label="Registration pages">
     <button type="button" className="wc-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button>
     <span role="status">Page {page} of {Math.max(1,Math.ceil(current.total/pageSize))} · {current.total} registrations</span>
     <button type="button" className="wc-outline" disabled={page*pageSize>=current.total} onClick={()=>setPage(p=>p+1)}>Next</button>
    </nav>
   </>:<Empty title="Nothing registered yet" detail="Browse events and register during an open registration window."/>}
  <button type="button" className="wc-outline" onClick={()=>choose('events')}>Browse events ↗</button>
 </section>;
}
const announcementScopes={all:'All notices',university:'University',department:'My department',society:'My societies'};
export function Announcements({user,revision}){
 const [input,setInput]=useState('');
 const [search,setSearch]=useState('');
 const [scope,setScope]=useState('all');
 const [page,setPage]=useState(1);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState(null);
 const key=JSON.stringify([search,scope,page,revision,retry]);
 const current=result?.key===key?result:null;
 const reload=()=>setRetry(n=>n+1);
 useEffect(()=>{
  let active=true;
  const query=new URLSearchParams({scope,page:String(page),limit:String(pageSize)});
  if(search)query.set('q',search);
  callApi('/announcements?'+query,user,{includeMeta:true})
   .then(({data:notes,meta})=>{
    if(!active)return;
    if(!Array.isArray(notes))throw new Error('Invalid announcement response');
    const total=Number.isInteger(meta?.total)?meta.total:notes.length;
    if(page>1&&total<=(page-1)*pageSize){
     setPage(Math.max(1,Math.ceil(total/pageSize)));
     return;
    }
    setResult({key,notes,total});
   })
   .catch(()=>{if(active)setResult({key,error:true});});
  return()=>{active=false;};
 },[key,user]);
 return <section className="wc-panel">
  <Head tag="OFFICIAL UPDATES" title="Campus announcements" detail="Search by title or message, or filter by audience. You only see notices you have access to."/>
  <form className="wc-resource-filter" onSubmit={e=>{e.preventDefault();setSearch(input.trim());setPage(1);reload();}}>
   <label>Search announcements<input value={input} onChange={e=>setInput(e.target.value)} maxLength={80} placeholder="Exam schedule or orientation"/></label>
   <label>Audience<select aria-label="Audience" value={scope} onChange={e=>{setScope(e.target.value);setPage(1);}}>
    {Object.entries(announcementScopes).map(([value,label])=><option value={value} key={value}>{label}</option>)}
   </select></label>
   <button className="wc-primary" type="submit">Search</button>
   <button className="wc-outline" type="button" onClick={()=>{setInput('');setSearch('');setScope('all');setPage(1);reload();}}>Clear filters</button>
  </form>
  {!current?<p role="status">Loading announcements…</p>:current.error?
   <p role="alert">Could not load announcements. <button type="button" className="wc-outline" onClick={reload}>Retry</button></p>:
   current.notes.length?<>
    <div className="wc-notice-grid">{current.notes.map(a=><article className="wc-announcement" key={a.id}>
     <div><Tag kind="blue">{a.scope==='department'?'Department':a.scope==='society'?'Society':'University'}</Tag><small>{formatDate(a.publishedAt)}</small></div>
     <h3>{a.title}</h3><p>{a.body}</p>
    </article>)}</div>
    <nav className="wc-event-pagination" aria-label="Announcement pages">
     <button type="button" className="wc-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button>
     <span role="status">Page {page} of {Math.max(1,Math.ceil(current.total/pageSize))} · {current.total} notices</span>
     <button type="button" className="wc-outline" disabled={page*pageSize>=current.total} onClick={()=>setPage(p=>p+1)}>Next</button>
    </nav>
   </>:<Empty title="No matching announcements" detail="Try another search or change the audience filter."/>}
 </section>;
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
   {organized.length?<div className="wc-event-grid">{organized.map(e=><div key={e.id}><EventCard event={e} privateView profile={profile} showRoster={showRoster} openRoster={openRoster} rosters={rosters}/><CheckIn call={call} eventId={e.id}/></div>)}</div>:<Empty title="No managed events" detail="Create an event above to manage registrations and see a private roster."/>}
  </section>
 </div>;
}

