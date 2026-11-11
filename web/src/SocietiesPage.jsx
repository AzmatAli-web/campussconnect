import React,{useEffect,useState} from 'react';
import {formatDate,hasRole} from './dashboard-domain.js';
import './societies.css';

const statuses={pending:'Awaiting review',active:'Member',rejected:'Declined',
 cancelled:'Cancelled',left:'Left society',removed:'Removed by manager'};
export default function SocietiesPage({profile,call,act,busy}){
 const student=hasRole(profile,'student'),manager=hasRole(profile,'societyManager');
 const [societies,setSocieties]=useState([]),[mine,setMine]=useState([]);
 const [managed,setManaged]=useState([]),[selected,setSelected]=useState('');
 const [queueStatus,setQueueStatus]=useState('pending'),[queue,setQueue]=useState([]);
 const [notes,setNotes]=useState({}),[loading,setLoading]=useState(true),[queueBusy,setQueueBusy]=useState(false);
 const [error,setError]=useState('');
 async function load(){
  setLoading(true);
  try{
   const [listed,owned,managedList]=await Promise.all([
    call('/societies?limit=100'),
    student?call('/me/society-memberships?limit=100'):Promise.resolve([]),
    manager?call('/me/managed-societies'):Promise.resolve([])
   ]);
   setSocieties(listed);
   setMine(owned);
   setManaged(managedList);
   setSelected(prev=>managedList.some(x=>x.id===prev)?prev:(managedList[0]?.id||''));
   setError('');
  }catch(e){setError(e.message||'Society information could not be loaded.');}
  finally{setLoading(false);}
 }
 async function loadQueue(societyId,status){
  if(!societyId)return setQueue([]);
  setQueueBusy(true);
  try{
   const rows=await call('/managed-societies/'+societyId+'/memberships?status='+status+'&limit=100');
   setQueue(rows);
   setError('');
  }catch(e){setQueue([]);setError(e.message||'Member records unavailable.');}
  finally{setQueueBusy(false);}
 }
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(manager&&selected)loadQueue(selected,queueStatus);},[selected,queueStatus,manager]);
 async function join(society){
  const ok=await act(()=>call('/societies/'+society.id+'/membership-requests',{
   method:'POST',body:{}
  }),'Membership request sent to the approved Society Manager.');
  if(ok)await load();
 }
 async function withdraw(membership){
  const ok=await act(()=>call('/me/society-memberships/'+membership.id+'/withdraw',{
   method:'POST',body:{}
  }),membership.status==='active'?'You left the society.':'Pending request cancelled.');
  if(ok)await load();
 }
 async function decision(item,action){
  const note=(notes[item.id]||'').trim();
  if(action!=='approve'&&note.length<5){
   setError('Enter a reason of at least five characters before rejecting or removing.');
   return;
  }
  const ok=await act(()=>call('/managed-societies/'+selected+'/memberships/'+item.id+'/review',{
   method:'POST',body:{action,...(note?{note}:{})}
  }),action==='approve'?'Member approved.':action==='reject'?'Request declined.':'Membership removed.');
  if(ok){setNotes(n=>({...n,[item.id]:''}));await loadQueue(selected,queueStatus);}
 }
 const bySociety=new Map(mine.map(x=>[x.societyId,x]));
 const societyName=id=>societies.find(x=>x.id===id)?.name||'Society no longer listed';
 return <div className="wc-stack wc-societies">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">CAMPUS COMMUNITY</span>
    <h2>Societies & membership</h2>
    <p>Find university-approved societies and request membership. Managers must review each request. Joining never grants administrative or publishing permissions.</p>
   </div></div>
   {error&&<p role="alert" className="wc-society-error">{error}</p>}
   {loading?<p>Loading university societies…</p>:
    societies.length?<div className="wc-society-grid">
     {societies.map(s=>{
      const m=bySociety.get(s.id);
      const mayRequest=!m||['rejected','cancelled','left'].includes(m.status);
      return <article key={s.id} className="wc-society-card">
       <span className="wc-kicker">VERIFIED UNIVERSITY SOCIETY</span>
       <h3>{s.name}</h3><p>{s.description}</p>
       {m&&<p className="wc-society-status">Your status: <strong>{statuses[m.status]||m.status}</strong></p>}
       {student&&<div className="wc-society-actions">
        <button className="wc-primary" disabled={busy||!mayRequest}
         onClick={()=>join(s)}>{mayRequest?'Request to join':m?.status==='removed'?'Contact campus Admin':'Already requested'}</button>
        {m&&['pending','active'].includes(m.status)&&<button className="wc-outline"
         disabled={busy} onClick={()=>withdraw(m)}>
         {m.status==='active'?'Leave society':'Cancel request'}</button>}
       </div>}
      </article>;
     })}
    </div>:<div className="wc-empty"><h3>No active societies available</h3>
     <p>Only authorized campus administrators or managers may register societies.</p></div>}
  </section>
  {student&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">STUDENT PRIVATE HISTORY</span>
    <h2>My memberships</h2>
    <p>Your requests and decisions are visible only to you and authorized society management.</p>
   </div><button className="wc-outline" onClick={load}>Refresh</button></div>
   {!mine.length?<div className="wc-empty"><h3>No membership history yet</h3></div>:
    <div className="wc-society-history">{mine.map(m=><article key={m.id} className="wc-society-history-item">
     <div><strong>{societyName(m.societyId)}</strong>
      <small>Requested {formatDate(m.requestedAt)}</small>
      {m.reviewNote&&<small>Manager note: {m.reviewNote}</small>}</div>
     <span className={'wc-tag '+(m.status==='active'?'good':m.status==='pending'?'warn':'neutral')}>
      {statuses[m.status]||m.status}</span>
    </article>)}</div>}
  </section>}
  {manager&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">AUTHORIZED SOCIETY MANAGER</span>
    <h2>Membership review</h2>
    <p>Only actively assigned managers can inspect member identities, approve requests or remove active members. Each decision is audited.</p>
   </div></div>
   {!managed.length?<p className="wc-society-error">No active society assignments. Ask the university Administrator to approve the manager role.</p>:<>
    <div className="wc-society-select">
     <label>Managed society<select value={selected} onChange={e=>setSelected(e.target.value)}>
      {managed.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
     <label>Show<select value={queueStatus} onChange={e=>setQueueStatus(e.target.value)}>
      <option value="pending">Pending requests</option><option value="active">Approved members</option>
     </select></label>
     <button type="button" className="wc-outline" onClick={()=>loadQueue(selected,queueStatus)}>Refresh queue</button>
    </div>
    {queueBusy?<p>Loading authorized member records…</p>:
     queue.length?<div className="wc-society-queue">{queue.map(m=><article key={m.id} className="wc-society-member">
      <div className="wc-society-membertop"><div>
       <strong>{m.student?.name||'Student'}</strong>
       <small>{m.student?.email||'Active student record unavailable'}</small>
       <small>Requested: {formatDate(m.requestedAt)}</small>
      </div><span className={'wc-tag '+(m.status==='active'?'good':'warn')}>{m.status}</span></div>
      <label>Decision reason (required for decline or removal)
       <textarea rows={2} maxLength={500} value={notes[m.id]||''}
        onChange={e=>setNotes(n=>({...n,[m.id]:e.target.value}))}/></label>
      <div className="wc-society-actions">
       {queueStatus==='pending'?<>
        <button className="wc-primary" disabled={busy} onClick={()=>decision(m,'approve')}>Approve</button>
        <button className="wc-outline dangerous" disabled={busy} onClick={()=>decision(m,'reject')}>Decline</button>
       </>:<button className="wc-outline dangerous" disabled={busy} onClick={()=>decision(m,'remove')}>Remove member</button>}
      </div>
     </article>)}</div>:<div className="wc-empty"><h3>No {queueStatus} members found</h3></div>}
   </>}
  </section>}
 </div>;
}
