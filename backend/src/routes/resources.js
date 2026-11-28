import {scanResource} from '../services/resource-scanner.js';
import {migrateLegacyPdf, quarantineExpiry} from '../services/resource-storage.js';
import path from 'node:path';
import multer from 'multer';
import {Router} from 'express';
import {HttpError, asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware, needRole, verifiedFaculty} from '../middleware/campus-user.js';
import {requireObjectId} from '../services/mvp-validation.js';
import {AcademicResource} from '../models/academic-resource.js';
import {validateResourceMetadata, validatePdf, safeDownloadName,
  validateResourceFilter, parseSavedResourceIds, resourceView} from '../services/resource-validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 8 * 1024 * 1024, files: 1, fields: 5, parts: 6},
  fileFilter(_req, file, next) {
    if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(file.originalname)) {
      return next(new HttpError(415, 'UNSUPPORTED_RESOURCE_FILE',
        'Only PDF uploads up to 8 MB are supported'));
    }
    return next(null, true);
  }
}).single('file');

function handleUpload(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next(new HttpError(415, 'MULTIPART_REQUIRED', 'Send a multipart PDF upload'));
  }
  upload(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const size = error.code === 'LIMIT_FILE_SIZE';
      return next(new HttpError(size ? 413 : 422,
        size ? 'RESOURCE_TOO_LARGE' : 'INVALID_RESOURCE_UPLOAD',
        size ? 'PDF exceeds the 8 MB limit' : 'Invalid multipart upload'));
    }
    return next(error);
  });
}
function requirePublisher(req, _res, next) {
  if (!verifiedFaculty(req)) {
    return next(new HttpError(403, 'FACULTY_NOT_VERIFIED',
      'Only verified Faculty can publish academic resources'));
  }
  next();
}
function uploadRoot(deps) {
  return path.resolve(deps.config.resourceUploadDir ??
    process.env.RESOURCE_UPLOAD_DIR ??
    path.join(process.cwd(), 'private_uploads'));
}

export function resourcesRouter(deps) {
  const router = Router();
  const auth = campusUserMiddleware(deps);
  const scan = deps.scanPdf ?? scanResource;
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  router.get('/resources', auth, asyncHandler(async(req, res) => {
    const {filter, limit} = validateResourceFilter(req.query);
    const rows = await AcademicResource.find({
      universityId: deps.config.universityId, status: 'published', ...filter
    }).select('title description program semester courseCode fileName sizeBytes status createdAt')
      .sort({createdAt: -1, _id: -1}).limit(limit).lean();
    return res.json({data: rows.map(resourceView)});
  }));

  router.get('/me/saved-resources', auth, asyncHandler(async(req, res) => {
    needRole(req, 'student');
    const ids = parseSavedResourceIds(req.query);
    const rows = await AcademicResource.find({
      _id: {$in: ids}, universityId: deps.config.universityId, status: 'published'
    }).select('title description program semester courseCode fileName sizeBytes status createdAt').lean();
    const byId = new Map(rows.map(row => [String(row._id), resourceView(row)]));
    return res.json({data: ids.map(id => byId.get(id)).filter(Boolean)});
  }));

  router.get('/me/resources', auth, asyncHandler(async(req, res) => {
    if (!verifiedFaculty(req)) {
      throw new HttpError(403, 'FACULTY_NOT_VERIFIED',
        'Verified Faculty access required');
    }
    const rows = await AcademicResource.find({
      universityId: deps.config.universityId,
      uploadedBy: req.currentUser._id, status: {$in:['published','archived']}
    }).select('title description program semester courseCode fileName sizeBytes status createdAt')
      .sort({createdAt: -1, _id: -1}).limit(100).lean();
    return res.json({data: rows.map(resourceView)});
  }));

  router.post('/resources', auth, requirePublisher, handleUpload,
    asyncHandler(async(req, res) => {
      const metadata = validateResourceMetadata(req.body);
      const bytes = validatePdf(req.file);
      const pending = await AcademicResource.create({
        ...metadata, universityId:deps.config.universityId, uploadedBy:req.currentUser._id,
        fileName:safeDownloadName(req.file.originalname), mimeType:'application/pdf',
        sizeBytes:bytes.length, pdfBytes:bytes, status:'quarantined', purgeAt:quarantineExpiry()
      });
      await scan(bytes);
      const resource = await AcademicResource.findOneAndUpdate(
        {_id:pending._id, status:'quarantined'},
        {$set:{status:'published', scannedAt:new Date()}, $unset:{purgeAt:1}}, {new:true});
      if (!resource) throw new HttpError(409,'RESOURCE_CHANGED','Upload expired. Please retry.');
      return res.status(201).json({data: resourceView(resource)});
    })
  );

  router.get('/resources/:id/file', auth, asyncHandler(async(req, res) => {
    const filter = {_id:requireObjectId(req.params.id), universityId:deps.config.universityId,
      status:'published'};
    let resource = await AcademicResource.findOne(filter).select('+pdfBytes');
    if (resource?.storageKey && !resource.scannedAt) {
      await migrateLegacyPdf(resource, uploadRoot(deps), scan);
      resource = await AcademicResource.findOne(filter).select('+pdfBytes');
    }
    if (!resource || !resource.scannedAt || resource.pdfBytes?.length !== resource.sizeBytes)
      throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource file unavailable');
    res.attachment(resource.fileName).type('application/pdf').send(resource.pdfBytes);
  }));

  router.post('/resources/:id/archive', auth, asyncHandler(async(req, res) => {
    if (!req.is('application/json') || !req.body ||
        Object.keys(req.body).length !== 0 || Array.isArray(req.body)) {
      throw new HttpError(422, 'INVALID_RESOURCE_BODY', 'Archive requires an empty JSON object');
    }
    const id = requireObjectId(req.params.id);
    const target = await AcademicResource.findOne({
      _id: id, universityId: deps.config.universityId, status: 'published'
    }).lean();
    if (!target) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    if (!req.roles.includes('admin') &&
        !(verifiedFaculty(req) && String(target.uploadedBy) === String(req.currentUser._id))) {
      throw new HttpError(403, 'FORBIDDEN',
        'Only the original verified Faculty uploader or Admin can archive');
    }
    const updated = await AcademicResource.findOneAndUpdate({
      _id: id, universityId: deps.config.universityId, status: 'published'
    }, {$set: {status: 'archived', archivedBy: req.currentUser._id,
      archivedAt: new Date(), purgeAt:new Date(Date.now()+30*86400000)}}, {new: true});
    if (!updated) throw new HttpError(409, 'RESOURCE_CHANGED', 'Resource was already archived');
    return res.json({data: {id, status: 'archived'}});
  }));
  return router;
}
