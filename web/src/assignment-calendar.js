import {assignmentFields} from './assignment-planner.js';

import {textValue,utc,foldLine,downloadCalendarFile} from './event-calendar.js';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const compact = date => date.replace(/-/g, '');
function nextDay(date) {
  const next = new Date(date + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
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
      'DTSTAMP:' + utc(now),
      'DTSTART;VALUE=DATE:' + compact(item.due),
      'DTEND;VALUE=DATE:' + compact(nextDay(item.due)),
      'SUMMARY:' + textValue(item.title),
      ...(item.course ? ['DESCRIPTION:' + textValue('Course: ' + item.course)] : []),
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {name:'campusconnect-assignment-deadlines.ics',contents:lines.map(foldLine).join('\r\n')+'\r\n',count:eligible.length};
}

export function downloadAssignmentCalendar(items) {
  const file = buildAssignmentCalendar(items);
  if (!file) return false;
  downloadCalendarFile(file);
  return true;
}
