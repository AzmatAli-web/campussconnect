import React,{useEffect,useState} from 'react';
import './notifications.css';

const targetFor=item=>item.kind==='announcement'?'announcements':
 item.type==='event_registration'?'registrations':
 item.type.startsWith('membership_')?'societies':null;

export default function NotificationsPage({call,choose}){
 const [items,setItems]=useState([]),[cursor,setCursor]=useState(null);
 const [hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function load(older=false){
  if(older&&(!cursor||busy))return;
  if(older)setBusy(true);else setLoading(true);
  try{
   const page=await call('/notifications?limit=20'+
    (older?'&cursor='+encodeURIComponent(cursor):''));
   setItems(prev=>{
    if(!older)return page.items;
    const existing=new Set(prev.map(x=>x.kind+':'+x.id));
    return [...prev,...page.items.filter(x=>!existing.has(x.kind+':'+x.id))];
   });
   setCursor(page.nextCursor);
   setHasMore(page.hasMore===true);
   setError('');
  }catch(e){setError(e.message||'Unable to load your campus inbox.');}
  finally{setLoading(false);setBusy(false);}
 }
 useEffect(()=>{load(false);},[]);
 async function markRead(item,open=false){
  try{
   const result=await call('/notifications/'+item.kind+'/'+item.id+'/read',
    {method:'POST',body:{}});
   setItems(list=>list.map(x=>x.id===item.id&&x.kind===item.kind?
    {...x,readAt:result.readAt}:x));
   const target=targetFor(item);
   if(open&&target)choose(target);
  }catch(e){setError(e.message||'Could not mark this notification as read.');}
 }
 const unread=items.filter(x=>!x.readAt).length;
 return <div className="wc-stack wc-notifications">
  <section className="wc-panel">
   <div className="wc-head">
    <div><span className="wc-kicker">CAMPUSCONNECT UPDATES</span>
     <h2>Notification inbox</h2>
     <p>Private event and membership updates, plus shared campus announcements. Notifications load only when this page is opened.</p>
    </div>
    <button className="wc-outline" onClick={()=>load(false)} disabled={loading||busy}>Refresh</button>
   </div>
   <p className="wc-notification-count">{unread} unread in currently loaded messages</p>
   {error&&<p role="alert" className="wc-notifications-error">{error}</p>}
   {loading?<p>Loading notifications…</p>:
    !items.length?<div className="wc-empty"><h3>Your inbox is empty</h3>
      <p>Event registration confirmations, society membership decisions and announcements will appear here.</p></div>:
    <div className="wc-notification-list">
     {items.map(item=><article key={item.kind+item.id} className={'wc-notification '+(!item.readAt?'unread':'')}>
      <div className="wc-notification-top">
       <span className="wc-kicker">{item.kind==='announcement'?'CAMPUS ANNOUNCEMENT':
        item.type.replaceAll('_',' ').toUpperCase()}</span>
       {!item.readAt&&<span className="wc-tag blue">New</span>}
      </div>
      <h3>{item.title}</h3><p>{item.body}</p>
      <div className="wc-notification-bottom">
       <small>{item.createdAt?new Date(item.createdAt).toLocaleString('en-PK'):'Date unavailable'}</small>
       <div className="wc-notification-actions">
        {!item.readAt&&<button className="wc-outline" onClick={()=>markRead(item)}>Mark read</button>}
        {targetFor(item)&&<button className="wc-primary" onClick={()=>markRead(item,true)}>View section</button>}
       </div>
      </div>
     </article>)}
    </div>}
   {hasMore&&!loading&&<button className="wc-outline wc-notification-more" disabled={busy} onClick={()=>load(true)}>
    {busy?'Loading…':'Load older updates'}
   </button>}
  </section>
 </div>;
}
