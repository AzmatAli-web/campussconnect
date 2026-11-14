import 'dotenv/config';
import mongoose from 'mongoose';
import {parseEnvironment} from '../src/config/environment.js';
import {connectDatabase} from '../src/config/database.js';
import {configureFirebase} from '../src/config/firebase.js';
import {dispatchNotificationBatch} from '../src/services/notification-push-dispatch.js';

const config=parseEnvironment();
if(!config.firebaseProjectId||!config.mongoUri||!config.universityId)
 throw new Error('MongoDB, university and Firebase Admin configuration required to dispatch notifications');
const limit=Number(process.env.NOTIFICATION_BATCH_SIZE||'25');
configureFirebase(config); // ADC credentials, not client Google Services JSON.
try{
 await connectDatabase(config);
 const result=await dispatchNotificationBatch({universityId:config.universityId,limit});
 console.log('Push dispatch batch:',JSON.stringify(result));
}finally{
 await mongoose.disconnect();
}
