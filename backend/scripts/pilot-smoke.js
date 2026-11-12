import 'dotenv/config';
import {readOnlyPilotSmoke} from '../src/services/pilot-readiness.js';

// This command is opt-in, read-only, and restricted to an HTTPS
// staging/QA/pilot hostname. No Firebase tokens or credentials are used.
if(process.env.CAMPUS_PILOT_SMOKE_ACK!=='staging-readonly'){
 console.error('BLOCKED: require CAMPUS_PILOT_SMOKE_ACK=staging-readonly');
 process.exitCode=1;
}else{
 try{
  const result=await readOnlyPilotSmoke({
   baseUrl:process.env.CAMPUS_PILOT_API_BASE_URL
  });
  for(const r of result.results){
   console.log(r.route+': '+r.status+'/'+r.expected+' '+(r.passed?'PASS':'FAIL'));
  }
  if(!result.ok)process.exitCode=1;
 }catch(error){
  // Avoid leaking upstream responses or URL content to CI logs.
  console.error('BLOCKED: read-only staging smoke failed: '+(error?.name??'Error'));
  process.exitCode=1;
 }
}
