import {parseEnvironment} from '../config/environment.js';

// Config-only, offline readiness checks. They neither connect to external systems
// nor approve a release. Report only codes, never environment-variable values.
const productionLikeHost=hostname=>{
 const name=hostname.toLowerCase();
 return name==='localhost'||name.endsWith('.localhost')||
  name.endsWith('.local')||name.endsWith('.internal')||
  name==='127.0.0.1'||name==='0.0.0.0'||name==='::1'||
  /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(name);
};
function parseHttps(value){
 try{
  const uri=new URL(value??'');
  if(uri.protocol!=='https:'||!uri.hostname||uri.username||uri.password||
    uri.pathname!=='/'||uri.search||uri.hash||productionLikeHost(uri.hostname))
   return null;
  return uri;
 }catch(_){return null;}
}
export function inspectPilotEnvironment(env){
 const failures=[],warnings=[];
 let config=null;
 try{config=parseEnvironment(env);}catch(_){failures.push('INVALID_BACKEND_ENVIRONMENT');}
 if(env.NODE_ENV!=='production')failures.push('REQUIRE_PRODUCTION_RUNTIME_MODE');
 if(env.CAMPUS_PILOT_STAGE!=='staging')failures.push('REQUIRE_EXPLICIT_STAGING_STAGE');
 if(env.CAMPUS_PILOT_DATA_POLICY!=='fictional-only')
  failures.push('REQUIRE_FICTIONAL_DATA_POLICY');
 if(env.FIREBASE_AUTH_EMULATOR_HOST)failures.push('FIREBASE_EMULATOR_FORBIDDEN');
 if(!parseHttps(env.CORS_ORIGIN))failures.push('FRONTEND_HTTPS_ORIGIN_REQUIRED');
 const backend=parseHttps(env.CAMPUS_PILOT_API_BASE_URL);
 if(!backend||!/(?:^|[.-])(staging|stage|pilot|qa)(?:[.-]|$)/i.test(backend.hostname))
  failures.push('EXPLICIT_HTTPS_STAGING_API_REQUIRED');
 let db=null;
 try{db=new URL(env.MONGODB_URI??'');}catch(_){/* no credential output */}
 if(!db||db.protocol!=='mongodb+srv:'||
    !db.hostname.toLowerCase().endsWith('.mongodb.net')||
    db.hostname.toLowerCase()==='mongodb.net'||
    /^(false|0)$/i.test(db.searchParams.get('tls')||'')||
    /^(false|0)$/i.test(db.searchParams.get('ssl')||'')){
  failures.push('ISOLATED_ATLAS_SRV_REQUIRED');
 }
 if(!config?.universityId||!config.firebaseProjectId||!config.domains.length)
  failures.push('UNIVERSITY_FIREBASE_DOMAINS_REQUIRED');
 if(!env.CAMPUS_PILOT_OWNER?.trim())failures.push('ASSIGNED_PILOT_OWNER_REQUIRED');
 if(!env.CAMPUS_PILOT_ROLLBACK_OWNER?.trim())failures.push('ASSIGNED_ROLLBACK_OWNER_REQUIRED');
 if(!env.CAMPUS_PILOT_APPROVED_TEST_ACCOUNTS?.trim())
  failures.push('APPROVED_TEST_ACCOUNTS_REQUIRED');

 // Human review items: never equate an offline config check with a deployment.
 warnings.push('NOT_A_LIVE_SERVICE_CONNECTIVITY_CHECK');
 warnings.push('MANUAL_PRIVACY_STORAGE_FINANCE_SECURITY_APPROVAL_PENDING');
 warnings.push('PHYSICAL_ANDROID_AND_FCM_ACCEPTANCE_DEFERRED');
 warnings.push('STACKED_DRAFT_PRS_REQUIRE_REVIEW_BEFORE_MERGE');
 return {
  ok:failures.length===0,
  failures:[...new Set(failures)],
  warnings,
  checks:{
   parsedConfiguration:Boolean(config),
   stagingApiHttps:Boolean(backend),
   isolatedAtlasUri:Boolean(db&&db.protocol==='mongodb+srv:'&&
    db.hostname.toLowerCase().endsWith('.mongodb.net')),
   explicitlyFictional:env.CAMPUS_PILOT_DATA_POLICY==='fictional-only'
  }
 };
}

export function assertPilotApiUrl(value){
 const uri=parseHttps(value);
 if(!uri||!/(?:^|[.-])(staging|stage|pilot|qa)(?:[.-]|$)/i.test(uri.hostname)){
  throw new Error('Read-only smoke test requires an explicit HTTPS staging/QA/pilot hostname');
 }
 if(uri.pathname!=='/'||uri.search||uri.hash)
  throw new Error('Staging API base URL must be an origin with no path or query');
 return uri.origin;
}

export async function readOnlyPilotSmoke({baseUrl,fetcher=fetch,timeoutMs=8000}){
 const origin=assertPilotApiUrl(baseUrl);
 const endpoints=[
  {path:'/api/v1/health/live',expected:200},
  {path:'/api/v1/health/ready',expected:200},
  {path:'/api/v1/me',expected:401},
  {path:'/api/v1/notifications',expected:401}
 ];
 const results=[];
 for(const {path,expected} of endpoints){
  // The script deliberately has no request bodies, Authorization headers,
  // role grants, database migrations, or state-mutating HTTP methods.
  const response=await fetcher(origin+path,{
   method:'GET',redirect:'error',
   headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(timeoutMs)
  });
  const status=response.status;
  const cache=response.headers?.get?.('cache-control')??'';
  const contentType=response.headers?.get?.('content-type')??'';
  const passed=status===expected&&
   /json/i.test(contentType)&&
   (path==='/api/v1/notifications'?/no-store/i.test(cache):true);
  results.push({route:path,status,expected,passed});
 }
 return {ok:results.every(x=>x.passed),results};
}
