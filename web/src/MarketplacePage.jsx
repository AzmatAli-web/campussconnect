import React,{useEffect,useState} from 'react';
import {hasRole} from './dashboard-domain.js';
import {downloadMarketplacePhoto,uploadMarketplacePhoto} from './api.js';
import './marketplace.css';

const categories=['books','electronics','furniture','clothing','other'];
const conditions=['new','like_new','good','fair'];
const reasons=['spam','scam','prohibited','misleading','other'];
const initial={title:'',description:'',category:'books',condition:'good',pricePkr:'',contactConsent:false};
function money(pkr){return Number(pkr)===0?'Free':'PKR '+Number(pkr||0).toLocaleString('en-PK');}
function MarketPhoto({listing,user}){
 const [url,setUrl]=useState('');
 useEffect(()=>{
  if(!listing.hasImage||listing.status!=='published')return;
  let active=true;let objectUrl='';
  downloadMarketplacePhoto(user,listing.id).then(bytes=>{
   objectUrl=URL.createObjectURL(bytes);
   if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
  }).catch(()=>{});
  return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[listing.id,listing.hasImage,listing.status,user]);
 return url?<img className="wc-market-image" src={url} alt={'Photo of '+listing.title}/>:
  <div className="wc-market-image wc-market-placeholder" aria-label="No available photo">▧</div>;
}
function Header({kicker,title,detail}){return <div className="wc-head"><div>
 <span className="wc-kicker">{kicker}</span><h2>{title}</h2><p>{detail}</p>
 </div></div>;}
export default function MarketplacePage({profile,user,call,act,busy}){
 const student=hasRole(profile,'student'),admin=hasRole(profile,'admin');
 const [items,setItems]=useState([]),[mine,setMine]=useState([]),[reports,setReports]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [filter,setFilter]=useState({q:'',category:''});
 const [draft,setDraft]=useState(initial),[photo,setPhoto]=useState(null);
 const [contact,setContact]=useState({}),[reporting,setReporting]=useState(null);
 const [reportReason,setReportReason]=useState('spam'),[reportDetail,setReportDetail]=useState('');
 const [editId,setEditId]=useState(null),[edit,setEdit]=useState(initial);
 const [resolution,setResolution]=useState({});
 async function load(search=filter){
  setLoading(true);
  try{
   const params=new URLSearchParams({limit:'50'});
   if(search.q.trim())params.set('q',search.q.trim());
   if(search.category)params.set('category',search.category);
   const [feed,own,queue]=await Promise.all([
    call('/marketplace?'+params),
    student?call('/me/marketplace?limit=100'):Promise.resolve([]),
    admin?call('/admin/marketplace/reports?status=open&limit=100'):Promise.resolve([])
   ]);
   setItems(feed);setMine(own);setReports(queue);setError('');
  }catch(err){setError(err.message||'Cannot load the campus Marketplace.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 async function create(e){
  e.preventDefault();
  const body={...draft,pricePkr:Number(draft.pricePkr)};
  if(!Number.isSafeInteger(body.pricePkr)||body.pricePkr<0||body.pricePkr>5000000){
   setError('Enter a valid whole PKR price from 0 to 5,000,000.');return;
  }
  const ok=await act(async()=>{
   const created=await call('/marketplace',{method:'POST',body});
   if(photo){try{await uploadMarketplacePhoto(user,created.id,photo);}
    catch(err){throw new Error('Listing published without its photo: '+err.message);}}
  },'Your listing was published immediately.');
  if(ok){setDraft(initial);setPhoto(null);const f=document.getElementById('marketplace-photo');if(f)f.value='';}
  await load();
 }
 function startEdit(item){
  setEditId(item.id);
  setEdit({title:item.title,description:item.description,category:item.category,
   condition:item.condition,pricePkr:String(item.pricePkr),contactConsent:item.contactAvailable});
 }
 async function saveEdit(e){
  e.preventDefault();
  const body={...edit,pricePkr:Number(edit.pricePkr)};
  const ok=await act(()=>call('/marketplace/'+editId,{method:'PATCH',body}),
   'Your listing was updated.');
  if(ok){setEditId(null);await load();}
 }
 async function changeStatus(item,status){
  const ok=await act(()=>call('/marketplace/'+item.id+'/status',{method:'POST',body:{status}}),
   'Listing marked '+status+'.');
  if(ok)await load();
 }
 async function reveal(item){
  try{const result=await call('/marketplace/'+item.id+'/contact');
   setContact(s=>({...s,[item.id]:result.email}));}
  catch(err){setError(err.message||'Seller contact not available.');}
 }
 async function report(e,item){
  e.preventDefault();
  const ok=await act(()=>call('/marketplace/'+item.id+'/reports',{
   method:'POST',body:{reason:reportReason,detail:reportDetail}
  }),'Your report was submitted privately to campus administrators.');
  if(ok){setReporting(null);setReportReason('spam');setReportDetail('');await load();}
 }
 async function resolve(item,action){
  const note=(resolution[item.id]||'').trim();
  if(note.length<5){setError('Write at least five characters explaining your moderation decision.');return;}
  const ok=await act(()=>call('/admin/marketplace/reports/'+item.id+'/resolve',{
   method:'POST',body:{action,note}
  }),'Report reviewed and recorded in the audit log.');
  if(ok)await load();
 }
 const fields=(value,set)=> <div className="wc-market-fields">
  <label>Item title<input required minLength={5} maxLength={160}
   value={value.title} onChange={e=>set(s=>({...s,title:e.target.value}))}/></label>
  <label>Description<textarea required minLength={20} maxLength={3000} rows={3}
   value={value.description} onChange={e=>set(s=>({...s,description:e.target.value}))}/></label>
  <div className="wc-form-pair">
   <label>Category<select value={value.category} onChange={e=>set(s=>({...s,category:e.target.value}))}>
    {categories.map(c=><option key={c} value={c}>{c.replace('_',' ')}</option>)}</select></label>
   <label>Condition<select value={value.condition} onChange={e=>set(s=>({...s,condition:e.target.value}))}>
    {conditions.map(c=><option key={c} value={c}>{c.replace('_',' ')}</option>)}</select></label>
  </div>
  <label>Price (PKR; 0 for free)<input type="number" required min={0} max={5000000} step={1}
   value={value.pricePkr} onChange={e=>set(s=>({...s,pricePkr:e.target.value}))}/></label>
  <label className="wc-market-checkbox"><input type="checkbox" checked={value.contactConsent}
   onChange={e=>set(s=>({...s,contactConsent:e.target.checked}))}/>
   Allow signed-in campus members to request my verified university email for this listing</label>
 </div>;
 const listingCard=(item,owner=false)=><article key={item.id} className="wc-market-card">
  <MarketPhoto listing={item} user={user}/>
  <div className="wc-market-cardbody">
   <div className="wc-market-meta"><span>{item.category.replace('_',' ')} · {item.condition.replace('_',' ')}</span>
    <span className="wc-tag blue">{item.status}</span></div>
   <h3>{item.title}</h3><p>{item.description}</p>
   <strong className="wc-market-price">{money(item.pricePkr)}</strong>
   <div className="wc-market-actions">
    {owner?<>{item.status==='published'&&<>
     <button className="wc-outline" disabled={busy} onClick={()=>startEdit(item)}>Edit</button>
     <button className="wc-outline" disabled={busy} onClick={()=>changeStatus(item,'sold')}>Mark sold</button>
     </>}
     {['published','sold'].includes(item.status)&&<button className="wc-outline dangerous"
      disabled={busy} onClick={()=>changeStatus(item,'archived')}>Archive</button>}</>:
     <>{item.contactAvailable?
       (contact[item.id]?<a href={'mailto:'+contact[item.id]}>{contact[item.id]}</a>:
        <button className="wc-outline" onClick={()=>reveal(item)}>Request seller email</button>):
        <small>Seller has not enabled email contact</small>}
      <button className="wc-outline" onClick={()=>{setReporting(item.id);setError('');}}>Report</button></>}
   </div>
   {!owner&&reporting===item.id&&<form className="wc-form wc-market-report" onSubmit={e=>report(e,item)}>
    <label>Report reason<select value={reportReason} onChange={e=>setReportReason(e.target.value)}>
     {reasons.map(x=><option value={x} key={x}>{x}</option>)}</select></label>
    <label>Details (optional)<textarea maxLength={1000} value={reportDetail}
     onChange={e=>setReportDetail(e.target.value)}/></label>
    <div className="wc-market-actions"><button disabled={busy} className="wc-primary">Submit report</button>
     <button type="button" className="wc-outline" onClick={()=>setReporting(null)}>Cancel</button></div>
   </form>}
   {owner&&editId===item.id&&<form className="wc-form wc-market-edit" onSubmit={saveEdit}>
    {fields(edit,setEdit)}
    <div className="wc-market-actions"><button className="wc-primary" disabled={busy}>Save changes</button>
     <button className="wc-outline" type="button" onClick={()=>setEditId(null)}>Cancel</button></div>
   </form>}
  </div>
 </article>;
 return <div className="wc-stack wc-market">
  <section className="wc-panel">
   <Header kicker="CAMPUS EXCHANGE" title="Student Marketplace"
    detail="Listings are campus-only, published immediately and reportable. CampusConnect does not process payments or verify sellers."/>
   {error&&<p role="alert" className="wc-market-error">{error}</p>}
   <form className="wc-market-search" onSubmit={e=>{e.preventDefault();load(filter);}}>
    <label>Search items<input value={filter.q} maxLength={60} placeholder="Textbooks, calculator, desk..."
     onChange={e=>setFilter(s=>({...s,q:e.target.value}))}/></label>
    <label>Category<select value={filter.category} onChange={e=>setFilter(s=>({...s,category:e.target.value}))}>
      <option value="">All categories</option>{categories.map(c=><option value={c} key={c}>{c}</option>)}
     </select></label>
    <button className="wc-primary">Search</button>
    <button type="button" className="wc-outline" onClick={()=>{setFilter({q:'',category:''});load({q:'',category:''});}}>Clear</button>
   </form>
   {loading?<p>Loading campus listings…</p>:items.length?
    <div className="wc-market-grid">{items.map(item=>listingCard(item))}</div>:
    <div className="wc-empty"><h3>No active listings found</h3>
     <p>Try another search or publish the first campus listing.</p></div>}
  </section>
  {student&&<section className="wc-panel">
   <Header kicker="STUDENT SELLER" title="Publish an item"
    detail="Use an accurate description. Your verified email is shared only if you enable contact consent. Photos remain private to authenticated campus users."/>
   <form className="wc-form" onSubmit={create}>
    {fields(draft,setDraft)}
    <label>Photo (optional, JPEG/PNG/WebP, maximum 2 MB)
     <input id="marketplace-photo" type="file" accept="image/jpeg,image/png,image/webp"
      onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
    <button className="wc-primary" disabled={busy}>Publish listing</button>
   </form>
  </section>}
  {student&&<section className="wc-panel">
   <Header kicker="MY ITEMS" title="My listings"
    detail="Edit published listings or mark items as sold. Archived and moderated listings stay out of public discovery."/>
   {mine.length?<div className="wc-market-grid">{mine.map(i=>listingCard(i,true))}</div>:
    <div className="wc-empty"><h3>No items published</h3></div>}
  </section>}
  {admin&&<section className="wc-panel">
   <Header kicker="ADMIN REVIEW" title="Marketplace reports"
    detail="Only authorized campus Administrators can dismiss reports or archive listings. Decisions are audited."/>
   {reports.length?reports.map(r=><article className="wc-market-admin" key={r.id}>
    <div><strong>{r.reason} · listing {r.listingId}</strong><p>{r.detail||'No additional details'}</p>
     <small>Reported {new Date(r.createdAt).toLocaleDateString('en-PK')}</small></div>
    <label>Reason for decision<textarea rows={2} minLength={5} maxLength={1000}
     value={resolution[r.id]||''} onChange={e=>setResolution(s=>({...s,[r.id]:e.target.value}))}/></label>
    <div className="wc-market-actions"><button className="wc-outline" disabled={busy}
     onClick={()=>resolve(r,'dismiss')}>Dismiss report</button>
     <button className="wc-outline dangerous" disabled={busy}
      onClick={()=>resolve(r,'archive')}>Archive listing</button></div>
   </article>):<div className="wc-empty"><h3>No open Marketplace reports</h3></div>}
  </section>}
 </div>;
}
