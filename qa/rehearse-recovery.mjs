import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';

const exec = promisify(execFile);
const image = 'mongo:7.0';
const name = 'campusconnect-recovery-' + randomUUID();
const source = 'campusconnect_fixture';
const restored = 'campusconnect_recovered';
const host = '127.0.0.1:27017';
const archive = '/tmp/campusconnect-fixture.archive.gz';
const docker = (...args) => exec('docker', args, {timeout: 180_000, windowsHide: true, maxBuffer: 1024 * 1024});
const run = (...args) => docker('exec', name, ...args);
const mongo = js => run('mongosh', '--norc', '--quiet', '--host', host, '--eval', js);
const rows = [{_id: 'event-1', title: 'Synthetic Campus Workshop', room: 'Lab 2'},
  {_id: 'event-2', title: 'Synthetic Campus Fair', room: 'Hall 1'}];
const receipt = {_id:'receipt-1', eventId:'event-1', studentId:'synthetic-student'};
const restrictedSource = {_id:'source-1', universityId:'campus-fixture', audience:'admin',
  status:'withdrawn', title:'Fictional release note', text:'Archived pilot evidence.'};
const started = performance.now();
let ownsContainer = false;

try {
  const {stdout} = await docker('run', '--detach', '--rm', '--name', name, '--network', 'none', image,
    '--bind_ip', '127.0.0.1', '--noscripting');
  ownsContainer = /^[a-f0-9]{64}$/.test(stdout.trim());
  assert.ok(ownsContainer, 'Docker did not return a container ID');

  for (let attempt = 0; ; attempt++){
    try { await mongo('if (db.runCommand({ping: 1}).ok !== 1) quit(1)'); break; }
    catch (error) { if (attempt >= 30) throw error; await delay(1000); }
  }

  await mongo(`const events = db.getSiblingDB('${source}').events;
    events.createIndex({title: 1}, {name:'unique_title',unique:true});
    events.insertMany(${JSON.stringify(rows)});
    const registrations = db.getSiblingDB('${source}').event_registrations;
    registrations.createIndex({eventId:1,studentId:1},{unique:true});
    db.getSiblingDB('${source}').knowledgesources.insertOne(${JSON.stringify(restrictedSource)});
    registrations.insertOne(${JSON.stringify(receipt)});`);
  await run('mongodump', '--host', host, '--db=' + source, '--archive=' + archive, '--gzip');
  await run('test', '-s', archive);
  // Change the source after backup so verification proves recovery of earlier data.
  await mongo(`db.getSiblingDB('${source}').events.deleteOne({_id:'event-1'});`);
  const restoreStart = performance.now();
  await run('mongorestore', '--host', host, '--archive=' + archive, '--gzip',
    '--nsInclude=' + source + '.*', '--nsFrom=' + source + '.*',
    '--nsTo=' + restored + '.*', '--stopOnError');
  const {stdout: verification} = await mongo(`
    const recovered = db.getSiblingDB('${restored}').events;
    const s = db.getSiblingDB('${source}').events;
    const registrations = db.getSiblingDB('${restored}').event_registrations;
    print(JSON.stringify({knowledge:db.getSiblingDB('${restored}').knowledgesources.findOne({_id:'source-1'}),receipt:registrations.findOne({_id:'receipt-1'}),registrationIndexes:registrations.getIndexes(),rows:recovered.find().sort({_id:1}).toArray(),
      indexes:recovered.getIndexes(), source:s.find().sort({_id:1}).toArray()}));
  `);
  const result = JSON.parse(verification.trim());
  assert.deepEqual(result.rows, rows, 'Restored documents differ from the backup fixture');
  assert.deepEqual(result.knowledge, restrictedSource, 'Audience and withdrawal state must survive recovery');
  assert.deepEqual(result.receipt, receipt, 'Registration did not survive the restore');
  assert.ok(result.rows.some(event => event._id === result.receipt.eventId), 'Restored registration refers to a missing event');
  assert.ok(result.registrationIndexes.some(index => index.unique &&
    JSON.stringify(index.key) === JSON.stringify({eventId:1,studentId:1})), 'Registration uniqueness index was not restored');
  assert.deepEqual(result.source, [rows[1]], 'Restore unexpectedly changed the source database');
  assert.ok(result.indexes.some(index => index.name === 'unique_title' &&
    index.unique === true && index.key?.title === 1), 'Unique title index was not recovered');
  console.log(`Verified ${result.rows.length} documents, their unique index, and source isolation. Restore and verification: ${Math.round(performance.now() - restoreStart)} ms.`);
} finally {
  if (ownsContainer) await docker('rm', '--force', name);
}
console.log(`Recovery rehearsal passed in ${Math.round(performance.now() - started)} ms. Disposable container removed.`);
