// Explicit one-time operator action. Never expose as an HTTP endpoint.
// Run with ADMIN_BOOTSTRAP_FIREBASE_UID and ADMIN_BOOTSTRAP_CONFIRM set in your terminal.
import 'dotenv/config';
import mongoose from 'mongoose';
import {parseEnvironment} from '../src/config/environment.js';
import {connectDatabase} from '../src/config/database.js';
import {configureFirebase} from '../src/config/firebase.js';
import {User} from '../src/models/user.js';
import {AdminBootstrap,AuditLog} from '../src/models/governance.js';
import {emailMatchesDomains,normalizeEmail} from '../src/services/identity.js';
import {canBootstrapAdmin} from '../src/services/governance-policy.js';

async function main() {
  const config=parseEnvironment(process.env);
  const uid=process.env.ADMIN_BOOTSTRAP_FIREBASE_UID?.trim();
  if(!uid||process.env.ADMIN_BOOTSTRAP_CONFIRM!=='BOOTSTRAP_FIRST_ADMIN') {
    throw new Error('Explicit ADMIN_BOOTSTRAP_FIREBASE_UID and ADMIN_BOOTSTRAP_CONFIRM required');
  }
  if(!config.universityId||!config.mongoUri||!config.firebaseProjectId||!config.domains.length) {
    throw new Error('Complete university and Firebase backend setup before bootstrap');
  }
  const auth=configureFirebase(config);
  // This remotely validates the Firebase Admin SDK credential, not merely SDK initialization.
  const fb=await auth.getUser(uid);
  if(!fb.email||!fb.emailVerified||!emailMatchesDomains(fb.email,config.domains)) {
    throw new Error('Target Firebase account needs verified approved university email');
  }
  await connectDatabase(config);
  await AdminBootstrap.init();
  const uniId=new mongoose.Types.ObjectId(config.universityId);
  const university=await mongoose.connection.db.collection('universities').findOne({_id:uniId,status:'active'});
  if(!university) throw new Error('Active university record does not exist');
  const session=await mongoose.startSession();
  try {
    await session.withTransaction(async()=>{
      const user=await User.findOne({firebaseUid:uid,universityId:uniId}).session(session);
      const exists=await User.exists({universityId:uniId,activeRoles:'admin'}).session(session);
      const lock=await AdminBootstrap.exists({universityId:uniId}).session(session);
      if(!canBootstrapAdmin({
        firebaseUser:{uid:fb.uid,email:fb.email,emailVerified:fb.emailVerified},
        user,domainApproved:emailMatchesDomains(fb.email,config.domains),
        universityExists:Boolean(university),alreadyBootstrapped:Boolean(lock),existingAdmin:Boolean(exists)
      })) throw new Error('Bootstrap refused: user is not eligible or an Admin already exists');
      await AdminBootstrap.create([{universityId:uniId,adminUserId:user._id,firebaseUid:uid}],{session});
      const result=await User.updateOne({_id:user._id,universityId:uniId,status:'active'},{$addToSet:{activeRoles:'admin'}},{session});
      if(result.matchedCount!==1) throw new Error('Admin profile changed while bootstrapping');
      await AuditLog.create([{
        universityId:uniId,actorId:user._id,action:'admin.bootstrap',
        targetType:'user',targetId:user._id,details:{method:'one-time-local-cli'}
      }],{session});
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
    console.log('First CampusConnect Admin provisioned successfully. No credentials were printed.');
  }finally{await session.endSession();}
}
main().catch(error=>{
  console.error('Admin bootstrap failed:',error?.name||'Error',String(error?.message||'').slice(0,300));
  process.exitCode=1;
}).finally(async()=>{await mongoose.disconnect().catch(()=>{});});
