import {Router} from 'express';
import {HttpError, asyncHandler} from '../lib/http-error.js';
import {campusUserMiddleware, needRole} from '../middleware/campus-user.js';
import {requireObjectId} from '../services/mvp-validation.js';
import {normalizeTimetableSlot, timetableGroupFilter, timetableView} from '../services/timetable-validation.js';
import {TimetableSlot} from '../models/timetable.js';

/** Official timetable publishing: university staff/admin only. */
export function timetableRouter(deps) {
  const router = Router();
  const auth = campusUserMiddleware(deps);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/timetable/groups', auth, asyncHandler(async(req, res) => {
    const items = await TimetableSlot.aggregate([
      {$match: {universityId: req.currentUser.universityId, status: 'published'}},
      {$group: {_id: {termKey: '$termKey', programKey: '$programKey',
        semester: '$semester', sectionKey: '$sectionKey'},
        term: {$first: '$term'}, program: {$first: '$program'},
        semester: {$first: '$semester'}, section: {$first: '$section'}}},
      {$sort: {term: -1, program: 1, semester: 1, section: 1}},
      {$limit: 500},
      {$project: {_id: 0, term: 1, program: 1, semester: 1, section: 1}}
    ]);
    return res.json({data: items});
  }));

  router.get('/timetable/slots', auth, asyncHandler(async(req, res) => {
    const cohort = timetableGroupFilter(req.query);
    const items = await TimetableSlot.find({
      universityId: req.currentUser.universityId, status: 'published', ...cohort
    }).select('term program semester section dayOfWeek startTime endTime courseCode courseTitle instructorName room')
      .sort({dayOfWeek: 1, startMinute: 1, _id: 1}).limit(200).lean();
    return res.json({data: items.map(timetableView)});
  }));

  router.post('/timetable/slots', auth, asyncHandler(async(req, res) => {
    needRole(req, 'staff', 'admin');
    const input = normalizeTimetableSlot(req.body);
    try {
      const slot = await TimetableSlot.create({
        ...input, universityId: req.currentUser.universityId,
        status: 'published', publishedBy: req.currentUser._id
      });
      return res.status(201).json({data: timetableView(slot)});
    } catch (error) {
      if (error?.code === 11000) {
        throw new HttpError(409, 'TIMETABLE_CONFLICT',
          'This section already has a class during these minutes');
      }
      throw error;
    }
  }));

  router.post('/timetable/slots/:id/archive', auth, asyncHandler(async(req, res) => {
    needRole(req, 'staff', 'admin');
    const id = requireObjectId(req.params.id);
    if (!req.body || Object.keys(req.body).length !== 0 ||
        Array.isArray(req.body)) {
      throw new HttpError(422, 'INVALID_TIMETABLE_BODY', 'Archiving does not accept a body');
    }
    const updated = await TimetableSlot.findOneAndUpdate({
      _id: id, universityId: req.currentUser.universityId, status: 'published'
    }, {$set: {status: 'archived', archivedBy: req.currentUser._id,
      archivedAt: new Date()}}, {new: true});
    if (!updated) {
      throw new HttpError(404, 'TIMETABLE_NOT_FOUND',
        'Published class not found');
    }
    return res.json({data: {id: String(updated._id), status: 'archived'}});
  }));

  return router;
}
