import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chooseTimetableGroup,groupId,readTimetablePreference,saveTimetablePreference,timetablePreferenceKey} from '../src/timetable-preference.js';

const student = {_id:'1'.repeat(24),universityId:'a'.repeat(24),status:'active',activeRoles:['student']};
const sectionA = {term:'Fall 2026',program:'BSE',semester:7,section:'A'};
const sectionB = {...sectionA,section:'B'};

test('a choice is isolated by browser account and university', () => {
 const store = new Map();
 const storage = {getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
 const key = timetablePreferenceKey(student);
 saveTimetablePreference(key,sectionB,storage);
 assert.deepEqual([...store.values()],[groupId(sectionB)]);
 assert.equal(chooseTimetableGroup([sectionA,sectionB],readTimetablePreference(key,storage)),sectionB);
 for(const other of [{...student,_id:'2'.repeat(24)},{...student,universityId:'b'.repeat(24)}]){
  assert.equal(readTimetablePreference(timetablePreferenceKey(other),storage),'');
 }
});

test('missing groups, stale preferences and inaccessible storage degrade to normal browsing', () => {
 const key = timetablePreferenceKey(student);
 const blocked = {getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 assert.doesNotThrow(()=>saveTimetablePreference(key,sectionB,blocked));
 assert.equal(readTimetablePreference(key,blocked),'');
 assert.equal(chooseTimetableGroup([sectionA],groupId(sectionB)),sectionA);
 assert.equal(chooseTimetableGroup([sectionA],'not-a-group'),sectionA);
 assert.equal(chooseTimetableGroup([],groupId(sectionB)),null);
});

test('no preference key is generated for missing campus identity or non-student accounts', () => {
 for(const profile of [null,{...student,_id:'bad'},{...student,status:'pending'},
  {...student,activeRoles:['staff']},{...student,activeRoles:'student'}]){
  assert.equal(timetablePreferenceKey(profile),null);
 }
});
