import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import CampusWorkspace from '../../src/CampusWorkspace.jsx';
import {callApi} from '../../src/api.js';

const roles = {admin: 'Test Admin', student: 'Test Student', faculty: 'Test Faculty', applicant: 'Faculty Applicant'};
const query = new URLSearchParams(location.search).get('as');
const persona = Object.hasOwn(roles, query) ? query : 'admin';
const user = {getIdToken: async () => 'lab-' + persona};

function AdminLab(){
 const [profile,setProfile]=useState(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(location.hostname!=='127.0.0.1'||import.meta.env.CAMPUS_ADMIN_LAB!==true||
     import.meta.env.VITE_API_BASE_URL!=='/api/v1'){
   setFailed(true);
   return;
  }
  callApi('/me',user).then(setProfile,()=>setFailed(true));
 },[]);
 return <>
  <header style={{padding:'12px 16px',background:'#fef2c8',color:'#18273a',font:'16px system-ui'}}>
   <strong>Admin Lab · Fictional accounts only</strong>
   <nav aria-label="Test accounts" style={{display:'flex',flexWrap:'wrap',gap:'12px',marginTop:'6px'}}>
    {Object.entries(roles).map(([id,name])=><a key={id} href={'?as='+id} aria-current={persona===id?'page':undefined}>{name}</a>)}
   </nav>
  </header>
  {failed?<p role="alert">Start the standalone Admin Lab and open the URL printed in its terminal.</p>:
   profile?<CampusWorkspace user={user} profile={profile} onProfileChange={setProfile}
    onSignOut={()=>{location.search='?as=student';}}/>:<p>Loading fictional campus profile…</p>}
 </>;
}

createRoot(document.getElementById('root')).render(<AdminLab/>);
