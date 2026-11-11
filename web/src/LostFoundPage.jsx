import React,{useEffect,useState} from 'react';
import {hasRole} from './dashboard-domain.js';
import './lost-found.css';

const kinds=['lost','found'];
const categories=['electronics','documents','keys','clothing','accessories','other'];
const empty={kind:'lost',title:'',description:'',category:'electronics',locationText:'',
 contactPreference:'helpdesk',occurredAt:''};
function Heading({tag,title,detail}){
 return <div className="wc-head"><div><span className="wc-kicker">{tag}</span>
  <h2>{title}</h2><p>{detail}</p></div></div>;
}
function Report({item,own,admin,busy,contact,edit,resolve,remove}){
 return <article className="wc-lost-item">
  <div className="wc-lost-top"><span className={'wc-tag '+(item.kind==='lost'?'warn':'good')}>
   {item.kind==='lost'?'Lost item':'Found item'}</span><span className="wc-tag">{item.status}</span></div>
  <h3>{item.title}</h3><p>{item.description}</p>
  <div className="wc-lost-details"><span>⌖ {item.locationText}</span>
   <span>Category: {item.category}</span>
   {item.occurredAt&&<span>Occurred: {new Date(item.occurredAt).toLocaleDateString('en-PK')}</span>}
  </div>
  <p className="wc-lost-contact">Contact: {contact[item.contactPreference]||'Campus helpdesk'}.
   Quote report reference <code>{item.id}</code>. Student identities are private.</p>
  <div className="wc-lost-actions">
   {own&&item.status==='open'&&<>
    <button className="wc-outline" disabled={busy} onClick={()=>edit(item)}>Edit</button>
    <button className="wc-outline" disabled={busy} onClick={()=>resolve(item)}>Mark resolved</button>
   </>}
   {admin&&item.status!=='removed'&&<button className="wc-outline dangerous" disabled={busy}
    onClick={()=>remove(item)}>Admin remove</button>}
  </div>
 </article>;
}
const contact={helpdesk:'campus helpdesk',adminMediated:'campus administration'};
export default function LostFoundPage({profile,call,act,busy}){
 const student=hasRole(profile,'student'),admin=hasRole(profile,'admin');
 const [feed,setFeed]=useState([]),[mine,setMine]=useState([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [filters,setFilters]=useState({q:'',kind:'',category:''});
 const [form,setForm]=useState(empty),[editId,setEditId]=useState(null);
 const [moderating,setModerating]=useState(null),[reason,setReason]=useState('');
 async function load(terms=filters){
  setLoading(true);
  try{
   const params=new URLSearchParams({limit:'100'});
   if(terms.q.trim())params.set('q',terms.q.trim());
   if(terms.kind)params.set('kind',terms.kind);
   if(terms.category)params.set('category',terms.category);
   const [reports,owned]=await Promise.all([
    call('/lost-found-items?'+params),
    student?call('/me/lost-found-items?limit=100'):Promise.resolve([])
   ]);
   setFeed(reports);setMine(owned);setError('');
  }catch(err){setError(err.message||'Lost & Found reports are unavailable.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 function populate(item){
  setEditId(item.id);
  setForm({kind:item.kind,title:item.title,description:item.description,
   category:item.category,locationText:item.locationText,
   contactPreference:item.contactPreference,occurredAt:''});
  setError('Edit the report in the form below.');
 }
 async function publish(e){
  e.preventDefault();
  const data={...form};
  if(!data.occurredAt)delete data.occurredAt;
  else data.occurredAt=new Date(data.occurredAt).toISOString();
  const ok=await act(()=>editId?
    call('/lost-found-items/'+editId,{
     method:'PATCH',body:{title:data.title,description:data.description,
      locationText:data.locationText}
    }):
    call('/lost-found-items',{method:'POST',body:data}),
   editId?'Report updated.':'Report published to your verified campus.');
  if(ok){setForm(empty);setEditId(null);await load();}
 }
 async function resolve(item){
  const ok=await act(()=>call('/lost-found-items/'+item.id,{
   method:'PATCH',body:{status:'resolved'}
  }),'Report marked resolved.');
  if(ok)await load();
 }
 async function remove(e){
  e.preventDefault();
  const ok=await act(()=>call('/admin/lost-found-items/'+moderating.id+'/moderation',{
   method:'POST',body:{action:'remove',reason:reason.trim()}
  }),'Unsafe report removed and logged.');
  if(ok){setModerating(null);setReason('');await load();}
 }
 const update=(key,value)=>setForm(s=>({...s,[key]:value}));
 const cards=(items,owner)=>items.map(i=><Report key={i.id} item={i} own={owner}
  admin={admin} busy={busy} contact={contact}
  edit={populate} resolve={resolve} remove={setModerating}/>);
 return <div className="wc-stack wc-lost">
  <section className="wc-panel">
   <Heading tag="CAMPUS SERVICE" title="Lost & Found"
    detail="Search open campus reports. Contact is handled through the university helpdesk or administration. No student phone numbers or private emails are shared."/>
   {error&&<p role="alert" className="wc-lost-error">{error}</p>}
   <form className="wc-lost-search" onSubmit={e=>{e.preventDefault();load(filters);}}>
    <label>Search<input maxLength={60} placeholder="USB, wallet, ID card, classroom..."
     value={filters.q} onChange={e=>setFilters(s=>({...s,q:e.target.value}))}/></label>
    <label>Type<select value={filters.kind} onChange={e=>setFilters(s=>({...s,kind:e.target.value}))}>
     <option value="">Lost & found</option>{kinds.map(k=><option key={k} value={k}>{k}</option>)}
    </select></label>
    <label>Category<select value={filters.category}
     onChange={e=>setFilters(s=>({...s,category:e.target.value}))}>
     <option value="">All categories</option>
     {categories.map(c=><option key={c} value={c}>{c}</option>)}
    </select></label>
    <button className="wc-primary" type="submit">Search</button>
   </form>
   {loading?<p>Loading campus reports…</p>:
    feed.length?<div className="wc-lost-grid">{cards(feed,false)}</div>:
    <div className="wc-empty"><h3>No open lost/found reports</h3>
     <p>Try another search. Only open, university-scoped reports appear here.</p></div>}
  </section>
  {student&&<section className="wc-panel">
   <Heading tag="STUDENT REPORTER" title={editId?'Edit my report':'Report lost or found item'}
    detail="Provide a location and useful description, but do not include registration numbers, private contact details or ID card photos."/>
   <form className="wc-form wc-lost-form" onSubmit={publish}>
    {!editId&&<div className="wc-form-pair">
     <label>Item type<select value={form.kind} onChange={e=>update('kind',e.target.value)}>
      {kinds.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
     <label>Category<select value={form.category} onChange={e=>update('category',e.target.value)}>
      {categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    </div>}
    <label>Item name<input required minLength={5} maxLength={160}
     value={form.title} onChange={e=>update('title',e.target.value)}/></label>
    <label>Description<textarea rows={4} minLength={20} maxLength={3000} required
     value={form.description} onChange={e=>update('description',e.target.value)}/></label>
    <label>Last seen / found location<input required minLength={5} maxLength={250}
     value={form.locationText} onChange={e=>update('locationText',e.target.value)}/></label>
    {!editId&&<div className="wc-form-pair">
     <label>Occurrence time (optional)<input type="datetime-local" value={form.occurredAt}
      onChange={e=>update('occurredAt',e.target.value)}/></label>
     <label>Contact handling<select value={form.contactPreference}
      onChange={e=>update('contactPreference',e.target.value)}>
      <option value="helpdesk">University helpdesk</option>
      <option value="adminMediated">Campus administration</option>
     </select></label>
    </div>}
    <div className="wc-lost-actions"><button className="wc-primary" disabled={busy}>
     {editId?'Save changes':'Publish report immediately'}</button>
     {editId&&<button className="wc-outline" type="button"
      onClick={()=>{setEditId(null);setForm(empty);}}>Cancel</button>}
    </div>
   </form>
  </section>}
  {student&&<section className="wc-panel">
   <Heading tag="PRIVATE ACCOUNT HISTORY" title="My lost/found reports"
    detail="Review your open and resolved reports. Resolved items are removed from public search."/>
   {mine.length?<div className="wc-lost-grid">{cards(mine,true)}</div>:
    <div className="wc-empty"><h3>You have not submitted reports</h3></div>}
  </section>}
  {admin&&moderating&&<section className="wc-panel">
   <Heading tag="ADMIN MODERATION" title="Remove unsafe report"
    detail="Admin-only removal is audited. Removed reports cannot be publicly browsed."/>
   <p>Report: {moderating.title}</p>
   <form className="wc-form" onSubmit={remove}>
    <label>Reason<textarea required minLength={5} maxLength={1000}
     value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div className="wc-lost-actions"><button disabled={busy} className="wc-primary">Confirm removal</button>
     <button type="button" className="wc-outline" onClick={()=>setModerating(null)}>Cancel</button></div>
   </form>
  </section>}
 </div>;
}
