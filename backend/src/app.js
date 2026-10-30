import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {databaseReady} from './config/database.js';
import {identityRouter} from './routes/identity.js';
import {eventsRouter} from './routes/events.js';
import {announcementsRouter} from './routes/announcements.js';
import {HttpError} from './lib/http-error.js';
export function createApp({config,firebaseAuth}) {
 const app=express();
 app.disable('x-powered-by');
 app.use(helmet());
 app.use(cors({origin:config.corsOrigin,methods:['GET','POST','PATCH','OPTIONS']}));
 app.use(express.json({limit:'32kb',strict:true}));
 app.use('/api/v1',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
 app.get('/api/v1/health/live',(_req,res)=>res.json({data:{status:'alive'}}));
 app.get('/api/v1/health/ready',(_req,res)=>{
  const checks={database:databaseReady(),firebase:Boolean(firebaseAuth),university:Boolean(config.universityId),emailDomains:config.domains.length>0};
  const ready=Object.values(checks).every(Boolean);
  res.status(ready?200:503).json({data:{status:ready?'ready':'not_ready',checks}});
 });
 app.use('/api/v1',identityRouter({config,firebaseAuth}));
 app.use('/api/v1',eventsRouter({config,firebaseAuth}));
 app.use('/api/v1',announcementsRouter({config,firebaseAuth}));
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
