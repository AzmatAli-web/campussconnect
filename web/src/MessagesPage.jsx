import React,{useCallback,useEffect,useRef,useState} from 'react';

import {io} from 'socket.io-client';
import {apiOrigin} from './api.js';

function Mailbox({user,call,thread,onOpen,onBack}){
 const path=thread?'/conversations/'+thread.id+'/messages':'/conversations';
 const [rows,setRows]=useState([]),[more,setMore]=useState(false),[busy,setBusy]=useState(true);
 const [error,setError]=useState(''),[draft,setDraft]=useState(''),[notice,setNotice]=useState('');
 const [current,setCurrent]=useState(thread),[report,setReport]=useState(null),[reason,setReason]=useState('');
 const attempt=useRef(null);
 const loaded=useRef([]),queue=useRef(Promise.resolve()),mounted=useRef(false);
 const load=useCallback((older=false)=>{
  const sync=async()=>{
   if(!mounted.current)return;
   if(thread){
    const state=await call('/conversations/'+thread.id);
    if(!mounted.current)return;
    setCurrent(state);
   }
   const prior=loaded.current;
   let cursor=older?prior.at(-1)?.id:null;
   const boundary=thread?prior[0]?.id:prior.at(-1)?.id;
   const merged=new Map(prior.map(row=>[row.id,row]));
   let page;
   do{
    page=await call(path+(cursor?'?before='+cursor:''));
    if(!mounted.current)return;
    for(const row of page)merged.set(row.id,row);
    const unread=thread?page.filter(row=>row.unread).map(row=>row.id):[];
    if(unread.length&&!document.hidden){
     await call('/conversations/'+thread.id+'/read',{method:'PATCH',body:{ids:unread}});
    }
    cursor=page.at(-1)?.id;
   }while(!older && boundary && page.length===30 && cursor>boundary && mounted.current);
   if(!mounted.current)return;
    const sorted=[...merged.values()].sort((a,b)=>b.id.localeCompare(a.id));
    loaded.current=sorted;
    setRows(sorted);
   if(older||!prior.length||!thread)setMore(page.length===30);
  };
  const result=queue.current.then(sync);
  queue.current=result.catch(()=>{});
  return result;
 },[call,path,thread]);
 useEffect(()=>{
  mounted.current=true;
  let pending=false,dirty=false,active=true;
  async function refresh(){
   if(document.hidden||!active)return;
   if(pending){dirty=true;return;}
   pending=true;
   try{await load();if(active)setError('');}
   catch(err){if(active)setError(err.message);}
   finally{
    pending=false;
    if(active)setBusy(false);
    if(dirty){dirty=false;refresh();}
   }
  }
  const socket=io(apiOrigin(),{transports:['websocket'],autoConnect:false,
   auth:cb=>user.getIdToken().then(token=>cb({token})).catch(()=>cb({}))});
  socket.on('connect',refresh).on('inbox:update',refresh);
  function resume(){if(!document.hidden){if(!socket.connected)socket.connect();refresh();}}
  document.addEventListener('visibilitychange',resume);
  const timer=setInterval(resume,60000);
  resume();
  return ()=>{active=false;mounted.current=false;clearInterval(timer);socket.disconnect();
   document.removeEventListener('visibilitychange',resume);};
 },[load,user]);
 async function run(work){
  setBusy(true);setError('');setNotice('');
  try{await work();}catch(err){setError(err.message);}finally{setBusy(false);}
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
 function controls(row){
  return <>
   <button disabled={busy} onClick={()=>run(async()=>{
    await call('/conversations/'+row.id+'/block',{method:'PATCH',body:{blocked:!row.blockedByMe}});
    await load();
   })}>{row.blockedByMe?'Unblock':'Block'}</button>
   <button onClick={()=>startReport(row)}>Report conversation</button>
  </>;
 }
 function startReport(row,messageId=null){setReport({row,messageId});setReason('');}
 return <section className="wc-panel wc-stack">
  {thread&&<><button className="wc-outline" onClick={onBack}>Back to inbox</button><h2>{thread.name}</h2>{controls(current)}</>}
  <button disabled={busy} onClick={()=>run(()=>load())}>Refresh {thread?'messages':'inbox'}</button>
  {report&&<form className="wc-stack" onSubmit={event=>{
   event.preventDefault();run(async()=>{
    await call('/conversations/'+report.row.id+'/reports',{method:'POST',body:{reason,messageId:report.messageId}});
    setReport(null);setNotice('Report received by campus moderation.');
   });
  }}><label>Reason for reporting {report.messageId?'this message':'the conversation'} with {report.row.name}
   <textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button disabled={busy||reason.trim().length<3}>Send report</button>
   <button type="button" onClick={()=>setReport(null)}>Cancel</button></form>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {busy&&<p role="status">Loading…</p>}
  {!busy&&!error&&!rows.length&&<p>{thread?'No messages yet.':'No conversations yet. Request one using a campus email.'}</p>}
  {thread?<ol>{[...rows].reverse().map(row=><li key={row.id}><strong>{row.mine?'You':thread.name}</strong>
   <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.body}</p>
   <small>{new Date(row.createdAt).toLocaleString()}</small>{!row.mine&&<button onClick={()=>startReport(current,row.id)}>Report message</button>}</li>)}</ol>:
   <ul>{rows.map(row=><li key={row.id}><strong>{row.name}</strong> · {row.status}{row.unread>0&&' · '+row.unread+' unread'}
    {controls(row)}{row.paused&&' · Messaging paused'}
    {row.status==='accepted'&&<button onClick={()=>onOpen(row)}>Open conversation</button>}
    {!row.paused&&row.incoming&&row.status==='pending'&&<>
     <button disabled={busy} onClick={()=>decide(row,'accepted')}>Accept</button>
     <button disabled={busy} onClick={()=>decide(row,'declined')}>Decline</button></>}
   </li>)}</ul>}
  {more&&<button disabled={busy} onClick={()=>run(()=>load(true))}>Load older {thread?'messages':'conversations'}</button>}
  {current?.paused?<p>Messaging is paused. You can still view history and report messages.</p>:<form onSubmit={submit} className="wc-stack"><label>{thread?'Your message':'Recipient campus email'}
   {thread?<textarea value={draft} disabled={busy} maxLength={2000} required onChange={e=>setDraft(e.target.value)}/>:
   <input type="email" required maxLength={254} disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)}/>}</label>
   <button className="wc-primary" disabled={busy||!draft.trim()}>{thread?'Send message':'Request conversation'}</button>
  </form>}
 </section>;
}
export default function MessagesPage({call,user}){
 const [thread,setThread]=useState(null);
 return <Mailbox user={user} key={thread?.id??'inbox'} call={call} thread={thread} onOpen={setThread} onBack={()=>setThread(null)}/>;
}
