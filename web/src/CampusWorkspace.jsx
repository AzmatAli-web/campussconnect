import React,{useEffect,useMemo,useRef,useState} from 'react';
import {callApi} from './api.js';
import {activeRoles,displayRole,hasRole,navigationFor,registrationAttemptKey} from './dashboard-domain.js';
import {Overview,Events,Registrations,Announcements,Organizer,Admin} from './WorkspacePages.jsx';
import './workspace.css';

const titles={overview:'Your campus at a glance',events:'Explore campus events',registrations:'My registrations',announcements:'Campus announcements',organizer:'Organizer studio',admin:'Campus administration'};
const requestsFor=(tab,profile)=>{
 const requested={};
 if(['overview','events','registrations','admin'].includes(tab))requested.events='/events?limit=50';
 if(['overview','announcements'].includes(tab))requested.announcements='/announcements?limit=50';
 if(hasRole(profile,'student')&&['overview','events','registrations'].includes(tab))requested.registrations='/me/event-registrations?limit=100';
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
 const activeTab=nav.some(item=>item.id===tab)?tab:'overview';
 const call=(path,opts)=>callApi(path,user,opts);
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
 function choose(next){setTab(next);setMenu(false);setNotice(null);setOpenRoster(null);}
 async function refreshProfile(){
  await act(async()=>{const next=await call('/me');onProfileChange(next);},'Account permissions refreshed.');
 }
 const props={data,profile,busy,call,act,register,showRoster,openRoster,rosters,choose};
 const page={
  overview:<Overview {...props}/>,
  events:<Events {...props}/>,
  registrations:<Registrations {...props}/>,
  announcements:<Announcements {...props}/>,
  organizer:<Organizer {...props}/>,
  admin:<Admin {...props}/>
 }[activeTab];
 if(profile.status!=='active')return <div className="wc-locked"><div className="wc-locked-card"><div className="wc-logo">C·</div><h1>Campus account pending</h1><p>Your university profile is {profile.status}. Privileged features will remain unavailable until your account is approved.</p><button onClick={refreshProfile}>Check approval status</button><button onClick={onSignOut}>Sign out</button>{notice&&<p>{notice.text}</p>}</div></div>;
 return <div className="wc-layout">
  <aside className={'wc-sidebar '+(menu?'open':'')}>
   <div className="wc-brand"><div className="wc-logo">C·</div><div><strong>CampusConnect</strong><small>COMSATS Abbottabad</small></div></div>
   <span className="wc-side-label">YOUR WORKSPACE</span>
   <nav>{nav.map(item=><button className={item.id===activeTab?'selected':''} key={item.id} onClick={()=>choose(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
   <div className="wc-sidebar-footer"><small>University identity verified</small><div className="wc-account"><span>{profile.fullName?.slice(0,1).toUpperCase()||'U'}</span><div><strong>{profile.fullName}</strong><small>{displayRole(profile)}</small></div></div><button onClick={onSignOut}>↪ Sign out</button></div>
  </aside>
  <div className="wc-main">
   <header className="wc-topbar"><button className="wc-mobile-menu" onClick={()=>setMenu(!menu)}>☰</button><span>UNIVERSITY PORTAL <b>/</b> {activeTab.toUpperCase()}</span><div><span className="wc-auth-dot">● Verified session</span><button className="wc-refresh" onClick={()=>setRevision(n=>n+1)}>↻ Refresh</button></div></header>
   <main className="wc-content">
    <div className="wc-hero"><div><span>CAMPUSCONNECT / AUTHENTICATED WORKSPACE</span><h1>{titles[activeTab]}</h1><p>Information from your campus backend, protected by your verified Firebase session.</p></div><div className="wc-hero-mark">✧</div></div>
    {notice&&<div role="status" className={'wc-notice '+notice.kind}><strong>{notice.kind==='success'?'✓':'!'}</strong><p>{notice.text}</p><button aria-label="Dismiss message" onClick={()=>setNotice(null)}>×</button></div>}
    {loading?<div className="wc-loading"><div/><div/><div/></div>:page}
    <footer className="wc-footer">CampusConnect · Role-based campus services · Registration identities remain private</footer>
   </main>
  </div>
 </div>;
}
