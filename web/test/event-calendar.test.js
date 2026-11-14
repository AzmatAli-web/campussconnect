import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildEventCalendar, canExportEvent} from '../src/event-calendar.js';

const now = Date.parse('2026-11-14T10:30:00Z');
const event = {
  id: '0123456789abcdef01234567', status: 'published',
  title: 'Campus workshop', venue: 'Lab 3',
  startsAt: '2026-11-15T10:00:00+05:00', endsAt: '2026-11-15T12:00:00+05:00',
};

test('upcoming event exports only campus-visible title, venue and UTC schedule', () => {
  const file = buildEventCalendar({
    ...event, description: 'unused details', confirmedCount: 8, capacity: 12,
    attendee: 'do-not-export@example.edu', registrationNo: 'STUDENT-ID', token: 'private-token',
    registrations: [{id: 'private-receipt'}],
  }, now);
  assert.equal(file.name, 'campusconnect-event-0123456789abcdef01234567.ics');
  assert.deepEqual(file.contents.split('\r\n'), [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusConnect//Campus Events//EN',
    'BEGIN:VEVENT', 'UID:0123456789abcdef01234567@events.campusconnect.invalid',
    'DTSTAMP:20261114T103000Z', 'DTSTART:20261115T050000Z', 'DTEND:20261115T070000Z',
    'SUMMARY:Campus workshop', 'LOCATION:Lab 3', 'END:VEVENT', 'END:VCALENDAR', '',
  ]);
  assert.equal(canExportEvent({...event, registrationOpen: false, isFull: true}, now), true);
  assert.equal(buildEventCalendar({...event, venue: ''}, now).contents.includes('LOCATION:'), false);
});

test('multibyte content folds by UTF-8 size and property-looking text stays in its field', () => {
  const title = 'ورکشاپ '.repeat(18) + 'Lab, A; B\\C\r\nATTENDEE:fictional@example.edu\x00';
  const {contents} = buildEventCalendar({...event, title}, now);
  assert.ok(contents.includes('\r\n '));
  for (const line of contents.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(!contents.includes('\r\nATTENDEE:'));
  const summary = contents.replace(/\r\n /g, '').split('\r\n').find(line => line.startsWith('SUMMARY:'));
  assert.equal(summary, 'SUMMARY:' + 'ورکشاپ '.repeat(18) + 'Lab\\, A\\; B\\\\C\\nATTENDEE:fictional@example.edu');
});

test('cancelled, started, malformed or timezone-ambiguous events do not export', () => {
  for (const change of [
    {status: 'cancelled'}, {id: 'bad-id'}, {title: ' '},
    {startsAt: '2026-11-14T10:30:00Z'}, {startsAt: '2026-11-15T10:00:00'},
    {startsAt: '2027-02-30T10:00:00Z'}, {endsAt: event.startsAt}, {endsAt: 'bad date'},
    {endsAt: '2026-11-15T10:00:00.001+05:00'},
  ]) {
    assert.equal(canExportEvent({...event, ...change}, now), false);
    assert.equal(buildEventCalendar({...event, ...change}, now), null);
  }
});
