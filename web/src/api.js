const base=(import.meta.env.VITE_API_BASE_URL||'http://localhost:4000/api/v1').replace(/\/$/,'');
export async function callApi(path,user,{method='GET',body,headers={}}={}){
 const token=await user.getIdToken();
 let response;
 try{
  response=await fetch(base+path,{
   method,cache:'no-store',headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
 }catch{throw new Error('Cannot reach backend. Check that Express is running on port 4000.');}
 let result;
 try{result=await response.json();}catch{throw new Error('Backend returned an invalid response');}
 if(!response.ok){
  const error=new Error(result?.error?.message||'Request failed');
  error.status=response.status;
  error.code=result?.error?.code;
  throw error;
 }
 return result.data;
}

/** Multipart form upload: browser supplies boundary, Firebase supplies ID token. */
export async function uploadAcademicPdf(user, form) {
 const token = await user.getIdToken();
 let response;
 try {
  response = await fetch(base+'/resources',{
   method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+token},
   body:form
  });
 } catch {throw new Error('Cannot reach the campus backend for PDF upload.');}
 const payload = await response.json().catch(()=>null);
 if(!response.ok){
  const error=new Error(payload?.error?.message||'PDF upload failed.');
  error.code=payload?.error?.code;
  error.status=response.status;
  throw error;
 }
 return payload.data;
}

/** Authenticated binary download, NOT a public PDF URL. */
export async function downloadAcademicPdf(user, resource) {
 if(!/^[0-9a-f]{24}$/.test(String(resource.id))) {
  throw new Error('Invalid academic resource identifier.');
 }
 const token=await user.getIdToken();
 let response;
 try {
  response=await fetch(base+'/resources/'+resource.id+'/file',{
   cache:'no-store',headers:{Authorization:'Bearer '+token,
    Accept:'application/pdf'}
  });
 } catch {throw new Error('Cannot reach the campus backend for PDF download.');}
 if(!response.ok){
  const data=await response.json().catch(()=>null);
  throw new Error(data?.error?.message||'PDF download unavailable.');
 }
 const length=Number(response.headers.get('content-length')||0);
 if(length>8*1024*1024)throw new Error('PDF exceeds the allowed size.');
 if(!String(response.headers.get('content-type')||'').includes('application/pdf')){
  throw new Error('Backend returned a non-PDF file.');
 }
 const blob=await response.blob();
 if(blob.size>8*1024*1024)throw new Error('PDF exceeds the allowed size.');
 const name=String(resource.fileName||'campus-notes.pdf')
  .split(/[\\/]/).pop().replace(/[^a-zA-Z0-9 ._()-]/g,'_');
 const filename=/\.pdf$/i.test(name)?name:'campus-notes.pdf';
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement('a');
 anchor.href=url;
 anchor.download=filename;
 anchor.style.display='none';
 document.body.appendChild(anchor);
 anchor.click();
 anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
