export function groupCourseResources(resources) {
 if(!Array.isArray(resources))return [];
 const grouped=new Map();
 for(const resource of resources){
  const program=String(resource.program??'').trim();
  const semester=Number(resource.semester);
  const course=String(resource.courseCode??'').trim();
  const key=JSON.stringify([program,semester,course]);
  if(!grouped.has(key))grouped.set(key,{key,program,semester,course,items:[]});
  grouped.get(key).items.push(resource);
 }
 return [...grouped.values()].sort((a,b)=>a.program.localeCompare(b.program)
  ||a.semester-b.semester||a.course.localeCompare(b.course));
}

export function cleanResourceSearch(values) {
 const q=String(values?.q??'').trim();
 if(q.length===1||q.length>64)throw new Error('Keyword search must have 2–64 characters.');
 const query={};
 for(const field of ['program','semester','courseCode']){
  const value=String(values?.[field]??'').trim();
  if(value)query[field]=value;
 }
 if(q)query.q=q;
 return query;
}
