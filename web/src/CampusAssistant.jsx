import React,{useState} from 'react';

export default function CampusAssistant({call}){
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(null),[source,setSource]=useState(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function ask(event){
  event.preventDefault();setBusy(true);setError('');setAnswer(null);setSource(null);
  try{setAnswer(await call('/knowledge-sources/answer',{method:'POST',body:{question:question.trim()}}));}
  catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function openSource(){
  setBusy(true);setError('');
  try{setSource(await call('/knowledge-sources/'+answer.citation.id));}
  catch(err){setSource(null);if(err.status===404||err.status===403)setAnswer(null);setError(err.message);}
  finally{setBusy(false);}
 }
 return <section className="wc-panel wc-stack">
  <form className="wc-stack" onSubmit={ask}><label>Ask about campus
   <textarea value={question} maxLength={400} disabled={busy} onChange={e=>{setQuestion(e.target.value);setAnswer(null);setSource(null);setError('');}}/></label>
   <button disabled={busy||question.trim().length<3}>Ask assistant</button></form>
  {busy&&<p role="status">Checking campus sources…</p>}{error&&<p role="alert">{error}</p>}
  {answer?.status==='unsupported'&&<p role="status">I couldn’t find an approved source that answers this question.</p>}
  {answer?.citation&&<article><blockquote style={{whiteSpace:'pre-wrap'}}>{answer.answer}</blockquote>
   <p>{answer.citation.title} · {answer.citation.reference}</p>
   <button disabled={busy} onClick={openSource}>View cited source</button></article>}
  {source&&<section><h3>{source.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{source.text}</p></section>}
 </section>;
}
