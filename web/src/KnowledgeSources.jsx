import React,{useRef,useState} from 'react';

const path='/admin/knowledge-sources';
const empty={title:'',reference:'',text:'',audience:'campus'};
const audiences={campus:'All campus members',student:'Students',faculty:'Faculty',societyManager:'Society managers',
 staff:'Staff',financeOfficer:'Finance officers',admin:'Admins'};

export default function KnowledgeSources({call}){
 const [draft,setDraft]=useState(empty),[rows,setRows]=useState(null),[more,setMore]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const attempt=useRef(null);
 async function run(action){
  setBusy(true);setError('');setNotice('');
  try{await action();}catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function load(older=false){
  const page=await call(path+(older?'?before='+rows.at(-1)._id:''));
  setRows(previous=>older?[...previous,...page]:page);
  setMore(page.length===30);
 }
 function update(field,value){
  setDraft({...draft,[field]:value});attempt.current=null;
 }
 function save(event){
  event.preventDefault();
  run(async()=>{
   attempt.current??=crypto.randomUUID();
   await call(path,{method:'POST',body:{...draft,clientId:attempt.current}});
   setDraft(empty);attempt.current=null;setNotice('Draft saved. Review the source text before approval.');
   await load();
  });
 }
 function change(row,status){
  run(async()=>{
   await call(path+'/'+row._id,{method:'PATCH',body:{status}});
   setRows(previous=>previous.map(item=>item._id===row._id?{...item,status}:item));
   setNotice(status==='approved'?'Source approved for the selected audience.':'Source withdrawn.');
  });
 }
 return <section className="wc-panel wc-stack"><h2>Assistant knowledge sources</h2>
  <form className="wc-form" onSubmit={save}><fieldset disabled={busy} className="wc-stack"><legend>New source draft</legend>
   <label>Title<input required minLength={3} maxLength={160} value={draft.title} onChange={e=>update('title',e.target.value)}/></label>
   <label>Source reference<input required minLength={3} maxLength={400} placeholder="Handbook edition and page, or official URL" value={draft.reference} onChange={e=>update('reference',e.target.value)}/></label>
   <label>Audience<select value={draft.audience} onChange={e=>update('audience',e.target.value)}>
    {Object.entries(audiences).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Source text<textarea required minLength={10} maxLength={6000} rows={5} value={draft.text} onChange={e=>update('text',e.target.value)}/></label>
   <button>Save draft</button></fieldset></form>
  <button disabled={busy} onClick={()=>run(()=>load())}>{rows?'Refresh sources':'Review sources'}</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {rows?.length===0&&<p>No knowledge sources yet.</p>}
  {rows?.map(row=><details key={row._id}><summary>{row.title} · {audiences[row.audience]} · {row.status}</summary>
   <p>{row.reference}</p><p style={{whiteSpace:'pre-wrap'}}>{row.text}</p>
   {row.status==='draft'&&<button disabled={busy} onClick={()=>change(row,'approved')}>Approve source</button>}
   {row.status!=='withdrawn'&&<button disabled={busy} onClick={()=>change(row,'withdrawn')}>Withdraw source</button>}
  </details>)}
  {more&&<button disabled={busy} onClick={()=>run(()=>load(true))}>Load older sources</button>}
 </section>;
}
