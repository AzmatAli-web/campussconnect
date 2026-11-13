// Offline bookkeeping only. An evidence reference is a pointer, not proof.
export const pilotEvidenceGates = Object.freeze({
  'source-review-ci': 'review',
  'staging-preflight': 'staging',
  'https-readonly-smoke': 'staging',
  'firebase-atlas-isolation': 'staging',
  'student-data-isolation': 'staging',
  'staff-role-acceptance': 'staging',
  'moderation-acceptance': 'staging',
  'finance-complaints-governance': 'review',
  'private-storage-privacy': 'review',
  'android-device-fcm': 'staging',
  'browser-accessibility': 'staging',
  'staging-performance': 'staging',
  'backup-restore-rollback': 'staging',
  'incident-support-retention': 'review',
});

const stages = new Set(['staging', 'fixture']);
const statuses = new Set(['not-run', 'pass', 'fail', 'blocked']);
const sources = new Set(['staging', 'review', 'fixture']);
const commitPattern = /^[0-9a-f]{40}$/;
const reviewerPattern = /^reviewer-[0-9]{2,6}$/;
const evidencePattern = /^EV-[0-9]{4,10}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) =>
  isObject(value) && Object.keys(value).every(key => keys.includes(key));
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);

function isDate(value) {
  if (!matches(/^\d{4}-\d{2}-\d{2}$/, value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function evaluatePilotEvidence(record, expectedCommit, {today = new Date().toISOString().slice(0, 10)} = {}) {
  const errors = [];
  if (!matches(commitPattern, expectedCommit)) errors.push('EXPECTED_COMMIT_INVALID');
  if (!hasOnlyKeys(record, ['version', 'stage', 'candidateCommit', 'gates'])) {
    return {errors: [...errors, 'RECORD_FORMAT_INVALID'], gates: [], readyForReview: false};
  }
  if (record.version !== 1) errors.push('VERSION_UNSUPPORTED');
  if (!stages.has(record.stage)) errors.push('STAGE_INVALID');
  if (!matches(commitPattern, record.candidateCommit)) errors.push('CANDIDATE_COMMIT_INVALID');
  else if (record.candidateCommit !== expectedCommit) errors.push('CANDIDATE_COMMIT_MISMATCH');
  if (!Array.isArray(record.gates) || record.gates.length > Object.keys(pilotEvidenceGates).length) {
    return {errors: [...errors, 'GATE_LIST_INVALID'], gates: [], readyForReview: false};
  }

  const entries = new Map();
  for (const row of record.gates) {
    if (!hasOnlyKeys(row, ['id', 'status', 'source', 'reviewerRef', 'evidenceRef', 'checkedOn'])) {
      errors.push('GATE_FORMAT_INVALID');
      continue;
    }
    if (typeof row.id !== 'string' || !Object.hasOwn(pilotEvidenceGates, row.id)) {
      errors.push('GATE_UNKNOWN');
      continue;
    }
    if (entries.has(row.id)) {
      errors.push('GATE_DUPLICATE:' + row.id);
      continue;
    }
    entries.set(row.id, row);
  }

  const gates = Object.entries(pilotEvidenceGates).map(([id, requiredSource]) => {
    const row = entries.get(id);
    if (!row) {
      errors.push('GATE_MISSING:' + id);
      return {id, state: 'missing'};
    }
    if (!statuses.has(row.status)) {
      errors.push('GATE_STATUS_INVALID:' + id);
      return {id, state: 'invalid'};
    }
    if (row.status === 'not-run') {
      if (Object.keys(row).length !== 2) errors.push('GATE_NOT_RUN_HAS_EVIDENCE:' + id);
      return {id, state: 'not-run'};
    }

    if (!sources.has(row.source) || !matches(reviewerPattern, row.reviewerRef) ||
        !matches(evidencePattern, row.evidenceRef) || !isDate(row.checkedOn) || row.checkedOn > today) {
      errors.push('GATE_EVIDENCE_INVALID:' + id);
      return {id, state: 'invalid'};
    }
    if (row.status !== 'pass') return {id, state: row.status};
    return {id, state: row.source === requiredSource ? 'pass' : 'wrong-source'};
  });

  return {
    errors,
    gates,
    readyForReview: errors.length === 0 && record.stage === 'staging' &&
      gates.every(gate => gate.state === 'pass'),
  };
}
