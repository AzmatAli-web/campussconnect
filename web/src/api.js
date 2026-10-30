const base=(import.meta.env.VITE_API_BASE_URL||'http://localhost:4000/api/v1').replace(/\/$/,'');
export async function callApi(path,user,{method='GET',body}={}){
 const token=await user.getIdToken(true);
 let response;
 try{
  response=await fetch(base+path,{
   method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
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
