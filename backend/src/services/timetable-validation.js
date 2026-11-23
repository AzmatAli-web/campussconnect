import {HttpError} from '../lib/http-error.js';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
function text(value, field, min, max) {
  if (typeof value !== 'string' || value.trim().length < min ||
      value.trim().length > max) {
    throw new HttpError(422, 'INVALID_TIMETABLE_FIELD',
      field + ' must contain ' + min + '–' + max + ' characters');
  }
  return value.trim().replace(/\s+/g, ' ');
}
function timeMinutes(value, field) {
  if (typeof value !== 'string' || !timePattern.test(value)) {
    throw new HttpError(422, 'INVALID_TIMETABLE_TIME', field + ' must use 24-hour HH:mm');
  }
  const [, hour, minute] = timePattern.exec(value);
  return Number(hour) * 60 + Number(minute);
}
const keys = ['term', 'program', 'semester', 'section', 'dayOfWeek',
  'startTime', 'endTime', 'courseCode', 'courseTitle', 'instructorName', 'room'];

export function normalizeTimetableSlot(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !keys.includes(k))) {
    throw new HttpError(422, 'INVALID_TIMETABLE_BODY', 'Unexpected timetable fields');
  }
  const term = text(body.term, 'term', 3, 40);
  const program = text(body.program, 'program', 2, 24).toUpperCase();
  const section = text(body.section, 'section', 1, 12).toUpperCase();
  const courseCode = text(body.courseCode, 'courseCode', 2, 24).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 -]*$/.test(program) ||
      !/^[A-Z0-9][A-Z0-9-]*$/.test(section) ||
      !/^[A-Z0-9][A-Z0-9 -]*$/.test(courseCode)) {
    throw new HttpError(422, 'INVALID_TIMETABLE_FIELD',
      'Program, section or course code contains unsupported characters');
  }
  if (!Number.isInteger(body.semester) || body.semester < 1 || body.semester > 12 ||
      !Number.isInteger(body.dayOfWeek) || body.dayOfWeek < 1 || body.dayOfWeek > 7) {
    throw new HttpError(422, 'INVALID_TIMETABLE_FIELD',
      'Semester must be 1–12 and dayOfWeek must be 1–7 (Monday–Sunday)');
  }
  const startMinute = timeMinutes(body.startTime, 'startTime');
  const endMinute = timeMinutes(body.endTime, 'endTime');
  if (startMinute < 6 * 60 || endMinute > 22 * 60 ||
      startMinute % 15 !== 0 || endMinute % 15 !== 0 ||
      endMinute <= startMinute || endMinute - startMinute > 4 * 60) {
    throw new HttpError(422, 'INVALID_TIMETABLE_TIME',
      'Classes must use 15-minute boundaries, 06:00–22:00, and last at most 4 hours');
  }
  return {
    term, termKey: term.toLowerCase(), program, programKey: program,
    semester: body.semester, section, sectionKey: section, dayOfWeek: body.dayOfWeek,
    startTime: body.startTime, endTime: body.endTime, startMinute, endMinute,
    slotKeys: Array.from({length: (endMinute - startMinute) / 15},
      (_, i) => startMinute + 15 * i),
    courseCode, courseTitle: text(body.courseTitle, 'courseTitle', 3, 160),
    instructorName: text(body.instructorName, 'instructorName', 2, 120),
    room: text(body.room, 'room', 2, 80)
  };
}
export function timetableGroupFilter(query) {
  const allowed = ['term', 'program', 'semester', 'section'];
  if (!query || Object.keys(query).some(k => !allowed.includes(k))) {
    throw new HttpError(400, 'INVALID_TIMETABLE_FILTER', 'Unknown filter');
  }
  const {term, program, semester, section} = query;
  if (!term || !program || !semester || !section) {
    throw new HttpError(400, 'INVALID_TIMETABLE_FILTER',
      'Select a timetable group before loading classes');
  }
  const n = Number(semester);
  if (!/^(?:[1-9]|1[0-2])$/.test(String(semester)) ||
      !Number.isInteger(n)) {
    throw new HttpError(400, 'INVALID_TIMETABLE_FILTER', 'Invalid semester');
  }
  const cleanTerm = text(term, 'term', 3, 40).toLowerCase();
  const cleanProgram = text(program, 'program', 2, 24).toUpperCase();
  const cleanSection = text(section, 'section', 1, 12).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 -]*$/.test(cleanProgram) ||
      !/^[A-Z0-9][A-Z0-9-]*$/.test(cleanSection)) {
    throw new HttpError(400, 'INVALID_TIMETABLE_FILTER', 'Invalid cohort filter');
  }
  return {termKey: cleanTerm, programKey: cleanProgram, semester: n,
    sectionKey: cleanSection};
}
export function timetableView(s) {
  const doc = s.toObject ? s.toObject() : s;
  return {id: String(doc._id), term: doc.term, program: doc.program,
    semester: doc.semester, section: doc.section, dayOfWeek: doc.dayOfWeek,
    startTime: doc.startTime, endTime: doc.endTime, courseCode: doc.courseCode,
    courseTitle: doc.courseTitle, instructorName: doc.instructorName, room: doc.room};
}
