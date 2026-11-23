import React,{useEffect,useState} from 'react';
import {hasRole} from './dashboard-domain.js';

const categories={academic:'Academic',facilities:'Facilities',fees:'Fees',other:'Other'};
const statuses={submitted:'Submitted',in_review:'In review',resolved:'Resolved',closed:'Closed'};
const nextStatus={submitted:'in_review',in_review:'resolved',resolved:'closed',closed:null};
const empty={category:'academic',title:'',description:''};

export default function ComplaintsPage({profile,call,act,busy}){
 const student=hasRole(profile,'student');
 const reviewer=hasRole(profile,'staff')||hasRole(profile,'admin');
 const [own,setOwn]=useState([]);
 const [queue,setQueue]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [form,setForm]=useState(empty);
 const [answers,setAnswers]=useState({});
 async function load(){
  setLoading(true);
  try{
   const [mine,staff]=await Promise.all([
    student?call('/me/complaints?limit=100'):Promise.resolve([]),
    reviewer?call('/staff/complaints?limit=100'):Promise.resolve([])
   ]);
   setOwn(Array.isArray(mine)?mine:[]);
   setQueue(Array.isArray(staff)?staff:[]);
   setError('');
  }catch(err){setError(err.message||'Complaint records could not be loaded.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 async function submit(e){
  e.preventDefault();
  const ok=await act(()=>call('/complaints',{method:'POST',body:form}),
   'Complaint submitted. Track its status below.');
  if(ok){setForm(empty);await load();}
 }
 async function update(item){
  const target=nextStatus[item.status];
  if(!target)return;
  const staffResponse=(answers[item.id]??item.staffResponse??'').trim();
  if(target==='resolved'&&!staffResponse){
   setError('Add a response before marking a complaint resolved.');return;
  }
  const ok=await act(()=>call('/staff/complaints/'+item.id,{
    method:'PATCH',body:{status:target,...(staffResponse?{staffResponse}:{})}
  }),'Complaint status updated.');
  if(ok)await load();
 }
 function card(item,canUpdate=false){
  const next=nextStatus[item.status];
  const currentText=answers[item.id]??item.staffResponse??'';
  return <article className="wc-complaint" key={item.id}>
   <div className="wc-complaint-top">
    <span className="wc-tag blue">{categories[item.category]||item.category}</span>
    <span className={'wc-tag '+(item.status==='resolved'||item.status==='closed'?'good':'warn')}>
      {statuses[item.status]||item.status}
    </span>
   </div>
   <h3>{item.title}</h3>
   <p>{item.description}</p>
   {item.staffResponse&&<div className="wc-complaint-response">
    <strong>Staff response</strong><p>{item.staffResponse}</p>
   </div>}
   <small>Submitted {new Date(item.createdAt).toLocaleDateString('en-PK')}</small>
   {canUpdate&&next&&<div className="wc-complaint-actions">
    <label>Response for student
      <textarea maxLength={2000} rows={3} value={currentText}
        placeholder="Write an update visible to the student"
        onChange={e=>setAnswers(s=>({...s,[item.id]:e.target.value}))}/>
    </label>
    <button className="wc-outline" disabled={busy} onClick={()=>update(item)}>
      {statuses[next]} →
    </button>
   </div>}
  </article>;
 }
 return <div className="wc-stack">
  <section className="wc-panel">
   <div className="wc-head"><div>
    <span className="wc-kicker">PRIVATE STUDENT SUPPORT</span>
    <h2>Complaints & tracking</h2>
    <p>Submit campus issues and track their progress. Complaint text is not published to other students. Authorized campus Staff and Admin can review submissions.</p>
   </div></div>
   <p className="wc-complaint-hint">For urgent safety incidents, contact campus security or emergency services directly. This form is not an emergency channel.</p>
   {error&&<p className="wc-complaint-error" role="alert">{error}</p>}
   {student&&<form className="wc-form wc-complaint-form" onSubmit={submit}>
    <label>Category<select value={form.category}
      onChange={e=>setForm(s=>({...s,category:e.target.value}))}>
      {Object.entries(categories).map(([value,name])=>
       <option value={value} key={value}>{name}</option>)}
    </select></label>
    <label>Subject<input minLength={5} maxLength={140} required value={form.title}
      placeholder="Describe the problem briefly"
      onChange={e=>setForm(s=>({...s,title:e.target.value}))}/></label>
    <label>Details<textarea required minLength={15} maxLength={3000}
      rows={4} value={form.description}
      placeholder="What happened and what would help?"
      onChange={e=>setForm(s=>({...s,description:e.target.value}))}/></label>
    <button type="submit" className="wc-primary" disabled={busy}>
      {busy?'Submitting…':'Submit private complaint'}
    </button>
   </form>}
  </section>
  {student&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">MY SUBMISSIONS</span>
    <h2>My complaint history</h2>
    <p>Only complaints submitted by your verified account appear here.</p>
   </div><button className="wc-outline" onClick={load}>Refresh</button></div>
   {loading?<p>Loading complaints…</p>:own.length?
    <div className="wc-complaint-grid">{own.map(x=>card(x))}</div>:
    <div className="wc-empty"><h3>No complaints submitted</h3>
      <p>Submitted issues and responses will appear here.</p></div>}
  </section>}
  {reviewer&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">STAFF / ADMIN ONLY</span>
    <h2>Review queue</h2>
    <p>Review campus issues, provide a response, and advance status. This queue is protected by server-side role checks.</p>
   </div><button className="wc-outline" onClick={load}>Refresh</button></div>
   {loading?<p>Loading queue…</p>:queue.length?
    <div className="wc-complaint-grid">{queue.map(x=>card(x,true))}</div>:
    <div className="wc-empty"><h3>No complaints in the queue</h3></div>}
  </section>}
 </div>;
}
