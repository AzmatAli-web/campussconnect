import {getMessaging} from 'firebase-admin/messaging';
import {CampusNotification,NotificationPushDevice} from '../models/notification.js';
import {User} from '../models/user.js';

// Explicitly invoked by an operator/scheduler; never blocks API response time.
// Claim lease handles crashed workers. FCM sends are at-least-once, not exactly-once.
export async function dispatchNotificationBatch({
 universityId,limit=25,messaging=getMessaging(),now=new Date()
}){
 if(!Number.isInteger(limit)||limit<1||limit>50)
  throw new Error('Notification push batch must contain 1–50 messages.');
 let sent=0,retried=0,skipped=0,failed=0;
 for(let i=0;i<limit;i++){
  const claim=await CampusNotification.findOneAndUpdate({
   universityId,expiresAt:{$gt:now},
   $or:[
    {pushState:{$in:['pending','retry']},pushNextAt:{$lte:now}},
    {pushState:'sending',pushClaimedAt:{$lte:new Date(now.getTime()-5*60_000)}}
   ]
  },{$set:{pushState:'sending',pushClaimedAt:new Date()},
    $inc:{pushAttempts:1}},{new:true,sort:{createdAt:1,_id:1}}).lean();
  if(!claim)break;
  const filter={_id:claim._id,universityId,pushState:'sending',
   pushClaimedAt:claim.pushClaimedAt};
  try{
   const activeUser=await User.exists({
    _id:claim.recipientId,universityId,status:'active',
    activeRoles:{$exists:true,$ne:[]}
   });
   if(!activeUser){
    await CampusNotification.updateOne(filter,{$set:{pushState:'skipped',pushLastError:'ACCOUNT_NOT_ACTIVE'}});
    skipped++;continue;
   }
   const devices=await NotificationPushDevice.find({
    universityId,userId:claim.recipientId
   }).select('+fid fidHash').sort({lastSeenAt:-1}).limit(5).lean();
   if(!devices.length){
    await CampusNotification.updateOne(filter,{$set:{pushState:'skipped',pushLastError:'NO_OPTED_IN_DEVICE'}});
    skipped++;continue;
   }
   const response=await messaging.sendEachForMulticast({
    fids:devices.map(d=>d.fid),
    notification:{title:'CampusConnect update',
      body:'Open your private campus inbox to view the latest update.'},
    data:{kind:'personal',notificationId:String(claim._id)},
    android:{priority:'normal'}
   });
   const invalidCodes=new Set([
    'messaging/installation-id-not-registered','messaging/invalid-installation-id',
    'messaging/registration-token-not-registered','messaging/invalid-registration-token'
   ]);
   const dead=devices.filter((d,index)=>
    !response.responses[index].success&&
    invalidCodes.has(response.responses[index].error?.code));
   if(dead.length){
    await NotificationPushDevice.deleteMany({
     universityId,userId:claim.recipientId,
     fidHash:{$in:dead.map(d=>d.fidHash)}
    });
   }
   if(response.successCount>0){
    await CampusNotification.updateOne(filter,{$set:{pushState:'sent',pushLastError:null}});
    sent++;continue;
   }
   // Invalid tokens are removed; do not retry if none remain.
   if(dead.length===devices.length){
    await CampusNotification.updateOne(filter,{$set:{pushState:'failed',pushLastError:'INVALID_TOKENS'}});
    failed++;continue;
   }
   throw new Error('FCM transient failure');
  }catch(_error){
   const exhausted=claim.pushAttempts>=4;
   await CampusNotification.updateOne(filter,{$set:{
    pushState:exhausted?'failed':'retry',
    pushNextAt:new Date(Date.now()+Math.min(60,2**claim.pushAttempts)*60_000),
    pushLastError:exhausted?'RETRIES_EXHAUSTED':'TEMPORARY_PUSH_ERROR'
   }});
   if(exhausted)failed++;else retried++;
  }
 }
 return {sent,retried,skipped,failed};
}
