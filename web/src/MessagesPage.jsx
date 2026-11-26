import React,{useEffect,useRef,useState} from 'react';

function Mailbox({call,thread,onOpen,onBack}){
 const path=thread?'/conversations/'+thread.id+'/messages':'/conversations';
 const [rows,setRows]=useState([]),[more,setMore]=useState(false),[busy,setBusy]=useState(true);
 const [error,setError]=useState(''),[draft,setDraft]=useState(''),[notice,setNotice]=useState('');
 const attempt=useRef(null);
 useEffect(()=>{
  let active=true;
  call(path).then(page=>{if(active){setRows(page);setMore(page.length===30);}})
   .catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setBusy(false);});
  return ()=>{active=false;};
 },[path,call]);
 async function run(work){
  setBusy(true);setError('');setNotice('');
  try{await work();}catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function load(older=false){
  const page=await call(path+(older?'?before='+rows.at(-1).id:''));
  setRows(older?[...rows,...page]:page);setMore(page.length===30);
 }
 async function submit(event){
  event.preventDefault();
  await run(async()=>{
   const text=draft.trim();
   if(thread){
    if(attempt.current?.text!==text)attempt.current={text,id:crypto.randomUUID()};
    await call(path,{method:'POST',body:{body:text,clientId:attempt.current.id}});
    attempt.current=null;setNotice('Message sent.');
   }else{
    const result=await call(path,{method:'POST',body:{email:text}});
    setNotice('Conversation with '+result.name+' is '+result.status+'.');
   }
   setDraft('');await load();
  });
 }
 function decide(row,status){
  run(async()=>{
   const updated=await call('/conversations/'+row.id,{method:'PATCH',body:{status}});
   setRows(list=>list.map(item=>item.id===row.id?updated:item));
  });
 }
 return <section className="wc-panel wc-stack">
  {thread&&<><button className="wc-outline" onClick={onBack}>Back to inbox</button><h2>{thread.name}</h2></>}
  <button disabled={busy} onClick={()=>run(()=>load())}>Refresh {thread?'messages':'inbox'}</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {busy&&<p role="status">Loading…</p>}
  {!busy&&!error&&!rows.length&&<p>{thread?'No messages yet.':'No conversations yet. Request one using a campus email.'}</p>}
  {thread?<ol>{[...rows].reverse().map(row=><li key={row.id}><strong>{row.mine?'You':thread.name}</strong>
   <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.body}</p>
   <small>{new Date(row.createdAt).toLocaleString()}</small></li>)}</ol>:
   <ul>{rows.map(row=><li key={row.id}><strong>{row.name}</strong> · {row.status}
    {row.status==='accepted'&&<button onClick={()=>onOpen(row)}>Open conversation</button>}
    {row.incoming&&row.status==='pending'&&<>
     <button disabled={busy} onClick={()=>decide(row,'accepted')}>Accept</button>
     <button disabled={busy} onClick={()=>decide(row,'declined')}>Decline</button></>}
   </li>)}</ul>}
  {more&&<button disabled={busy} onClick={()=>run(()=>load(true))}>Load older {thread?'messages':'conversations'}</button>}
  <form onSubmit={submit} className="wc-stack"><label>{thread?'Your message':'Recipient campus email'}
   {thread?<textarea value={draft} disabled={busy} maxLength={2000} required onChange={e=>setDraft(e.target.value)}/>:
   <input type="email" required maxLength={254} disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)}/>}</label>
   <button className="wc-primary" disabled={busy||!draft.trim()}>{thread?'Send message':'Request conversation'}</button>
  </form>
 </section>;
}
export default function MessagesPage({call}){
 const [thread,setThread]=useState(null);
 return <Mailbox key={thread?.id??'inbox'} call={call} thread={thread} onOpen={setThread} onBack={()=>setThread(null)}/>;
}
