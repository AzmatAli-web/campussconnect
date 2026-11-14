const eventId = /^[0-9a-f]{24}$/;
const dateTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const encoder = new TextEncoder();

function parseInstant(value) {
  if (typeof value !== 'string' || !dateTime.test(value)) return NaN;
  // Date.parse normalizes impossible dates such as February 30.
  const day = new Date(value.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return Date.parse(value);
}

function eventTimes(event, now) {
  if (event?.status !== 'published' || typeof event.id !== 'string' || !eventId.test(event.id) ||
      typeof event.title !== 'string' || !event.title.trim() || !Number.isFinite(now)) return null;
  const start = parseInstant(event.startsAt);
  const end = parseInstant(event.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && Math.floor(end / 1000) > Math.floor(start / 1000) && start > now
    ? {start, end}
    : null;
}

export const canExportEvent = (event, now = Date.now()) => eventTimes(event, now) !== null;

const textValue = value => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/[,;]/g, '\\$&');

const utc = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function foldLine(line) {
  let folded = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      folded += '\r\n ';
      bytes = 1;
    }
    folded += character;
    bytes += size;
  }
  return folded;
}

// Explicit allowlist: no profile, receipt, roster, token, or attendee fields.
export function buildEventCalendar(event, now = Date.now()) {
  const times = eventTimes(event, now);
  if (!times) return null;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusConnect//Campus Events//EN',
    'BEGIN:VEVENT', 'UID:' + event.id + '@events.campusconnect.invalid',
    'DTSTAMP:' + utc(now), 'DTSTART:' + utc(times.start), 'DTEND:' + utc(times.end),
    'SUMMARY:' + textValue(event.title),
  ];
  if (typeof event.venue === 'string' && event.venue.trim()) lines.push('LOCATION:' + textValue(event.venue));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return {name: 'campusconnect-event-' + event.id + '.ics', contents: lines.map(foldLine).join('\r\n') + '\r\n'};
}

export function downloadEventCalendar(event) {
  const file = buildEventCalendar(event);
  if (!file) return;
  const url = URL.createObjectURL(new Blob([file.contents], {type: 'text/calendar;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to begin the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
