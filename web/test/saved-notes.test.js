import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MAX_SAVED_NOTES,readSavedNotes,savedNotesKey,toggleSavedNote,writeSavedNotes} from '../src/saved-notes.js';

const student={_id:'a'.repeat(24),universityId:'b'.repeat(24),status:'active',activeRoles:['student']};
const note='1'.repeat(24);
test('bookmarks store IDs only and are scoped to the account and campus',()=>{
 const records=new Map();
 const storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
 const key=savedNotesKey(student);
 assert.equal(writeSavedNotes(key,[note],storage),true);
 assert.deepEqual(readSavedNotes(key,storage),[note]);
 assert.deepEqual(readSavedNotes(savedNotesKey({...student,_id:'c'.repeat(24)}),storage),[]);
 assert.deepEqual(readSavedNotes(savedNotesKey({...student,universityId:'c'.repeat(24)}),storage),[]);
 assert.equal(savedNotesKey({...student,activeRoles:['admin']}),null);
 assert.deepEqual(readSavedNotes(key,{getItem:()=>JSON.stringify([note,'junk',note,{id:note}])}),[note]);
 assert.deepEqual(readSavedNotes(key,{getItem:()=>'{'}),[]);
 assert.equal(writeSavedNotes(key,[note],{setItem(){throw Error('disabled');}}),false);
});
test('toggle handles adding, removing and the cap',()=>{
 const full=Array.from({length:MAX_SAVED_NOTES},(_,index)=>index.toString(16).padStart(24,'0'));
 assert.deepEqual(toggleSavedNote([],note),[note]);
 assert.deepEqual(toggleSavedNote([note],note),[]);
 assert.equal(toggleSavedNote(full,note),full);
 assert.equal(toggleSavedNote(full,full[0]).length,MAX_SAVED_NOTES-1);
});
