// Local browser walkthrough ONLY: no API calls, Firebase tokens, or database writes.
export const demoProfiles=[
 {id:'demo-admin',name:'Demo Administrator',email:'admin.fixture@example.test',roles:['admin'],status:'active',requestedRole:'admin',verified:true,societyIds:[]},
 {id:'demo-faculty',name:'Faculty Applicant',email:'faculty.fixture@example.test',roles:[],status:'pending',requestedRole:'faculty',verified:true,societyIds:[]},
 {id:'demo-manager',name:'Society Applicant',email:'manager.fixture@example.test',roles:['student'],status:'active',requestedRole:'student',verified:true,societyIds:[]},
 ...Array.from({length:4},(_,i)=>({id:'demo-student-'+(i+1),name:'Demo Student '+(i+1),email:'student'+(i+1)+'.fixture@example.test',roles:['student'],status:'active',requestedRole:'student',verified:true,societyIds:[]}))
];
const now=()=>new Date().toISOString();
export function createInitialLab(){
 return {
  people:demoProfiles.map(p=>({...p,roles:[...p.roles],societyIds:[...p.societyIds]})),
  societies:[{id:'society-1',name:'Computing Society'}],
  events:[{id:'event-1',title:'Campus Dev Meetup',description:'Build and learn together.',venue:'CS Auditorium',capacity:3,organizerId:'demo-admin',organizer:'Demo Seed',status:'published',createdAt:now()}],
  registrations:[],
  announcements:[{id:'announcement-1',title:'Welcome to CampusConnect',body:'All fixtures are local and can be reset anytime.',scope:'university',authorId:'demo-admin',createdAt:now()}],
  audit:[{id:'audit-seed',label:'Isolated demo data loaded',createdAt:now()}]
 };
}
const refuse=(code,message)=>({ok:false,code,message});
const succeed=(next,message)=>({ok:true,next,message});
const acting=(state,actorId)=>state.people.find(p=>p.id===actorId);
const privileged=(p,role)=>p?.status==='active'&&p.roles.includes(role);
const record=(state,label,access={visibility:'public'})=>[
 {id:'audit-'+Math.random().toString(36).slice(2),label,createdAt:now(),...access},
 ...state.audit
].slice(0,20);

// Render only activity that belongs to the current persona or is approved for general viewing.
// This is only a browser-memory simulation; the real API must enforce access independently.
export function visibleActivity(state,viewerId) {
 const viewer=acting(state,viewerId);
 if(!viewer) return [];
 return state.audit.filter(item=>{
  if(item.visibility==='registration') return item.studentId===viewer.id;
  if(item.visibility==='admin') return privileged(viewer,'admin');
  return item.visibility==='public' || item.visibility===undefined;
 });
}

// Full attendee identities are visible only to the event creator or authorized administrator.
// Returns null (not an empty list) for unauthorized viewers.
export function registrantsForViewer(state,viewerId,eventId) {
 const viewer=acting(state,viewerId);
 const event=state.events.find(e=>e.id===eventId);
 if(!viewer || !event) return null;
 if(!privileged(viewer,'admin') && event.organizerId!==viewerId) return null;
 return state.registrations.filter(r=>r.eventId===eventId).map(r=>({
  id:r.id,
  name:state.people.find(p=>p.id===r.studentId)?.name??'Unknown student',
  createdAt:r.createdAt
 }));
}

export function applyDemoAction(state,actorId,type,payload={}){
 const actor=acting(state,actorId);
 if(!actor) return refuse('NO_ACTOR','Choose a test persona.');
 if(type==='approveFaculty'){
  if(!privileged(actor,'admin')) return refuse('FORBIDDEN','Only the Demo Admin can approve faculty.');
  const target=acting(state,'demo-faculty');
  if(target.status!=='pending') return refuse('ALREADY_APPROVED','Faculty already approved.');
  return succeed({...state,people:state.people.map(p=>p.id!==target.id?p:{
   ...p,status:'active',verified:true,roles:[...new Set([...p.roles,'faculty'])]
  }),audit:record(state,'Faculty applicant approved by Demo Admin',{visibility:'admin'})},'Faculty approved for this local demo.');
 }
 if(type==='assignManager'){
  if(!privileged(actor,'admin')) return refuse('FORBIDDEN','Only the Demo Admin can assign a manager.');
  const target=acting(state,'demo-manager');
  if(target.societyIds.includes('society-1')) return refuse('ALREADY_ASSIGNED','Manager already assigned.');
  return succeed({...state,people:state.people.map(p=>p.id!==target.id?p:{
   ...p,roles:[...new Set([...p.roles,'societyManager'])],societyIds:[...p.societyIds,'society-1']
  }),audit:record(state,'Computing Society Manager approved',{visibility:'admin'})},'Manager assigned to Computing Society.');
 }
 if(type==='createEvent'){
  const faculty=privileged(actor,'faculty');
  const manager=privileged(actor,'societyManager')&&actor.societyIds.length>0;
  if(!faculty&&!manager) return refuse('FORBIDDEN','Only approved Faculty or assigned Society Managers can publish events.');
  const title=String(payload.title??'').trim(),venue=String(payload.venue??'').trim();
  const capacity=Number(payload.capacity);
  if(title.length<3||venue.length<2||!Number.isInteger(capacity)||capacity<1||capacity>1000)
   return refuse('INVALID_EVENT','Enter a title, venue, and capacity from 1 to 1,000.');
  const event={id:'event-'+Math.random().toString(36).slice(2),title,
    description:String(payload.description||'Campus learning event.'),venue,capacity,
    organizerId:actor.id,organizer:actor.name,status:'published',createdAt:now()};
  return succeed({...state,events:[event,...state.events],audit:record(state,'Published event: '+title)},'Event published in demo memory.');
 }
 if(type==='publishAnnouncement'){
  const faculty=privileged(actor,'faculty');
  const manager=privileged(actor,'societyManager')&&actor.societyIds.length>0;
  if(!faculty&&!manager) return refuse('FORBIDDEN','Only approved Faculty or assigned Society Managers can publish notices.');
  const title=String(payload.title??'').trim(),body=String(payload.body??'').trim();
  if(title.length<3||body.length<5) return refuse('INVALID_ANNOUNCEMENT','Enter a title and message.');
  const a={id:'announcement-'+Math.random().toString(36).slice(2),
   title,body,scope:manager&&!faculty?'society':'university',authorId:actor.id,createdAt:now()};
  return succeed({...state,announcements:[a,...state.announcements],audit:record(state,'Published notice: '+title)},'Announcement published in demo memory.');
 }
 if(type==='register'){
  if(!privileged(actor,'student')) return refuse('FORBIDDEN','Only active Student personas can register.');
  const event=state.events.find(e=>e.id===payload.eventId&&e.status==='published');
  if(!event) return refuse('EVENT_NOT_FOUND','This event is not published.');
  if(state.registrations.some(r=>r.eventId===event.id&&r.studentId===actor.id))
   return refuse('ALREADY_REGISTERED','This Student is already registered. No duplicate seat was added.');
  const occupied=state.registrations.filter(r=>r.eventId===event.id).length;
  if(occupied>=event.capacity) return refuse('CAPACITY_REACHED','Event is full. Registration blocked.');
  const registration={id:'reg-'+Math.random().toString(36).slice(2),eventId:event.id,studentId:actor.id,createdAt:now()};
  return succeed({...state,registrations:[...state.registrations,registration],audit:record(state,'Your registration for '+event.title+' was confirmed',{visibility:'registration',studentId:actor.id})},'Registration confirmed in demo memory.');
 }
 return refuse('UNKNOWN_ACTION','Unknown demo action.');
}
export function eventSeats(state,eventId){
 const e=state.events.find(x=>x.id===eventId);
 if(!e) return null;
 const occupied=state.registrations.filter(r=>r.eventId===eventId).length;
 return {occupied,available:Math.max(e.capacity-occupied,0),capacity:e.capacity};
}
