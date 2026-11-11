import test from 'node:test';
import assert from 'node:assert/strict';
import {
 marketplaceInput,marketplaceFilter,marketplaceReportInput,
 marketplaceResolutionInput,marketplaceView,validateMarketplaceImage
} from '../src/services/marketplace-validation.js';

const item={
 title:'Used software engineering textbook',
 description:'Gently used copy of the 2026 software engineering textbook.',
 category:'books',condition:'good',pricePkr:1200,contactConsent:false
};
test('Marketplace validates required student fields and rejects role or seller injection',()=>{
 assert.deepEqual(marketplaceInput(item),item);
 for(const invalid of [
  {...item,sellerId:'fake'}, {...item,universityId:'other'},
  {...item,status:'published'}, {...item,pricePkr:1.5},
  {...item,pricePkr:-1}, {...item,contactConsent:'yes'},
  {...item,category:'weapons'}, {...item,title:'x'}
 ])assert.throws(()=>marketplaceInput(invalid));
 assert.deepEqual(marketplaceInput({pricePkr:0},{partial:true}),{pricePkr:0});
 assert.throws(()=>marketplaceInput({},{partial:true}));
});
test('Marketplace filters paginate and escape regex metacharacters',()=>{
 const result=marketplaceFilter({q:'A.*[',category:'books',minPrice:'0',maxPrice:'1200'});
 assert.equal(result.page,1);
 assert.equal(result.filter.category,'books');
 assert.deepEqual(result.filter.pricePkr,{$gte:0,$lte:1200});
 assert.equal(result.filter.$or[0].title.$options,'i');
 assert.ok(result.filter.$or[0].title.$regex.includes('\\.'));
 for(const bad of [
  {sellerId:'someone'}, {q:'a'}, {category:'banned'},
  {minPrice:'-1'}, {maxPrice:'10000000'}, {page:'0'}
 ])assert.throws(()=>marketplaceFilter(bad));
});
test('reports, moderation and output shapes omit private identifiers',()=>{
 assert.equal(marketplaceReportInput({reason:'scam'}).reason,'scam');
 assert.throws(()=>marketplaceReportInput({reason:'scam',reporterId:'other'}));
 assert.throws(()=>marketplaceResolutionInput({action:'archive',note:'no'}));
 assert.equal(marketplaceResolutionInput({action:'dismiss',note:'No violation found'}).action,'dismiss');
 const publicData=marketplaceView({
  _id:'abc',...item,status:'published',imageKey:'private-photo.jpg',
  sellerId:'hidden',universityId:'secret',imageMime:'image/jpeg',
  createdAt:new Date(),updatedAt:new Date(),
 });
 assert.equal(publicData.hasImage,true);
 assert.equal(publicData.contactAvailable,false);
 for(const key of ['sellerId','universityId','imageKey','imageMime']){
  assert.equal(Object.hasOwn(publicData,key),false);
 }
});
test('images require accepted magic bytes, extension and MIME',()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000049454e44','hex');
 assert.equal(validateMarketplaceImage({
  buffer:png,originalname:'photo.png',mimetype:'image/png'
 }).mime,'image/png');
 assert.throws(()=>validateMarketplaceImage({
  buffer:png,originalname:'photo.jpg',mimetype:'image/jpeg'
 }));
 assert.throws(()=>validateMarketplaceImage({
  buffer:Buffer.from('not a real image file'),originalname:'file.png',mimetype:'image/png'
 }));
});
