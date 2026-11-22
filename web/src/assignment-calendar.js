import {assignmentFields} from './assignment-planner.js';

const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const clean = value => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/[,;]/g, '\\$&');

const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const compact = date => date.replace(/-/g, '');
function nextDay(date) {
  const next = new Date(date + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
function fold(line) {
  let count = 0, result = '';
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (count + bytes > 75) { result += '\r\n '; count = 1; }
    result += character;
    count += bytes;
  }
  return result;
}

// Only explicit, local assignment fields enter the calendar; no account ID or auth token.
export function buildAssignmentCalendar(items, now = new Date()) {
  if (!Array.isArray(items) || !Number.isFinite(now.getTime())) return null;
  const eligible = [];
  for (const item of items) {
    if (item?.done !== false || typeof item.id !== 'string' || !uuid.test(item.id)) continue;
    try { eligible.push({id: item.id, ...assignmentFields(item)}); } catch { /* Skip corrupted entries. */ }
  }
  if (!eligible.length) return null;
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusConnect//Assignment Planner//EN','CALSCALE:GREGORIAN'];
  for (const item of eligible.sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id))) {
    lines.push('BEGIN:VEVENT',
      'UID:' + item.id + '@assignments.campusconnect.invalid',
      'DTSTAMP:' + stamp(now),
      'DTSTART;VALUE=DATE:' + compact(item.due),
      'DTEND;VALUE=DATE:' + compact(nextDay(item.due)),
      'SUMMARY:' + clean(item.title),
      ...(item.course ? ['DESCRIPTION:' + clean('Course: ' + item.course)] : []),
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {name:'campusconnect-assignment-deadlines.ics',contents:lines.map(fold).join('\r\n')+'\r\n',count:eligible.length};
}

export function downloadAssignmentCalendar(items) {
  const file = buildAssignmentCalendar(items);
  if (!file) return false;
  const url = URL.createObjectURL(new Blob([file.contents],{type:'text/calendar;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(()=>URL.revokeObjectURL(url),30_000); }
  return true;
}
