import React,{useEffect,useState} from 'react';
import {createUserWithEmailAndPassword,sendEmailVerification,signInWithEmailAndPassword,signOut,onAuthStateChanged,reload} from 'firebase/auth';
import {auth,firebaseConfigured} from './firebase';
import {callApi} from './api';
const domain=(import.meta.env.VITE_UNIVERSITY_EMAIL_DOMAIN||'').trim().toLowerCase();
const matchesUniversity=email=>domain&&email.toLowerCase().trim().endsWith('@'+domain);
const readableError=err=>{
 const map={
  'auth/email-already-in-use':'An account already exists with this email.',
  'auth/invalid-email':'Enter a valid email address.',
  'auth/weak-password':'Choose a stronger password.',
  'auth/invalid-credential':'Incorrect email or password.',
  'auth/too-many-requests':'Too many attempts; try again later.'
 };
 return map[err?.code]||err?.message||'Something went wrong.';
};
export default function App(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [name,setName]=useState(''),[registrationNo,setRegistrationNo]=useState('');
 const [profile,setProfile]=useState(null),[needsProfile,setNeedsProfile]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  if(!auth){setLoading(false);return;}
  return onAuthStateChanged(auth,async(next)=>{
   setUser(next);setLoading(false);setProfile(null);setNeedsProfile(false);setMessage('');setError('');
   if(next && next.emailVerified) {
    try{const data=await callApi('/me',next);setProfile(data);}
    catch(err){if(err.code==='PROFILE_NOT_FOUND')setNeedsProfile(true);else setError(readableError(err));}
   }
  });
 },[]);
 async function handleCredentials(e){
  e.preventDefault();setError('');setMessage('');
  if(!matchesUniversity(email)){setError('Use your verified university email ending in @'+(domain||'the approved domain'));return;}
  setBusy(true);
  try{
   if(mode==='register'){
    const {user:created}=await createUserWithEmailAndPassword(auth,email.trim(),password);
    await sendEmailVerification(created);
    await signOut(auth);
    setMode('login');setPassword('');
    setMessage('Verification email sent. Open the email link, then sign in.');
   }else{
    const result=await signInWithEmailAndPassword(auth,email.trim(),password);
    await reload(result.user);
    await result.user.getIdToken(true);
    if(!result.user.emailVerified)setMessage('Please verify your email before creating a campus profile.');
   }
  }catch(err){setError(readableError(err));}finally{setBusy(false);}
 }
 async function afterVerification(){
  setBusy(true);setError('');setMessage('');
  try{
   await reload(auth.currentUser);
   await auth.currentUser.getIdToken(true);
   if(!auth.currentUser.emailVerified){setMessage('Email is not verified yet. Check your inbox.');return;}
   try{setProfile(await callApi('/me',auth.currentUser));}
   catch(err){if(err.code==='PROFILE_NOT_FOUND')setNeedsProfile(true);else throw err;}
  }catch(err){setError(readableError(err));}finally{setBusy(false);}
 }
 async function resend(){
  setBusy(true);setError('');setMessage('');
  try{await sendEmailVerification(auth.currentUser);setMessage('Verification email sent again.');}
  catch(err){setError(readableError(err));}finally{setBusy(false);}
 }
 async function saveProfile(e){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const created=await callApi('/auth/bootstrap-profile',auth.currentUser,{
    method:'POST',body:{fullName:name.trim(),registrationNo:registrationNo.trim()||null,requestedRole:'student'}
   });
   setProfile(created);setNeedsProfile(false);setMessage('Student profile created.');
  }catch(err){setError(readableError(err));}finally{setBusy(false);}
 }
 const signed=user&&user.emailVerified;
 return <main className="shell">
  <header><div className="logo">CC</div><div><strong>CampusConnect</strong><small>COMSATS Abbottabad · MVP</small></div></header>
  <section className="panel">
   <span className="eyebrow">Student access</span>
   <h1>{!firebaseConfigured?'Complete Firebase setup':loading?'Loading…':!user?(mode==='login'?'Welcome back':'Create your account'):!user.emailVerified?'Verify your university email':profile?'Your student profile':'Complete your campus profile'}</h1>
   <p className="intro">Secure university access powered by Firebase Authentication and MongoDB.</p>
   {!firebaseConfigured&&<p className="notice">Copy <code>web/.env.example</code> to <code>web/.env</code> and fill in the Firebase Web SDK config from Firebase Console → Project settings → Your apps → Config.</p>}
   {error&&<p role="alert" className="error">{error}</p>}
   {message&&<p role="status" className="success">{message}</p>}
   {firebaseConfigured&&!loading&&!user&&<form onSubmit={handleCredentials}>
    <label>University email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={'student@'+(domain||'university.edu.pk')}/></label>
    <label>Password<input required minLength={6} type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <button disabled={busy} type="submit">{busy?'Working…':mode==='login'?'Sign in':'Create account'}</button>
    <button className="link" type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setMessage('');}}>{mode==='login'?'New here? Create a student account':'Already registered? Sign in'}</button>
   </form>}
   {firebaseConfigured&&!loading&&user&&!user.emailVerified&&<div className="stack">
    <p>We sent a verification link to <strong>{user.email}</strong>. After opening it, return here.</p>
    <button disabled={busy} onClick={afterVerification}>I've verified my email</button>
    <button disabled={busy} className="secondary" onClick={resend}>Resend verification email</button>
    <button className="link" onClick={()=>signOut(auth)}>Sign out</button>
   </div>}
   {firebaseConfigured&&!loading&&signed&&!needsProfile&&!profile&&<div className="stack">
    <p>Your email is verified, but your campus profile could not be loaded. Check the backend configuration, then retry.</p>
    <button disabled={busy} onClick={afterVerification}>Retry profile connection</button>
    <button className="secondary" type="button" onClick={()=>signOut(auth)}>Sign out / Switch account</button>
   </div>}
   {firebaseConfigured&&!loading&&signed&&needsProfile&&<form onSubmit={saveProfile}>
    <label>Full name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required autoComplete="name"/></label>
    <label>Registration number (optional)<input value={registrationNo} onChange={e=>setRegistrationNo(e.target.value)} maxLength={40} placeholder="FA23-BSE-000"/></label>
    <button disabled={busy} type="submit">{busy?'Saving…':'Create student profile'}</button>
    <button className="link" type="button" onClick={()=>signOut(auth)}>Sign out</button>
   </form>}
   {firebaseConfigured&&!loading&&signed&&profile&&<div className="stack">
    <p><strong>{profile.fullName}</strong></p><p>{profile.emailNormalized}</p>
    <p>Account: <strong>{profile.status}</strong></p>
    <p>Roles: <strong>{(profile.activeRoles||[]).join(', ')||'none'}</strong></p>
    <p className="notice">Authentication foundation is ready. Events and other modules will be added later.</p>
    <button className="secondary" onClick={()=>signOut(auth)}>Sign out</button>
   </div>}
  </section>
  <footer>Students must verify their official university email. Faculty, Staff and Admin access requires separate authorization.</footer>
 </main>;
}
