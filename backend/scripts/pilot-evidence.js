import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {evaluatePilotEvidence} from '../src/services/pilot-evidence.js';

const maxBytes = 64 * 1024;
const [filePath, expectedCommit, ...extra] = process.argv.slice(2);

async function readRecord(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid evidence file');
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const {bytesRead} = await file.read(buffer, total, buffer.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > maxBytes) throw new Error('Invalid evidence file');
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, total)));
  } finally {
    await file.close();
  }
}

async function main() {
  // Never print input content, file paths, reviewer references or parser errors.
  // Exit 1 means valid but incomplete. Exit 2 means the record could not be validated.
  if (!filePath || !expectedCommit || extra.length > 0) {
    console.error('Usage: npm run pilot:evidence -- <record.json> <expected-commit-sha>');
    process.exitCode = 2;
    return;
  }
  let record;
  try {
    record = await readRecord(filePath);
  } catch {
    console.error('INVALID: RECORD_UNREADABLE');
    console.log('Release decision: NO-GO (no authorization recorded by this command)');
    process.exitCode = 2;
    return;
  }
  const result = evaluatePilotEvidence(record, expectedCommit);
  for (const gate of result.gates) console.log(gate.id + ': ' + gate.state);
  for (const code of result.errors) console.error('INVALID: ' + code);
  console.log('Evidence status: ' + (result.readyForReview ? 'READY FOR HUMAN REVIEW' : 'NOT READY'));
  console.log('Release decision: NO-GO (no authorization recorded by this command)');
  process.exitCode = result.errors.length > 0 ? 2 : result.readyForReview ? 0 : 1;
}

await main();
