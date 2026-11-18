import {savedNotesKey} from './saved-notes.js';

export const MAX_ASSIGNMENTS = 60;
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const campusDate = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Karachi', year:'numeric', month:'2-digit', day:'2-digit',
});
const displayDate = new Intl.DateTimeFormat('en-PK', {dateStyle:'medium', timeZone:'UTC'});

export function plannerKey(profile) {
  const key = savedNotesKey(profile);
  return key?.replace(':saved-notes:', ':assignment-planner:') ?? null;
}

export function todayAtCampus(now = new Date()) {
  const parts = Object.fromEntries(campusDate.formatToParts(now).map(({type,value})=>[type,value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function formatDeadline(value) {
  return displayDate.format(new Date(value + 'T00:00:00Z'));
}

export function assignmentFields(values) {
  const title = typeof values?.title === 'string' ? values.title.trim() : '';
  const course = typeof values?.course === 'string' ? values.course.trim() : '';
  const due = values?.due;
  if (!title || title.length > 100) throw new Error('Enter a title of 1 to 100 characters.');
  if (course.length > 40) throw new Error('Use at most 40 characters for the course.');
  if (typeof due !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(due)) throw new Error('Enter a valid due date.');
  const date = new Date(due + 'T00:00:00Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10) !== due) throw new Error('Enter a valid due date.');
  return {title,course,due};
}

function sanitize(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set(), rows = [];
  for (const item of items) {
    if (rows.length >= MAX_ASSIGNMENTS) break;
    if (typeof item?.id !== 'string' || !idPattern.test(item.id) ||
        typeof item.done !== 'boolean' || seen.has(item.id)) continue;
    try {
      rows.push({id:item.id,...assignmentFields(item),done:item.done});
      seen.add(item.id);
    } catch { /* Ignore invalid rows from older or damaged local storage. */ }
  }
  return rows;
}

export function readAssignments(key, storage) {
  if (!key) return [];
  try {
    return sanitize(JSON.parse((storage ?? globalThis.localStorage)?.getItem(key) ?? '[]'));
  } catch { return []; }
}

export function writeAssignments(key, rows, storage) {
  if (!key || !Array.isArray(rows) || rows.length > MAX_ASSIGNMENTS) return false;
  const clean = sanitize(rows);
  if (clean.length !== rows.length) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(key, JSON.stringify(clean));
    return true;
  } catch { return false; }
}

export function assignmentStatus(row, today) {
  return row.done ? 'completed' : row.due < today ? 'overdue' : row.due === today ? 'today' : 'upcoming';
}
