import React,{useEffect,useRef,useState} from 'react';
import {isVerifiedFaculty,hasRole} from './dashboard-domain.js';
import {uploadAcademicPdf,downloadAcademicPdf} from './api.js';

const emptyUpload={
 title:'',description:'',program:'BSE',semester:'7',courseCode:''
};
const formatSize=n=>n<1024*1024
 ? Math.round(n/1024)+' KB' : (n/1024/1024).toFixed(1)+' MB';

export default function AcademicResourcesPage({profile,user,call,act,busy}){
 const isTeacher=isVerifiedFaculty(profile);
 const isAdmin=hasRole(profile,'admin');
 const fileRef=useRef(null);
 const [resources,setResources]=useState([]);
 const [myFiles,setMyFiles]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [filter,setFilter]=useState({program:'',semester:'',courseCode:''});
 const [selectedFilter,setSelectedFilter]=useState({});
 const [upload,setUpload]=useState(emptyUpload);
 const [selectedFile,setSelectedFile]=useState(null);
 const [downloading,setDownloading]=useState(null);
 const setField=(key,value)=>setUpload(s=>({...s,[key]:value}));
 async function load(query=selectedFilter){
  setLoading(true);
  try{
   const params=new URLSearchParams({limit:'100'});
   for(const [key,value] of Object.entries(query)){
    if(value) params.set(key,value.trim());
   }
   const requests=[call('/resources?'+params.toString())];
   if(isTeacher)requests.push(call('/me/resources'));
   const [catalog,owned=[]]=await Promise.all(requests);
   setResources(Array.isArray(catalog)?catalog:[]);
   setMyFiles(Array.isArray(owned)?owned:[]);
   setError('');
  }catch(err){setError(err.message||'Unable to load academic resources.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{load({});},[]);

 async function publish(event){
  event.preventDefault();
  if(!selectedFile){setError('Choose a PDF document first.');return;}
  if(selectedFile.size>8*1024*1024){
   setError('PDF cannot exceed 8 MB.');return;
  }
  if(!/\.pdf$/i.test(selectedFile.name)){
   setError('Only PDF files are allowed.');return;
  }
  const body=new FormData();
  for(const [key,value] of Object.entries(upload)) body.append(key,value);
  body.append('file',selectedFile,selectedFile.name);
  const ok=await act(()=>uploadAcademicPdf(user,body),
    'Your PDF is published to the academic library.');
  if(ok){
   setUpload(emptyUpload);
   setSelectedFile(null);
   if(fileRef.current)fileRef.current.value='';
   await load();
  }
 }

 async function openFile(resource){
  if(downloading)return;
  setError('');
  setDownloading(resource.id);
  try {await downloadAcademicPdf(user,resource);}
  catch(e){setError(e.message||'PDF download failed.');}
  finally{setDownloading(null);}
 }

 async function archive(resource){
  if(!window.confirm('Archive this resource? Students will lose access to its PDF.'))return;
  const ok=await act(()=>call('/resources/'+resource.id+'/archive',{
    method:'POST',body:{}
  }),'Resource archived.');
  if(ok)await load();
 }

 const list=items=><div className="wc-resource-grid">
  {items.map(item=><article key={item.id} className="wc-resource">
   <div className="wc-resource-heading"><span>PDF</span>
    <small>{item.program} · Semester {item.semester}</small>
   </div>
   <h3>{item.title}</h3>
   <p>{item.description||'Faculty-provided course material.'}</p>
   <div className="wc-resource-meta">
    <b>{item.courseCode}</b>
    <span>{formatSize(item.sizeBytes)}</span>
   </div>
   <small className="wc-resource-filename">{item.fileName}</small>
   <div className="wc-resource-actions">
    {item.status==='published'&&<button type="button" className="wc-primary"
      disabled={downloading===item.id} onClick={()=>openFile(item)}>
      {downloading===item.id?'Downloading…':'Download PDF'}
    </button>}
    {item.status==='archived'&&<span className="wc-tag warn">Archived</span>}
    {(isAdmin||isTeacher&&myFiles.some(x=>x.id===item.id))&&item.status==='published'&&
      <button type="button" className="wc-outline dangerous"
       disabled={busy} onClick={()=>archive(item)}>Archive</button>}
   </div>
  </article>)}
 </div>;
 return <div className="wc-stack">
  <section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">CAMPUS LEARNING LIBRARY</span>
    <h2>Academic Resources</h2>
    <p>Find notes and course PDFs published by verified Faculty. Downloads require an authenticated university account.</p>
   </div><span className="wc-tag blue">{resources.length} PDF(s)</span></div>
   <form className="wc-resource-filter" onSubmit={e=>{e.preventDefault();
     setSelectedFilter({...filter});load(filter);}}>
    <label>Program<input value={filter.program} maxLength={24} placeholder="BSE"
     onChange={e=>setFilter(s=>({...s,program:e.target.value}))}/></label>
    <label>Semester<input type="number" min="1" max="12" value={filter.semester}
     placeholder="All" onChange={e=>setFilter(s=>({...s,semester:e.target.value}))}/></label>
    <label>Course code<input value={filter.courseCode} maxLength={24}
     placeholder="CSC494" onChange={e=>setFilter(s=>({...s,courseCode:e.target.value}))}/></label>
    <button className="wc-primary" type="submit">Search</button>
    <button type="button" className="wc-outline" onClick={()=>{setFilter({program:'',semester:'',courseCode:''});setSelectedFilter({});load({});}}>Clear</button>
   </form>
   {error&&<div role="alert" className="wc-resource-error">{error}</div>}
   {loading?<p className="wc-resource-muted">Loading course resources…</p>:
    resources.length?list(resources):
    <div className="wc-empty"><span>▤</span><h3>No course PDFs published yet</h3>
     <p>Once verified Faculty upload their notes, students can find and download them here.</p>
    </div>}
  </section>
  {isTeacher&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">VERIFIED FACULTY</span>
    <h2>Upload course notes</h2>
    <p>PDF only, up to 8 MB. Uploaded documents are campus-only and downloadable through authenticated requests.</p>
   </div></div>
   <form className="wc-form" onSubmit={publish}>
    <label>Resource title<input required maxLength={160} minLength={3}
      value={upload.title} onChange={e=>setField('title',e.target.value)}
      placeholder="Software Project Management — Week 1"/></label>
    <label>Short description<textarea maxLength={1200} rows={3}
      value={upload.description} onChange={e=>setField('description',e.target.value)}
      placeholder="Topics covered in this lecture"/></label>
    <div className="wc-form-pair">
     <label>Program<input required maxLength={24} value={upload.program}
      onChange={e=>setField('program',e.target.value)}/></label>
     <label>Semester<input required type="number" min="1" max="12"
      value={upload.semester} onChange={e=>setField('semester',e.target.value)}/></label>
     <label>Course code<input required maxLength={24} value={upload.courseCode}
      onChange={e=>setField('courseCode',e.target.value)}
      placeholder="CSC494"/></label>
     <label>Lecture PDF<input required ref={fileRef} type="file"
      accept="application/pdf,.pdf" onChange={e=>setSelectedFile(e.target.files?.[0]??null)}/></label>
    </div>
    <button type="submit" disabled={busy} className="wc-primary">
     {busy?'Uploading…':'Publish PDF notes'}
    </button>
   </form>
  </section>}
  {isTeacher&&<section className="wc-panel">
   <div className="wc-head"><div><span className="wc-kicker">MY FACULTY UPLOADS</span>
    <h2>Your published and archived notes</h2></div></div>
   {myFiles.length?list(myFiles):
    <div className="wc-empty"><h3>No uploads yet</h3><p>Your academic documents will appear here.</p></div>}
  </section>}
 </div>;
}
