import React,{Suspense,lazy,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {callApi} from './api.js';
import {timetablePreferenceKey} from './timetable-preference.js';
import {savedNotesKey} from './saved-notes.js';
import {plannerKey} from './assignment-planner.js';
import {activeRoles,displayRole,hasRole,navigationFor,registrationAttemptKey} from './dashboard-domain.js';
import {Overview,Events,Registrations,Announcements,Organizer} from './WorkspacePages.jsx';
import './workspace.css';
import './timetable.css';


import './resources.css';

import './complaints.css';

import './fees.css';

// Feature tabs are split into on-demand JS chunks so Student login does not
// download Staff/Admin or resource-management interfaces unnecessarily.
const TimetablePage=lazy(()=>import('./TimetablePage.jsx'));
const AcademicResourcesPage=lazy(()=>import('./AcademicResourcesPage.jsx'));
const ComplaintsPage=lazy(()=>import('./ComplaintsPage.jsx'));
const FeesPage=lazy(()=>import('./FeesPage.jsx'));
const MarketplacePage=lazy(()=>import('./MarketplacePage.jsx'));
const LostFoundPage=lazy(()=>import('./LostFoundPage.jsx'));
const SocietiesPage=lazy(()=>import('./SocietiesPage.jsx'));
const NotificationsPage=lazy(()=>import('./NotificationsPage.jsx'));
const AssignmentPlanner=lazy(()=>import('./AssignmentPlanner.jsx'));
const StudentOverview=lazy(()=>import('./StudentOverview.jsx'));
const StudyPlanner=lazy(()=>import('./StudyPlanner.jsx'));
const CampusCalendar=lazy(()=>import('./CampusCalendar.jsx'));
const Admin=lazy(()=>import('./AdminPanel.jsx'));

const MessagesPage=lazy(()=>import('./MessagesPage.jsx'));
const titles={messages:'Private messages',profile:'My profile',overview:'Your campus at a glance',events:'Explore campus events',registrations:'My registrations',announcements:'Campus announcements',timetable:'Official academic timetable',resources:'Academic learning resources',assignments:'Assignment Tracker',study:'Weekly Study Planner',calendar:'My Campus Calendar',marketplace:'Student Marketplace',lostfound:'Campus Lost & Found',societies:'Campus Society Memberships',notifications:'Campus Notifications',complaints:'Private complaints & tracking',fees:'Fees & payment records',organizer:'Organizer studio',admin:'Campus administration'};
const requestsFor=(tab,profile)=>{
 const requested={};
 if(['overview','admin'].includes(tab))requested.events='/events?limit=50';
 if(tab==='overview')requested.announcements='/announcements?limit=50';
 if(hasRole(profile,'student')&&['overview','events'].includes(tab))requested.registrations='/me/event-registrations?limit=100';
 if(tab==='organizer'){
  requested.organized='/me/organized-events?limit=100';
  if(hasRole(profile,'societyManager'))requested.managed='/me/managed-societies';
 }
 if(tab==='admin'){requested.users='/admin/users?limit=100';requested.societies='/societies?limit=100';requested.audit='/admin/audit-logs?limit=50';}
 return requested;
};

export default function CampusWorkspace({user,profile,onSignOut,onProfileChange}){
 const nav=useMemo(()=>navigationFor(profile),[profile]);
 const [tab,setTab]=useState('overview'),[data,setData]=useState({}),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[revision,setRevision]=useState(0),[menu,setMenu]=useState(false);
 const [rosters,setRosters]=useState({}),[openRoster,setOpenRoster]=useState(null);
 const idempotencyKeys=useRef(new Map());
 const menuButton=useRef(null),sidebar=useRef(null),pageHeading=useRef(null),focusHeading=useRef(false);
 const activeTab=nav.some(item=>item.id===tab)?tab:'overview';
 const call=useCallback((path,opts)=>callApi(path,user,opts),[user]);
 useEffect(()=>{
  if(profile.status!=='active'){setLoading(false);return;}
  let current=true;
  setLoading(true);
  const requests=requestsFor(activeTab,profile);
  (async()=>{
   const entries=Object.entries(requests);
   const results=await Promise.allSettled(entries.map(([,url])=>callApi(url,user)));
   if(!current)return;
   const next={};const failures=[];
   results.forEach((result,i)=>{
    const name=entries[i][0];
    if(result.status==='fulfilled')next[name]=Array.isArray(result.value)?result.value:[];
    else failures.push(name+': '+(result.reason?.message||'Request failed'));
   });
   setData(previous=>({...previous,...next}));
   if(failures.length)setNotice({kind:'error',text:failures.join(' | ')});
   setLoading(false);
  })();
  return ()=>{current=false;};
 },[activeTab,profile,user,revision]);
 async function act(action,success){
  if(busy)return false;
  setBusy(true);setNotice(null);
  try{
   await action();
   setNotice({kind:'success',text:success});
   setRevision(n=>n+1);
   return true;
  }catch(err){setNotice({kind:'error',text:err?.message||'Request failed.'});return false;}
  finally{setBusy(false);}
 }
 async function register(event){
  if(!hasRole(profile,'student')||busy)return;
  const key=registrationAttemptKey(idempotencyKeys.current,event.id);
  const done=await act(()=>call('/events/'+event.id+'/registrations',{
   method:'POST',headers:{'Idempotency-Key':key},
   body:{universityEmail:profile.emailNormalized,...(profile.registrationNo?{registrationNo:profile.registrationNo}:{})}
  }),'Registration confirmed. Your personal attendance is private.');
  // Network errors leave the original idempotency key in place for retry.
  if(done)idempotencyKeys.current.delete(event.id);
 }
 async function showRoster(eventId){
  if(openRoster===eventId){setOpenRoster(null);return;}
  setOpenRoster(eventId);
  if(rosters[eventId])return;
  try{
   const attendees=await call('/events/'+eventId+'/registrations?limit=100');
   setRosters(prev=>({...prev,[eventId]:attendees}));
  }catch(err){setOpenRoster(null);setNotice({kind:'error',text:err?.message||'Not authorized to view attendees'});}
 }
 function closeMenu(){setMenu(false);menuButton.current?.focus();}
 useEffect(()=>{
  if(menu)sidebar.current?.querySelector('nav button[aria-current="page"]')?.focus();
  else if(focusHeading.current){focusHeading.current=false;pageHeading.current?.focus();}
 },[menu,activeTab]);
 function choose(next){
  if(menu)focusHeading.current=true;
  setTab(next);setMenu(false);setNotice(null);setOpenRoster(null);
 }
 async function refreshProfile(){
  await act(async()=>{const next=await call('/me');onProfileChange(next);},'Account permissions refreshed.');
 }
 const timetableKey=timetablePreferenceKey(profile);
 const notesKey=savedNotesKey(profile);
 const assignmentKey=plannerKey(profile);
 const props={data,profile,user,busy,call,act,register,showRoster,openRoster,rosters,choose};
 const page={
  messages:<MessagesPage key={profile._id} user={user} call={call}/>,
  overview:hasRole(profile,'student')?<StudentOverview key={assignmentKey??'overview'} assignmentKey={assignmentKey} preferenceKey={timetableKey} {...props}/>:<Overview {...props}/>,
  events:<Events {...props} busy={busy||loading} revision={revision}/>,
  registrations:<Registrations {...props} revision={revision}/>,
  announcements:<Announcements {...props} revision={revision}/>,
  timetable:<TimetablePage key={timetableKey??'timetable'} preferenceKey={timetableKey} {...props}/>,
  resources:<AcademicResourcesPage key={notesKey??'resources'} notesKey={notesKey} {...props}/>,
  assignments:<AssignmentPlanner key={assignmentKey??'assignments'} storageKey={assignmentKey}/>,
  study:<StudyPlanner key={assignmentKey??'study'} assignmentKey={assignmentKey}/>,
  calendar:<CampusCalendar key={assignmentKey??'calendar'} assignmentKey={assignmentKey} preferenceKey={timetableKey} call={call}/>,
  marketplace:<MarketplacePage {...props}/>,
  lostfound:<LostFoundPage {...props}/>,
  societies:<SocietiesPage key={user.uid??profile.id} {...props} revision={revision}/>,
  notifications:<NotificationsPage {...props}/>,
  complaints:<ComplaintsPage {...props}/>,
  fees:<FeesPage {...props}/>,
  profile:<form className="wc-panel wc-stack" key={profile._id} onSubmit={event=>{
   event.preventDefault();
   const values=new FormData(event.currentTarget);
   const body={fullName:values.get('fullName').trim(),registrationNo:values.get('registrationNo').trim()||null};
   act(async()=>onProfileChange(await call('/me',{method:'PATCH',body})),'Profile saved.');
  }}>
   <p>{profile.emailNormalized}</p>
   <label>Full name<input required minLength={2} maxLength={120} name="fullName" defaultValue={profile.fullName}/></label>
   <label>Registration number (optional)<input minLength={3} maxLength={40} name="registrationNo" defaultValue={profile.registrationNo||''}/></label>
   <button className="wc-primary" disabled={busy}>Save profile</button>
  </form>,
  organizer:<Organizer {...props}/>,
  admin:<Admin {...props}/>
 }[activeTab];
 if(profile.status!=='active')return <div className="wc-locked"><div className="wc-locked-card"><div className="wc-logo">C·</div><h1>Campus account pending</h1><p>Your university profile is {profile.status}. Privileged features will remain unavailable until your account is approved.</p><button onClick={refreshProfile}>Check approval status</button><button onClick={onSignOut}>Sign out</button>{notice&&<p>{notice.text}</p>}</div></div>;
 return <div className="wc-layout">
  <aside id="campus-sidebar" ref={sidebar} className={'wc-sidebar '+(menu?'open':'')}
   onKeyDown={event=>{if(menu&&event.key==='Escape'){event.preventDefault();closeMenu();}}}>
   <div className="wc-brand"><div className="wc-logo">C·</div><div><strong>CampusConnect</strong><small>COMSATS Abbottabad</small></div></div>
   <span className="wc-side-label">YOUR WORKSPACE</span>
   <button type="button" className="wc-close-menu" onClick={closeMenu}>Close campus menu</button>
   <nav aria-label="Campus workspace">{nav.map(item=><button aria-current={item.id===activeTab?'page':undefined} className={item.id===activeTab?'selected':''} key={item.id} onClick={()=>choose(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
   <div className="wc-sidebar-footer"><small>University identity verified</small><div className="wc-account"><span>{profile.fullName?.slice(0,1).toUpperCase()||'U'}</span><div><strong>{profile.fullName}</strong><small>{displayRole(profile)}</small></div></div><button onClick={onSignOut}>↪ Sign out</button></div>
  </aside>
  <div className="wc-main">
   <header className="wc-topbar"><button type="button" ref={menuButton} className="wc-mobile-menu" aria-label="Campus menu" aria-controls="campus-sidebar" aria-expanded={menu} onClick={()=>menu?closeMenu():setMenu(true)}>☰</button><span>UNIVERSITY PORTAL <b>/</b> {activeTab.toUpperCase()}</span><div><span className="wc-auth-dot">● Verified session</span><button className="wc-refresh" onClick={()=>setRevision(n=>n+1)}>↻ Refresh</button></div></header>
   <main className="wc-content">
    <div className="wc-hero"><div><span>CAMPUSCONNECT / AUTHENTICATED WORKSPACE</span><h1 ref={pageHeading} tabIndex={-1}>{titles[activeTab]}</h1><p>{activeTab==='assignments'?'Keep track of your own deadlines and completed work.':'Information from your campus backend, protected by your verified Firebase session.'}</p></div><div className="wc-hero-mark" aria-hidden="true">✧</div></div>
    {notice&&<div role="status" className={'wc-notice '+notice.kind}><strong>{notice.kind==='success'?'✓':'!'}</strong><p>{notice.text}</p><button aria-label="Dismiss message" onClick={()=>setNotice(null)}>×</button></div>}
    {loading&&!['events','registrations','announcements','societies','assignments'].includes(activeTab)?<div className="wc-loading"><div/><div/><div/></div>:
     <Suspense fallback={<div role="status" className="wc-loading"><div/><div/><div/></div>}>
      {page}
     </Suspense>}
    <footer className="wc-footer">CampusConnect · Role-based campus services · Registration identities remain private</footer>
   </main>
  </div>
 </div>;
}
