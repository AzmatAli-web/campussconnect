import mongoose from 'mongoose';

const {Schema} = mongoose;

/**
 * Each published entry stores one multikey per quarter-hour. A partial unique
 * compound index prevents overlapping published classes for the SAME cohort,
 * even when two staff members publish concurrently.
 */
const slotSchema = new Schema({
  universityId: {type: Schema.Types.ObjectId, required: true},
  term: {type: String, required: true, maxlength: 40},
  termKey: {type: String, required: true, maxlength: 40},
  program: {type: String, required: true, maxlength: 24},
  programKey: {type: String, required: true, maxlength: 24},
  semester: {type: Number, required: true, min: 1, max: 12},
  section: {type: String, required: true, maxlength: 12},
  sectionKey: {type: String, required: true, maxlength: 12},
  dayOfWeek: {type: Number, required: true, min: 1, max: 7},
  startTime: {type: String, required: true},
  endTime: {type: String, required: true},
  startMinute: {type: Number, required: true},
  endMinute: {type: Number, required: true},
  // one numeric value per occupied 15-minute interval
  slotKeys: {type: [Number], required: true, default: []},
  courseCode: {type: String, required: true, maxlength: 24},
  courseTitle: {type: String, required: true, maxlength: 160},
  instructorName: {type: String, required: true, maxlength: 120},
  room: {type: String, required: true, maxlength: 80},
  status: {type: String, enum: ['published', 'archived'], default: 'published'},
  publishedBy: {type: Schema.Types.ObjectId, required: true},
  archivedBy: {type: Schema.Types.ObjectId, default: null},
  archivedAt: {type: Date, default: null}
}, {timestamps: true, collection: 'timetable_slots', versionKey: false});

slotSchema.index(
  {universityId: 1, termKey: 1, programKey: 1, semester: 1,
    sectionKey: 1, dayOfWeek: 1, slotKeys: 1},
  {unique: true, partialFilterExpression: {status: 'published'},
    name: 'unique_published_cohort_quarter_hour'}
);
slotSchema.index(
  {universityId: 1, status: 1, termKey: 1, programKey: 1,
    semester: 1, sectionKey: 1, dayOfWeek: 1, startMinute: 1}
);
slotSchema.pre('validate', function (next) {
  if (this.slotKeys.length === 0 ||
      this.slotKeys.length !== (this.endMinute - this.startMinute) / 15) {
    return next(new Error('Timetable slot keys must cover the full class interval'));
  }
  next();
});

export const TimetableSlot = mongoose.models.TimetableSlot ??
  mongoose.model('TimetableSlot', slotSchema);
