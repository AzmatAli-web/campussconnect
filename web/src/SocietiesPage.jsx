import React,{useEffect,useState} from 'react';
import {formatDate,hasRole} from './dashboard-domain.js';
import './societies.css';

const statuses={pending:'Awaiting review',active:'Member',rejected:'Declined',
 cancelled:'Cancelled',left:'Left society',removed:'Removed by manager'};
const PAGE_SIZE=12;

function useSocietyPage(path,call,revision){
 const [retry,setRetry]=useState(0),[result,setResult]=useState(null);
 const key=JSON.stringify([path,revision,retry]);
 useEffect(()=>{
  if(!path)return;
  let current=true;
  call(path,{includeMeta:true}).then(({data,meta})=>{
   if(current)setResult({key,call,rows:data,total:meta?.total??data.length,error:''});
  }).catch(error=>{
   if(current)setResult({key,call,error:error.message||'This information could not be loaded.'});
  });
  return ()=>{current=false;};
 },[path,call,key]);
 const resolved=result?.key===key&&result.call===call?result:null;
 return {rows:resolved?.rows??[],total:resolved?.total??0,error:resolved?.error??'',
  loading:Boolean(path&&!resolved),reload:()=>setRetry(n=>n+1)};
}

function PageControls({label,page,total,onChange}){
 const last=Math.max(1,Math.ceil(total/PAGE_SIZE));
 if(last===1&&page===1)return null;
 return <nav aria-label={label} className="wc-society-pager">
  <button type="button" className="wc-outline" disabled={page===1}
   onClick={()=>onChange(Math.min(page-1,last))}>Previous</button>
  <span>Page {page} of {last}</span>
  <button type="button" className="wc-outline" disabled={page>=last}
   onClick={()=>onChange(page+1)}>Next</button>
 </nav>;
}

export default function SocietiesPage({profile,call,act,busy,revision}){
 const student=hasRole(profile,'student'),manager=hasRole(profile,'societyManager');
 const [query,setQuery]=useState(''),[browse,setBrowse]=useState({q:'',page:1});
 const [historyPage,setHistoryPage]=useState(1);
 const directoryParams=new URLSearchParams({page:browse.page,limit:PAGE_SIZE});
 if(browse.q)directoryParams.set('q',browse.q);
 if(student)directoryParams.set('includeMembership','1');
 const directory=useSocietyPage('/societies?'+directoryParams,call,revision);
 const history=useSocietyPage(student?
  '/me/society-memberships?includeSociety=1&limit='+PAGE_SIZE+'&page='+historyPage:null,call,revision);
 const assignments=useSocietyPage(manager?'/me/managed-societies':null,call,revision);
 const [selection,setSelection]=useState(''),[queueStatus,setQueueStatus]=useState('pending');
 const selected=assignments.rows.some(x=>x.id===selection)?selection:(assignments.rows[0]?.id??'');
 const queue=useSocietyPage(selected?
  '/managed-societies/'+selected+'/memberships?status='+queueStatus+'&limit=100':null,call,revision);
 const [notes,setNotes]=useState({}),[error,setError]=useState('');
 async function join(society){
  await act(()=>call('/societies/'+society.id+'/membership-requests',{
   method:'POST',body:{}
  }),'Membership request sent to the approved Society Manager.');
 }
 async function withdraw(membership){
  await act(()=>call('/me/society-memberships/'+membership.id+'/withdraw',{
   method:'POST',body:{}
  }),membership.status==='active'?'You left the society.':'Pending request cancelled.');
 }
 async function decision(item,action){
  setError('');
  const note=(notes[item.id]||'').trim();
  if(action!=='approve'&&note.length<5){
   setError('Enter a reason of at least five characters before rejecting or removing.');
   return;
  }
  const ok=await act(()=>call('/managed-societies/'+selected+'/memberships/'+item.id+'/review',{
   method:'POST',body:{action,...(note?{note}:{})}
  }),action==='approve'?'Member approved.':action==='reject'?'Request declined.':'Membership removed.');
  if(ok)setNotes(n=>({...n,[item.id]:''}));
 }
 return <div className="wc-stack wc-societies">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">CAMPUS COMMUNITY</span>
    <h2>Societies & membership</h2>
    <p>Find university-approved societies and request membership. Managers must review each request. Joining never grants administrative or publishing permissions.</p>
   </div></div>
   <form className="wc-society-search" onSubmit={event=>{
    event.preventDefault();setBrowse({q:query.trim(),page:1});
   }}>
    <label>Search societies<input type="search" value={query} maxLength={80}
     placeholder="Try robotics or debate" onChange={e=>setQuery(e.target.value)}/></label>
    <button type="submit" className="wc-primary">Search</button>
    {(query||browse.q)&&<button type="button" className="wc-outline" onClick={()=>{
     setQuery('');setBrowse({q:'',page:1});
    }}>Clear search</button>}
   </form>
   {directory.loading?<p role="status">Loading university societies…</p>:
    directory.error?<div className="wc-empty"><p role="alert">{directory.error}</p>
     <button type="button" className="wc-outline" onClick={directory.reload}>Retry directory</button></div>:<>
    <p role="status" className="wc-society-count">{directory.total} {directory.total===1?'society':'societies'} found</p>
    {directory.rows.length?<div className="wc-society-grid">
     {directory.rows.map(s=>{
      const m=s.membership;
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
    </div>:<div className="wc-empty"><h3>{browse.page>1?'No societies on this page':
     browse.q?'No societies match your search':'No active societies available'}</h3>
     {browse.q&&browse.page===1&&<p>Try a different name or keyword.</p>}</div>}
    <PageControls label="Society directory pages" page={browse.page} total={directory.total}
     onChange={page=>setBrowse(b=>({...b,page}))}/>
   </>}
  </section>
  {student&&<section className="wc-panel" aria-labelledby="wc-society-history-heading">
   <div className="wc-head"><div><span className="wc-kicker">STUDENT PRIVATE HISTORY</span>
    <h2 id="wc-society-history-heading">My memberships</h2>
    <p>Your requests and decisions are visible only to you and authorized society management.</p>
   </div><button className="wc-outline" disabled={history.loading} onClick={history.reload}>Refresh memberships</button></div>
   {history.loading?<p role="status">Loading your memberships…</p>:
    history.error?<p role="alert" className="wc-society-error">{history.error}</p>:<>
   {!history.rows.length?<div className="wc-empty"><h3>{historyPage>1?'No memberships on this page':'No membership history yet'}</h3></div>:
    <div className="wc-society-history">{history.rows.map(m=><article key={m.id} className="wc-society-history-item">
     <div><strong>{m.societyName||'Society no longer listed'}</strong>
      <small>Requested {formatDate(m.requestedAt)}</small>
      {m.reviewNote&&<small>Manager note: {m.reviewNote}</small>}</div>
     <span className={'wc-tag '+(m.status==='active'?'good':m.status==='pending'?'warn':'neutral')}>
      {statuses[m.status]||m.status}</span>
    </article>)}</div>}
   <PageControls label="Membership history pages" page={historyPage} total={history.total} onChange={setHistoryPage}/>
   </>}
  </section>}
  {manager&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">AUTHORIZED SOCIETY MANAGER</span>
    <h2>Membership review</h2>
    <p>Only actively assigned managers can inspect member identities, approve requests or remove active members. Each decision is audited.</p>
   </div></div>
   {(assignments.error||queue.error||error)&&<p role="alert" className="wc-society-error">
    {assignments.error||queue.error||error}</p>}
   {assignments.loading?<p role="status">Loading manager assignments…</p>:
    !assignments.rows.length?(!assignments.error&&<p className="wc-society-error">No active society assignments. Ask the university Administrator to approve the manager role.</p>):<>
    <div className="wc-society-select">
     <label>Managed society<select value={selected} onChange={e=>{setError('');setSelection(e.target.value);}}>
      {assignments.rows.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
     <label>Show<select value={queueStatus} onChange={e=>{setError('');setQueueStatus(e.target.value);}}>
      <option value="pending">Pending requests</option><option value="active">Approved members</option>
     </select></label>
     <button type="button" className="wc-outline" onClick={queue.reload}>Refresh queue</button>
    </div>
    {queue.loading?<p role="status">Loading authorized member records…</p>:
     queue.rows.length?<div className="wc-society-queue">{queue.rows.map(m=><article key={m.id} className="wc-society-member">
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
     </article>)}</div>:!queue.error&&<div className="wc-empty"><h3>No {queueStatus} members found</h3></div>}
   </>}
  </section>}
 </div>;
}
