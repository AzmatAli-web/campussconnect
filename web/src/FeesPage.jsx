import React,{useEffect,useState} from 'react';
import {hasRole} from './dashboard-domain.js';
const money=n=>'PKR '+new Intl.NumberFormat('en-PK').format(Number(n)||0);
const label={unpaid:'Unpaid',partially_recorded:'Partially recorded',paid:'Fully recorded'};
const empty={studentEmail:'',invoiceNo:'',title:'',term:'Fall 2026',
 dueDate:'',amountPkr:''};
export default function FeesPage({profile,call,act,busy}){
 const student=hasRole(profile,'student');
 const reviewer=hasRole(profile,'staff')||hasRole(profile,'admin');
 const [mine,setMine]=useState([]);
 const [staffRows,setStaffRows]=useState([]);
 const [studentEmail,setStudentEmail]=useState('');
 const [form,setForm]=useState(empty);
 const [paymentForms,setPaymentForms]=useState({});
 const [history,setHistory]=useState({});
 const [loading,setLoading]=useState(true);
 const [reviewLoading,setReviewLoading]=useState(false);
 const [busyPayment,setBusyPayment]=useState('');
 const [error,setError]=useState('');
 const field=(name,value)=>setForm(prev=>({...prev,[name]:value}));
 async function loadMine(){
  if(!student){setLoading(false);return;}
  setLoading(true);
  try{
   const items=await call('/me/fees?limit=100');
   setMine(Array.isArray(items)?items:[]);
   setError('');
  }catch(err){setError(err.message||'Cannot retrieve your fee records.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{loadMine();},[]);
 async function loadStaff(email=studentEmail){
  if(!reviewer||!email.trim())return;
  setReviewLoading(true);
  try{
   const items=await call('/staff/fees?studentEmail='+encodeURIComponent(email.trim()));
   setStaffRows(Array.isArray(items)?items:[]);
   setError('');
  }catch(e){setError(e.message||'Unable to find fee records.');}
  finally{setReviewLoading(false);}
 }
 async function issue(e){
  e.preventDefault();
  const payload={...form,amountPkr:Number(form.amountPkr)};
  const ok=await act(()=>call('/staff/fees',{method:'POST',body:payload}),
   'Fee invoice issued for the selected student.');
  if(ok){
   setStudentEmail(form.studentEmail);
   await loadStaff(form.studentEmail);
   setForm({...empty,studentEmail:form.studentEmail});
  }
 }
 async function record(item){
  const data=paymentForms[item.id]||{amountPkr:'',receiptRef:''};
  const amount=Number(data.amountPkr);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>item.outstandingPkr){
   setError('Enter a whole PKR amount within the outstanding balance.');
   return;
  }
  if(!window.confirm('Record this already-verified offline payment? '
   +'This does not charge a card or verify a bank transfer.'))return;
  setBusyPayment(item.id);
  try{
   const ok=await act(()=>call('/staff/fees/'+item.id+'/payments',{
    method:'POST',body:{amountPkr:amount,receiptRef:data.receiptRef.trim()}
   }),'Offline payment record saved.');
   if(ok){
    setPaymentForms(p=>({...p,[item.id]:{amountPkr:'',receiptRef:''}}));
    await loadStaff();
   }
  }finally{setBusyPayment('');}
 }
 async function toggleHistory(item){
  if(Object.hasOwn(history,item.id)){
   setHistory(prev=>{const next={...prev};delete next[item.id];return next;});
   return;
  }
  try{
   const entries=await call('/me/fees/'+item.id+'/payments');
   setHistory(prev=>({...prev,[item.id]:Array.isArray(entries)?entries:[]}));
   setError('');
  }catch(e){setError(e.message||'Unable to read recorded payments.');}
 }
 const card=(item,staff=false)=><article className="wc-fee-card" key={item.id}>
  <div className="wc-fee-top"><span className="wc-tag blue">{item.invoiceNo}</span>
    <span className={'wc-tag '+(item.status==='paid'?'good':'warn')}>
      {label[item.status]||item.status}{item.overdue?' · Overdue':''}
    </span>
  </div>
  <h3>{item.title}</h3>
  <small>{item.term} · Due {item.dueDate} · PKR only</small>
  <div className="wc-fee-figures">
   <span><small>Total</small><b>{money(item.amountPkr)}</b></span>
   <span><small>Recorded</small><b>{money(item.paidPkr)}</b></span>
   <span><small>Outstanding</small><b>{money(item.outstandingPkr)}</b></span>
  </div>
  {!staff&&<div className="wc-fee-actions">
   <button className="wc-outline" onClick={()=>toggleHistory(item)}>
    {Object.hasOwn(history,item.id)?'Hide recorded payments':'View recorded payments'}
   </button>
   {Object.hasOwn(history,item.id)&&<div className="wc-fee-history">
    {history[item.id].length?history[item.id].map(entry=>
      <div key={entry.id}><b>{money(entry.amountPkr)}</b>
       <small>{entry.receiptRef} · {new Date(entry.recordedAt).toLocaleDateString('en-PK')}</small>
      </div>):<small>No payments have been recorded.</small>}
   </div>}
  </div>}
  {staff&&item.outstandingPkr>0&&<div className="wc-fee-payment-form">
   <p>Administrative recording only. Confirm the offline receipt outside CampusConnect.</p>
   <label>Verified amount (PKR)<input type="number" min="1"
     max={item.outstandingPkr} step="1" required
     value={paymentForms[item.id]?.amountPkr??''}
     onChange={e=>setPaymentForms(s=>({...s,[item.id]:{
       ...(s[item.id]||{}),amountPkr:e.target.value
     }}))}/></label>
   <label>Receipt reference<input required minLength={5} maxLength={70}
     placeholder="Office receipt number"
     value={paymentForms[item.id]?.receiptRef??''}
     onChange={e=>setPaymentForms(s=>({...s,[item.id]:{
       ...(s[item.id]||{}),receiptRef:e.target.value
     }}))}/></label>
   <button className="wc-primary" disabled={busy||busyPayment===item.id}
     onClick={()=>record(item)}>Record verified offline payment</button>
  </div>}
 </article>;
 return <div className="wc-stack">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">STUDENT FINANCE</span>
    <h2>Fees and dues</h2>
    <p>Read-only campus invoices, due dates and payments recorded by authorized finance staff. No online payment or bank integration is available.</p>
   </div></div>
   <p className="wc-fee-warning">These records are administrative entries, not an independent bank payment confirmation. For disputes or payment corrections, contact the college finance office.</p>
   {error&&<p role="alert" className="wc-complaint-error">{error}</p>}
   {student&&<div className="wc-fee-section">
    <div className="wc-head"><div><h2>My invoices</h2><p>Only invoices assigned to your verified student profile are shown.</p></div>
     <button className="wc-outline" onClick={loadMine}>Refresh</button></div>
    {loading?<p>Loading your fees…</p>:mine.length?
     <div className="wc-fee-grid">{mine.map(i=>card(i))}</div>:
     <div className="wc-empty"><h3>No fee records yet</h3>
      <p>Authorized college finance staff can issue your invoice. No amount is due in CampusConnect until a record is published.</p>
     </div>}
   </div>}
  </section>
  {reviewer&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">AUTHORIZED STAFF / ADMIN</span>
    <h2>Finance office ledger</h2>
    <p>Search for one active student by verified university email. Staff can issue invoices and record already-verified offline payments.</p>
   </div></div>
   <form className="wc-fee-search" onSubmit={e=>{e.preventDefault();loadStaff();}}>
    <label>Student university email<input type="email" required
      placeholder="student@university.edu.pk" value={studentEmail}
      onChange={e=>setStudentEmail(e.target.value)}/></label>
    <button className="wc-primary" type="submit" disabled={reviewLoading}>Search records</button>
   </form>
   {reviewLoading?<p>Loading finance records…</p>:staffRows.length?
    <div className="wc-fee-grid">{staffRows.map(i=>card(i,true))}</div>:
    <div className="wc-empty"><h3>No selected invoice records</h3>
     <p>Search by student email to see published invoices.</p></div>}
   <div className="wc-divider"/>
   <h2>Issue a fee invoice</h2>
   <p className="wc-fee-warning">Only issue actual college-approved amounts. The system does not collect money or verify receipts.</p>
   <form className="wc-form" onSubmit={issue}>
    <div className="wc-form-pair">
     <label>Student email<input type="email" required maxLength={253}
       value={form.studentEmail} onChange={e=>field('studentEmail',e.target.value)}/></label>
     <label>Invoice number<input required minLength={4} maxLength={40}
       value={form.invoiceNo} onChange={e=>field('invoiceNo',e.target.value)}/></label>
     <label>Invoice title<input required minLength={5} maxLength={140}
       placeholder="Semester tuition"
       value={form.title} onChange={e=>field('title',e.target.value)}/></label>
     <label>Academic term<input required minLength={3} maxLength={40}
       value={form.term} onChange={e=>field('term',e.target.value)}/></label>
     <label>Due date<input required type="date" value={form.dueDate}
       onChange={e=>field('dueDate',e.target.value)}/></label>
     <label>Amount (whole PKR)<input type="number" required min="1" step="1"
       max="1000000000" value={form.amountPkr}
       onChange={e=>field('amountPkr',e.target.value)}/></label>
    </div>
    <button className="wc-primary" type="submit" disabled={busy}>
      {busy?'Saving…':'Issue invoice'}
    </button>
   </form>
  </section>}
 </div>;
}
