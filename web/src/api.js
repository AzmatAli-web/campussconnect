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
