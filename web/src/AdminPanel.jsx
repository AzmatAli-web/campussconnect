import React,{useState} from 'react';
import {formatDate} from './dashboard-domain.js';

const Header=({kicker,title,desc})=><div className="wc-head"><div><span className="wc-kicker">{kicker}</span><h2>{title}</h2>{desc&&<p>{desc}</p>}</div></div>;
const Empty=({text})=><p className="wc-empty">{text}</p>;
const initialReview={method:'facultyEmail',evidenceReference:'',reviewNote:'',attested:false};

export default function AdminPanel({data,call,act,busy,showRoster,openRoster,rosters}){
 const users=data.users||[],societies=data.societies||[],audits=data.audit||[],events=data.events||[];
 const [target,setTarget]=useState('');
 const [review,setReview]=useState(initialReview);
 const [society,setSociety]=useState({name:'',slug:'',description:''});
 const [assignment,setAssignment]=useState({societyId:'',userId:''});
 const [staff,setStaff]=useState('');
 const [moderation,setModeration]=useState({userId:'',status:'suspended',reason:''});
 const pending=users.filter(u=>u.requestedRole==='faculty'&&u.status==='pending'&&u.facultyVerificationStatus!=='verified');
 const active=users.filter(u=>u.status==='active'&&!u.activeRoles.includes('admin'));
 async function approve(e){e.preventDefault();const ok=await act(()=>call('/admin/users/'+target+'/verify-faculty',{method:'POST',body:review}),'Faculty approved after independent evidence review.');if(ok){setTarget('');setReview(initialReview);}}
 async function addSociety(e){e.preventDefault();const ok=await act(()=>call('/admin/societies',{method:'POST',body:society}),'Campus society created.');if(ok)setSociety({name:'',slug:'',description:''});}
 async function assign(e){e.preventDefault();await act(()=>call('/admin/society-manager-assignments',{method:'POST',body:assignment}),'Society Manager assigned.');}
 async function invite(e){e.preventDefault();const ok=await act(()=>call('/admin/staff-invitations',{method:'POST',body:{universityEmail:staff.trim()}}),'Staff invitation record created. This does not send email or automatically activate Staff access.');if(ok)setStaff('');}
 async function status(e){e.preventDefault();await act(()=>call('/admin/users/'+moderation.userId+'/status',{method:'PATCH',body:{status:moderation.status,reason:moderation.reason}}),'Account status updated.');}
 return <div className="wc-stack">
  <div className="wc-admin-banner"><strong>Restricted Admin workspace</strong><small>Every operation is checked by the backend against a real Firebase identity and an active Admin role. The Demo Administrator cannot enter this screen.</small></div>
  <div className="wc-metrics"><div className="wc-metric"><small>Campus users</small><strong>{users.length}</strong><em>First 100 records</em></div><div className="wc-metric"><small>Published events</small><strong>{events.length}</strong><em>Campus records</em></div><div className="wc-metric"><small>Societies</small><strong>{societies.length}</strong><em>Active groups</em></div><div className="wc-metric"><small>Audit entries</small><strong>{audits.length}</strong><em>Recent actions</em></div></div>
  <div className="wc-columns">
   <section className="wc-panel"><Header kicker="FACULTY VERIFICATION" title="Approve faculty" desc="Review official faculty evidence independently before approving."/>
    <form className="wc-form" onSubmit={approve}>
     <label>Pending applicant<select value={target} required onChange={e=>setTarget(e.target.value)}><option value="">Choose a faculty applicant</option>{pending.map(u=><option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}</select></label>
     <label>Evidence method<select value={review.method} onChange={e=>setReview({...review,method:e.target.value})}><option value="facultyEmail">Verified faculty roster / email</option><option value="document">Document independently reviewed</option></select></label>
     <label>Evidence reference<input required minLength="6" maxLength="300" value={review.evidenceReference} onChange={e=>setReview({...review,evidenceReference:e.target.value})}/></label>
     <label>Review note<textarea required minLength="10" rows="3" value={review.reviewNote} onChange={e=>setReview({...review,reviewNote:e.target.value})} placeholder="Describe how the evidence was verified"/></label>
     <label className="wc-checkbox"><input type="checkbox" checked={review.attested} onChange={e=>setReview({...review,attested:e.target.checked})}/>I independently verified the faculty identity.</label>
     <button className="wc-primary" disabled={busy||!target||!review.attested}>Approve Faculty</button>
    </form>
   </section>
   <section className="wc-panel"><Header kicker="SOCIETY ACCESS" title="Create society"/>
    <form className="wc-form" onSubmit={addSociety}><label>Name<input required minLength="3" value={society.name} onChange={e=>setSociety({...society,name:e.target.value})} placeholder="Computing Society"/></label>
     <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={society.slug} onChange={e=>setSociety({...society,slug:e.target.value})} placeholder="computing-society"/></label>
     <label>Purpose<textarea required minLength="10" rows="3" value={society.description} onChange={e=>setSociety({...society,description:e.target.value})}/></label><button className="wc-primary" disabled={busy}>Create society</button></form>
    <div className="wc-divider"/><Header kicker="SOCIETY APPROVAL" title="Assign a manager"/>
    <form className="wc-form" onSubmit={assign}><label>Society<select value={assignment.societyId} required onChange={e=>setAssignment({...assignment,societyId:e.target.value})}><option value="">Choose society</option>{societies.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>Verified campus user<select required value={assignment.userId} onChange={e=>setAssignment({...assignment,userId:e.target.value})}><option value="">Choose user</option>{active.map(u=><option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}</select></label>
     <button className="wc-primary" disabled={busy||!assignment.societyId||!assignment.userId}>Assign manager</button></form>
   </section>
  </div>
  <div className="wc-columns">
   <section className="wc-panel"><Header kicker="STAFF INVITATIONS" title="Create staff invitation" desc="Invitation records expire after seven days. Email delivery and activation are separate tasks."/>
    <form className="wc-form" onSubmit={invite}><label>Official campus email<input required type="email" value={staff} onChange={e=>setStaff(e.target.value)} placeholder="staff@cuiatd.edu.pk"/></label><button className="wc-primary" disabled={busy}>Create invitation record</button></form>
   </section>
   <section className="wc-panel"><Header kicker="ACCOUNT MODERATION" title="Suspend or reactivate" desc="Admin accounts are protected. Pending users need role-specific approval."/>
    <form className="wc-form" onSubmit={status}><label>User<select value={moderation.userId} required onChange={e=>setModeration({...moderation,userId:e.target.value})}><option value="">Choose non-Admin user</option>{active.concat(users.filter(u=>u.status==='suspended'&&!u.activeRoles.includes('admin'))).map(u=><option key={u.id} value={u.id}>{u.fullName} · {u.status}</option>)}</select></label>
     <label>Target status<select value={moderation.status} onChange={e=>setModeration({...moderation,status:e.target.value})}><option value="suspended">Suspend</option><option value="active">Reactivate</option></select></label>
     <label>Reason<textarea required minLength="8" maxLength="500" rows="3" value={moderation.reason} onChange={e=>setModeration({...moderation,reason:e.target.value})}/></label><button className="wc-outline dangerous" disabled={busy||!moderation.userId}>Apply status change</button></form>
   </section>
  </div>
  <section className="wc-panel"><Header kicker="PRIVATE USERS" title="Users and roles" desc="Personally identifiable user records are not shown to Students."/>
   {users.length?<div className="wc-tablewrap"><table><thead><tr><th>Name</th><th>University email</th><th>Status</th><th>Roles</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.fullName}</td><td>{u.email}</td><td>{u.status}</td><td>{(u.activeRoles||[]).join(', ')||'Pending'}</td></tr>)}</tbody></table></div>:<Empty text="No accounts found."/>}
  </section>
  <section className="wc-panel"><Header kicker="RESTRICTED ROSTERS" title="Private event attendee review" desc="Only an Administrator or the event's current organizer can query registrations."/>
   {events.length?events.map(event=><div className="wc-compact" key={event.id}><span>▣</span><div><strong>{event.title}</strong><small>{event.confirmedCount}/{event.capacity} confirmed</small>{openRoster===event.id&&<div className="wc-roster"><strong>Private attendee list</strong>{!rosters[event.id]?<p>Loading…</p>:rosters[event.id].length===0?<p>No attendees yet.</p>:<ul>{rosters[event.id].map(person=><li key={person.id}><strong>{person.studentName||'Student'}</strong><small>{person.universityEmail} · {person.registrationNo||'No registration number'}</small></li>)}</ul>}</div>}</div><button className="wc-outline" onClick={()=>showRoster(event.id)}>{openRoster===event.id?'Hide':'View roster'}</button></div>):<Empty text="No published events available."/>}
  </section>
  <section className="wc-panel"><Header kicker="AUDIT TRAIL" title="Recent privileged activity"/>{audits.length?audits.map(a=><div className="wc-compact" key={a._id||a.id}><span>◈</span><div><strong>{a.action}</strong><small>{formatDate(a.occurredAt)} · {a.targetType}</small></div></div>):<Empty text="No audit entries yet."/>}</section>
 </div>;
}
