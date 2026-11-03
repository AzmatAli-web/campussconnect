import {HttpError} from '../lib/http-error.js';

const codePattern = /^[A-Z0-9][A-Z0-9 -]*$/;
const allowed = ['title', 'description', 'program', 'semester', 'courseCode'];
const maxPdfBytes = 8 * 1024 * 1024;

function text(input, field, min, max) {
  if (typeof input !== 'string' || input.trim().length < min ||
      input.trim().length > max) {
    throw new HttpError(422, 'INVALID_RESOURCE_METADATA',
      field + ' must contain ' + min + '–' + max + ' characters');
  }
  return input.trim().replace(/\s+/g, ' ');
}
function cohortCode(input, field) {
  const result = text(input, field, 2, 24).toUpperCase();
  if (!codePattern.test(result)) {
    throw new HttpError(422, 'INVALID_RESOURCE_METADATA', 'Invalid ' + field);
  }
  return result;
}
export function validateResourceMetadata(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !allowed.includes(k))) {
    throw new HttpError(422, 'INVALID_RESOURCE_METADATA', 'Unsupported resource metadata');
  }
  const title = text(body.title, 'title', 3, 160);
  const program = cohortCode(body.program, 'program');
  const courseCode = cohortCode(body.courseCode, 'courseCode');
  const semester = Number(body.semester);
  if (!/^(?:[1-9]|1[0-2])$/.test(String(body.semester)) ||
      !Number.isInteger(semester)) {
    throw new HttpError(422, 'INVALID_RESOURCE_METADATA', 'Semester must be 1–12');
  }
  const description = body.description == null || body.description === ''
    ? '' : text(body.description, 'description', 0, 1200);
  return {title, description, program, programKey: program, semester,
    courseCode, courseCodeKey: courseCode};
}
export function validatePdf(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new HttpError(422, 'RESOURCE_FILE_REQUIRED', 'Select a PDF file');
  }
  if (file.buffer.length < 8 || file.buffer.length > maxPdfBytes ||
      !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new HttpError(415, 'INVALID_PDF_CONTENT', 'File must be a valid-size PDF with a PDF header');
  }
  if (file.mimetype !== 'application/pdf' ||
      !/\.pdf$/i.test(file.originalname || '')) {
    throw new HttpError(415, 'UNSUPPORTED_RESOURCE_FILE', 'Only PDF documents are supported');
  }
  return file.buffer;
}
export function safeDownloadName(name) {
  const basename = String(name || '').split(/[\\/]/).pop();
  const safe = basename.replace(/[^a-zA-Z0-9 ._()-]/g, '_')
    .replace(/^[. ]+/, '').slice(0, 155);
  return /^[A-Za-z0-9]/.test(safe) && /\.pdf$/i.test(safe)
    ? safe : 'campus-notes.pdf';
}
export function validateResourceFilter(query) {
  const valid = ['program', 'semester', 'courseCode', 'limit'];
  if (!query || Object.keys(query).some(k => !valid.includes(k))) {
    throw new HttpError(400, 'INVALID_RESOURCE_FILTER', 'Unsupported resource filter');
  }
  const filter = {};
  if (query.program !== undefined) filter.programKey = cohortCode(query.program, 'program');
  if (query.courseCode !== undefined) filter.courseCodeKey = cohortCode(query.courseCode, 'courseCode');
  if (query.semester !== undefined) {
    const semester = Number(query.semester);
    if (!/^(?:[1-9]|1[0-2])$/.test(String(query.semester)) ||
        !Number.isInteger(semester)) {
      throw new HttpError(400, 'INVALID_RESOURCE_FILTER', 'Invalid semester');
    }
    filter.semester = semester;
  }
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, 'INVALID_RESOURCE_FILTER', 'Limit must be 1–100');
  }
  return {filter, limit};
}
export function resourceView(item) {
  const r = item.toObject ? item.toObject() : item;
  return {id: String(r._id), title: r.title, description: r.description,
    program: r.program, semester: r.semester, courseCode: r.courseCode,
    fileName: r.fileName, sizeBytes: r.sizeBytes, status: r.status,
    createdAt: r.createdAt};
}
