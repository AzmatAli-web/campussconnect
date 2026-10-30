import 'dotenv/config';
import {parseEnvironment} from './config/environment.js';
import {connectDatabase} from './config/database.js';
import {configureFirebase} from './config/firebase.js';
import {createApp} from './app.js';
const config=parseEnvironment();
const firebaseAuth=configureFirebase(config);
try { await connectDatabase(config); }
catch(err) { console.error('Database connection failed:',err?.name??'Error'); throw new Error('Database connection failed'); }
const server=createApp({config,firebaseAuth}).listen(config.port,()=>console.log('CampusConnect listening on port '+config.port));
process.on('SIGTERM',()=>server.close());
process.on('SIGINT',()=>server.close());
