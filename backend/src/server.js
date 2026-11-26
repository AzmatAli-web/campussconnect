import 'dotenv/config';
import {attachMessaging} from './services/live-messaging.js';
import {parseEnvironment} from './config/environment.js';
import {connectDatabase} from './config/database.js';
import {configureFirebase} from './config/firebase.js';
import {createApp} from './app.js';
const config=parseEnvironment();
const firebaseAuth=configureFirebase(config);
try { await connectDatabase(config); }
catch(err) { console.error('Database connection failed:',err?.name??'Error'); throw new Error('Database connection failed'); }
const app=createApp({config,firebaseAuth});
const server=app.listen(config.port,()=>console.log('CampusConnect listening on port '+config.port));
const io=attachMessaging(server,app,{config,firebaseAuth});
process.once('SIGTERM',()=>io.close());
process.once('SIGINT',()=>io.close());
