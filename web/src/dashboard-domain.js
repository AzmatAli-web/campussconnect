// Pure presentation and input rules. API permission checks always happen in Express.
export const activeRoles=p=>p?.status==='active'&&Array.isArray(p.activeRoles)?p.activeRoles:[];
export const hasRole=(p,role)=>activeRoles(p).includes(role);
export const isVerifiedFaculty=p=>hasRole(p,'faculty')&&p.facultyVerificationStatus==='verified';
export const canOrganize=p=>isVerifiedFaculty(p)||hasRole(p,'societyManager');
export const displayRole=p=>hasRole(p,'admin')?'Administrator':isVerifiedFaculty(p)?'Faculty':hasRole(p,'societyManager')?'Society Manager':hasRole(p,'staff')?'Staff':'Student';
export function navigationFor(profile){
 const items=[['overview','Overview','◫'],['events','Explore events','▣']];
 if(hasRole(profile,'student'))items.push(['registrations','My registrations','✓']);
 items.push(['announcements','Announcements','◉']);
 if(canOrganize(profile))items.push(['organizer','Organizer studio','✦']);
 if(hasRole(profile,'admin'))items.push(['admin','Administration','⚙']);
 return items.map(([id,label,icon])=>({id,label,icon}));
}
export const formatDate=value=>{
 const date=new Date(value);
 return value&&!Number.isNaN(date.valueOf())?new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short'}).format(date):'Date unavailable';
};
export const eventFull=e=>Number(e.confirmedCount)>=Number(e.capacity)||e.isFull===true;
export const myRegistration=(eventId,regs)=>Array.isArray(regs)&&regs.some(x=>x.eventId===eventId&&x.status==='confirmed');
export function buildEventPayload(form,now=new Date()){
 const title=String(form.title??'').trim(),description=String(form.description??'').trim(),venue=String(form.venue??'').trim(),capacity=Number(form.capacity);
 if(title.length<3||title.length>150)throw new Error('Title must have 3–150 characters.');
 if(description.length<10||description.length>5000)throw new Error('Description must have 10–5000 characters.');
 if(venue.length<2||venue.length>250)throw new Error('Venue must have 2–250 characters.');
 if(!Number.isInteger(capacity)||capacity<1||capacity>100000)throw new Error('Capacity must be 1–100000.');
 const keys=['registrationOpensAt','registrationClosesAt','startsAt','endsAt'],dates={};
 for(const key of keys){
  if(!form[key]||!Number.isFinite(new Date(form[key]).valueOf()))throw new Error('Enter four valid dates.');
  dates[key]=new Date(form[key]);
 }
 if(!(dates.registrationOpensAt<dates.registrationClosesAt&&dates.registrationClosesAt<=dates.startsAt&&dates.startsAt<dates.endsAt&&dates.startsAt>now&&dates.registrationClosesAt>now)){
  throw new Error('Registration and event dates must be chronological and in the future.');
 }
 const societyId=form.societyId||null;
 if(societyId!==null&&!/^[a-f\d]{24}$/i.test(societyId))throw new Error('Choose an approved society.');
 return {title,description,venue,capacity,societyId,...Object.fromEntries(keys.map(key=>[key,dates[key].toISOString()]))};
}
export function buildAnnouncementPayload(form,profile){
 const title=String(form.title??'').trim(),body=String(form.body??'').trim(),scope=form.scope;
 if(title.length<3||title.length>180||body.length<5||body.length>10000)throw new Error('Enter a valid title and message.');
 if(scope==='society'){
  if(!hasRole(profile,'societyManager')||!/^[a-f\d]{24}$/i.test(form.societyId||''))throw new Error('Choose a society you manage.');
  return {title,body,scope,societyId:form.societyId};
 }
 if(!isVerifiedFaculty(profile))throw new Error('Verified Faculty approval is required.');
 if(scope==='department'){
  if(!profile.departmentId)throw new Error('No department is assigned to your account.');
  return {title,body,scope,departmentId:profile.departmentId};
 }
 if(scope!=='university')throw new Error('Invalid audience.');
 return {title,body,scope:'university'};
}
export function registrationAttemptKey(keys,eventId,create=()=>crypto.randomUUID()){
 if(!eventId)throw new Error('Event required');
 if(!keys.has(eventId))keys.set(eventId,create());
 return keys.get(eventId);
}