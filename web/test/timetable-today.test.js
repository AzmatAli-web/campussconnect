import test from 'node:test';
import assert from 'node:assert/strict';
import {campusTime,todaySchedule} from '../src/timetable-today.js';

const first={id:'1',dayOfWeek:1,startTime:'09:00',endTime:'10:30'};
const second={id:'2',dayOfWeek:1,startTime:'11:00',endTime:'12:00'};
const wrongDay={id:'3',dayOfWeek:3,startTime:'10:00',endTime:'11:00'};
const slots=[second,wrongDay,first];
const date=time=>new Date('2026-11-16T'+time+':00Z');

test('campus day changes at midnight in Karachi, not midnight UTC',()=>{
 assert.deepEqual(campusTime(new Date('2026-11-15T18:59:00Z')),{day:7,minute:1439});
 assert.deepEqual(campusTime(new Date('2026-11-15T19:00:00Z')),{day:1,minute:0});
});

test('finds the current class and earliest next class for the campus day',()=>{
 assert.equal(todaySchedule(slots,date('04:00')).current,first);
 assert.equal(todaySchedule(slots,date('04:00')).next,second);
 const atEnd=todaySchedule(slots,date('05:30'));
 assert.equal(atEnd.current,null);
 assert.equal(atEnd.next,second);
 assert.equal(todaySchedule(slots,date('07:00')).next,null);
 assert.deepEqual(atEnd.classes,[second,first]);
});

test('ignores invalid times for highlights and handles an empty day',()=>{
 const invalid={...first,startTime:'25:00'};
 const reversed={...first,endTime:'08:00'};
 assert.equal(todaySchedule([invalid,reversed],date('04:15')).current,null);
 const empty=todaySchedule(slots,new Date('2026-11-17T04:00:00Z'));
 assert.deepEqual(empty,{day:2,classes:[],current:null,next:null});
});
