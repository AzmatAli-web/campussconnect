import test from 'node:test';
import assert from 'node:assert/strict';
import {
 notificationLimit,notificationCursor,encodeNotificationCursor,
 beforeCursor,personalNotificationView,announcementNotificationView,
 limitNotificationBody,personalNotificationData
} from '../src/services/notification-feed.js';

test('bounded inbox limit and strict cursor input',()=>{
 assert.equal(notificationLimit({}),20);
 assert.equal(notificationLimit({limit:'40'}),40);
 for(const query of [{page:'1'},{limit:'0'},{limit:'100'},{limit:'NaN'}])
  assert.throws(()=>notificationLimit(query));
 const id='507f1f77bcf86cd799439011',date=new Date('2026-10-12T08:01:02.003Z');
 const encoded=encodeNotificationCursor({id,createdAt:date});
 const decoded=notificationCursor(encoded);
 assert.equal(decoded.id,id);
 assert.equal(decoded.at.toISOString(),date.toISOString());
 assert.ok(beforeCursor(decoded,'publishedAt').$or.length===2);
 for(const cursor of ['x','%','!',Buffer.from('2026-10-12|foo').toString('base64url')])
  assert.throws(()=>notificationCursor(cursor));
});
test('public notification view strips owner, token and internal fields',()=>{
 const source={
  _id:'507f1f77bcf86cd799439011',
  universityId:'private',recipientId:'private',
  pushState:'pending',pushAttempts:1,sourceKey:'private',
  sourceId:'507f1f77bcf86cd799439012',type:'event_registration',
  title:'Registration confirmed',body:'Open your events page',
  createdAt:new Date(),readAt:null
 };
 const view=personalNotificationView(source);
 for(const key of ['universityId','recipientId','sourceKey','pushState','pushAttempts'])
  assert.equal(Object.hasOwn(view,key),false);
 assert.equal(view.kind,'personal');
 const a=announcementNotificationView({
  _id:'507f1f77bcf86cd799439011',
  title:'Campus announcement',body:'b'.repeat(1000),publishedAt:new Date(),
  departmentId:'private',societyId:'private'
 },null);
 assert.equal(a.body.length,240);
 assert.ok(!Object.hasOwn(a,'societyId'));
});
test('event outbox metadata and empty read mutation body are safe',()=>{
 const at=new Date('2026-11-02T00:00:00.000Z');
 const data=personalNotificationData({
  universityId:'uni',recipientId:'user',
  type:'event_registration',sourceId:'event',sourceKey:'registration:1',
  title:'Success',body:'Confirmed',at
 });
 assert.equal(data.expiresAt.getTime()>at.getTime(),true);
 assert.equal(data.pushState,'pending');
 assert.doesNotThrow(()=>limitNotificationBody({}));
 assert.throws(()=>limitNotificationBody({recipientId:'victim'}));
});
