import {knowledgeSourcesRouter} from './routes/knowledge-sources.js';
import {conversationsRouter} from './routes/conversations.js';
import express from 'express';
import {isIP} from 'node:net';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {databaseReady} from './config/database.js';
import {identityRouter} from './routes/identity.js';
import {eventsRouter} from './routes/events.js';
import {announcementsRouter} from './routes/announcements.js';
import {governanceRouter} from './routes/governance.js';
import {timetableRouter} from './routes/timetable.js';
import {resourcesRouter} from './routes/resources.js';
import {complaintsRouter} from './routes/complaints.js';
import {feesRouter} from './routes/fees.js';
import {marketplaceRouter} from './routes/marketplace.js';
import {lostFoundRouter} from './routes/lost-found.js';
import {societyMembershipsRouter} from './routes/society-memberships.js';
import {notificationsRouter} from './routes/notifications.js';
import {HttpError} from './lib/http-error.js';
export function createApp({config,firebaseAuth,scanPdf}) {
 const app=express();
 app.disable('x-powered-by');
 app.use(helmet());
 app.use(cors({origin:config.corsOrigin,methods:['GET','POST','PATCH','OPTIONS']}));
 app.use(express.json({limit:'32kb',strict:true}));
 // In-memory integration suites issue hundreds of requests against one app instance.
 // Disable throttling only for NODE_ENV=test; development/production remain rate-limited.
 if(config.nodeEnv!=='test'){
  const options={windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false};
  // Enable only for a service accepting traffic exclusively from Railway's public HTTP edge.
  if(config.railwayEdgeOnly)options.keyGenerator=req=>{
   const address=req.get('x-real-ip');
   const version=typeof address==='string'?isIP(address):0;
   if(version===6 && !address.includes('%'))return new URL('http://['+address+']/').hostname;
   return version===4?address:req.socket.remoteAddress;
  };
  app.use('/api/v1',rateLimit(options));
 }
 const revision=process.env.RAILWAY_GIT_COMMIT_SHA;
 const liveStatus={status:'alive'};
 if(typeof revision==='string' && /^[a-f0-9]{40}$/i.test(revision))liveStatus.revision=revision;
 app.get('/api/v1/health/live',(_req,res)=>res.set('Cache-Control','no-store').json({data:liveStatus}));
 app.get('/api/v1/health/ready',(_req,res)=>{
  const checks={database:databaseReady(),firebase:Boolean(firebaseAuth),university:Boolean(config.universityId),emailDomains:config.domains.length>0};
  const ready=Object.values(checks).every(Boolean);
  res.status(ready?200:503).json({data:{status:ready?'ready':'not_ready',checks}});
 });
 app.use('/api/v1',knowledgeSourcesRouter({config,firebaseAuth}));
 app.use('/api/v1',conversationsRouter({config,firebaseAuth}));
 app.use('/api/v1',identityRouter({config,firebaseAuth}));
 app.use('/api/v1',eventsRouter({config,firebaseAuth}));
 app.use('/api/v1',announcementsRouter({config,firebaseAuth}));
 app.use('/api/v1',governanceRouter({config,firebaseAuth}));
 app.use('/api/v1',timetableRouter({config,firebaseAuth}));
 app.use('/api/v1',resourcesRouter({config,firebaseAuth,scanPdf}));
 app.use('/api/v1',complaintsRouter({config,firebaseAuth}));
 app.use('/api/v1',feesRouter({config,firebaseAuth}));
 app.use('/api/v1',marketplaceRouter({config,firebaseAuth}));
 app.use('/api/v1',lostFoundRouter({config,firebaseAuth}));
 app.use('/api/v1',societyMembershipsRouter({config,firebaseAuth}));
 app.use('/api/v1',notificationsRouter({config,firebaseAuth}));
 app.use((_req,_res,next)=>next(new HttpError(404,'NOT_FOUND','Route not found')));
 app.use((err,_req,res,_next)=>{
  if (err?.type==='entity.too.large') return res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'Request body too large'}});
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({error:{code:'INVALID_JSON',message:'Invalid JSON body'}});
  if (err?.code===11000) return res.status(409).json({error:{code:'DUPLICATE_RECORD',message:'Already exists'}});
  if (err instanceof HttpError) return res.status(err.status).json({error:{code:err.code,message:err.message}});
  console.error('Unhandled API error:',err?.name??'Error');
  return res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Unexpected error'}});
 });
 return app;
}
