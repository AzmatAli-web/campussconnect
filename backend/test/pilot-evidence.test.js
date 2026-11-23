import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {evaluatePilotEvidence, pilotEvidenceGates} from '../src/services/pilot-evidence.js';

const candidateCommit = 'a'.repeat(40);
const options = {today: '2026-11-13'};
const checkedOn = '2026-11-12';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/pilot-evidence.blank.json', import.meta.url)));
const complete = () => ({
  version: 1, stage: 'staging', candidateCommit,
  gates: Object.entries(pilotEvidenceGates).map(([id, source], index) => ({
    id, status: 'pass', source, checkedOn, reviewerRef: 'reviewer-01',
    evidenceRef: 'EV-' + (1000 + index),
  })),
});
const evaluate = record => evaluatePilotEvidence(record, candidateCommit, options);

test('blank fixture is valid, matches the complete gate catalog, and is not ready', () => {
  const result = evaluatePilotEvidence(fixture, fixture.candidateCommit, options);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.gates.map(gate => gate.id), Object.keys(pilotEvidenceGates));
  assert.ok(result.gates.every(gate => gate.state === 'not-run'));
  assert.equal(result.readyForReview, false);
});

test('complete staging metadata for the expected candidate is ready for human review only', () => {
  assert.equal(evaluate(complete()).readyForReview, true);
  const reordered = complete();
  reordered.gates.reverse();
  assert.deepEqual(evaluate(reordered), evaluate(complete()));
});

test('fixture data, wrong evidence source, failures and blockers cannot make evidence ready', () => {
  const fixtureOnly = {...complete(), stage: 'fixture'};
  assert.equal(evaluate(fixtureOnly).readyForReview, false);
  for (const source of ['fixture', 'review']) {
    const record = complete();
    record.gates[1].source = source;
    assert.equal(evaluate(record).gates[1].state, 'wrong-source');
    assert.equal(evaluate(record).readyForReview, false);
  }
  for (const status of ['fail', 'blocked']) {
    const record = complete();
    record.gates[1].status = status;
    assert.equal(evaluate(record).gates[1].state, status);
    assert.equal(evaluate(record).readyForReview, false);
  }
});

test('staging review requires a separate live event roster privacy check', () => {
  const gateId = 'event-roster-privacy';
  const missing = complete();
  missing.gates = missing.gates.filter(gate => gate.id !== gateId);
  assert.ok(evaluate(missing).errors.includes('GATE_MISSING:' + gateId));
  assert.equal(evaluate(missing).readyForReview, false);

  const pending = complete();
  pending.gates[pending.gates.findIndex(gate => gate.id === gateId)] = {id: gateId, status: 'not-run'};
  assert.equal(evaluate(pending).readyForReview, false);

  const fixtureOnly = complete();
  fixtureOnly.gates.find(gate => gate.id === gateId).source = 'fixture';
  assert.equal(evaluate(fixtureOnly).gates.find(gate => gate.id === gateId).state, 'wrong-source');
  assert.equal(evaluate(fixtureOnly).readyForReview, false);
});

test('rejects missing, duplicate and unknown gates without printing untrusted gate IDs', () => {
  const record = complete();
  record.gates.splice(0, 3, record.gates[3], {id: 'private@school.example', status: 'not-run'});
  const result = evaluate(record);
  assert.ok(result.errors.includes('GATE_MISSING:source-review-ci'));
  assert.ok(result.errors.includes('GATE_DUPLICATE:firebase-atlas-isolation'));
  assert.ok(result.errors.includes('GATE_UNKNOWN'));
  assert.doesNotMatch(JSON.stringify(result), /private@school/);
  assert.equal(result.readyForReview, false);
});

test('rejects a different candidate, unsupported records and extra input fields', () => {
  assert.ok(evaluate({...complete(), candidateCommit: 'b'.repeat(40)}).errors.includes('CANDIDATE_COMMIT_MISMATCH'));
  assert.ok(evaluatePilotEvidence(complete(), 'HEAD', options).errors.includes('EXPECTED_COMMIT_INVALID'));
  assert.ok(evaluate({...complete(), stage: 'production'}).errors.includes('STAGE_INVALID'));
  assert.ok(evaluate({...complete(), version: 2}).errors.includes('VERSION_UNSUPPORTED'));
  assert.ok(evaluate({...complete(), notes: 'private value'}).errors.includes('RECORD_FORMAT_INVALID'));
  const record = complete();
  record.gates[0].notes = 'private value';
  assert.ok(evaluate(record).errors.includes('GATE_FORMAT_INVALID'));
});

test('reviewer and evidence are opaque IDs, with a real nonfuture date', () => {
  for (const field of [
    {checkedOn: '2026-02-30'}, {checkedOn: '2026-11-14'}, {checkedOn: '2026-11-12T01:00:00Z'},
    {evidenceRef: 'https://private.example/report'}, {reviewerRef: 'staff@school.example'},
    {evidenceRef: undefined}, {reviewerRef: undefined},
  ]) {
    const record = complete();
    Object.assign(record.gates[0], field);
    const result = evaluate(record);
    assert.ok(result.errors.includes('GATE_EVIDENCE_INVALID:source-review-ci'));
    assert.equal(result.readyForReview, false);
  }
  const stale = complete();
  stale.gates[0].status = 'not-run';
  assert.ok(evaluate(stale).errors.includes('GATE_NOT_RUN_HAS_EVIDENCE:source-review-ci'));
});

test('CLI distinguishes ready, incomplete and invalid without authorizing release or exposing metadata', t => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-pilot-evidence-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'private-input.json');
  const cli = fileURLToPath(new URL('../scripts/pilot-evidence.js', import.meta.url));
  const run = (body, expected) => {
    writeFileSync(file, body);
    const result = spawnSync(process.execPath, [cli, file, expected], {encoding: 'utf8', timeout: 5_000});
    assert.ifError(result.error);
    return {status: result.status, output: result.stdout + result.stderr};
  };
  const ready = run(JSON.stringify(complete()), candidateCommit);
  assert.equal(ready.status, 0);
  assert.match(ready.output, /READY FOR HUMAN REVIEW/);
  assert.match(ready.output, /Release decision: NO-GO/);
  assert.doesNotMatch(ready.output, /reviewer-01|EV-1000|private-input\.json/);
  const pending = run(JSON.stringify(fixture), fixture.candidateCommit);
  assert.equal(pending.status, 1);
  assert.match(pending.output, /NOT READY/);
  for (const body of ['{mock-secret', 'x'.repeat(65_537), Buffer.from([255])]) {
    const invalid = run(body, candidateCommit);
    assert.equal(invalid.status, 2);
    assert.match(invalid.output, /RECORD_UNREADABLE/);
    assert.doesNotMatch(invalid.output, /mock-secret|private-input\.json/);
  }
  const wrongCommit = run(JSON.stringify(complete()), 'b'.repeat(40));
  assert.equal(wrongCommit.status, 2);
  assert.match(wrongCommit.output, /CANDIDATE_COMMIT_MISMATCH/);
});
