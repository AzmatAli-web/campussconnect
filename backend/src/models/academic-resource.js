import mongoose from 'mongoose';

const {Schema} = mongoose;

/**
 * Published PDFs remain private at rest: storageKey is only ever used by the
 * authenticated file-streaming route and never returned in resource listings.
 */
const resourceSchema = new Schema({
  universityId: {type: Schema.Types.ObjectId, required: true},
  uploadedBy: {type: Schema.Types.ObjectId, required: true},
  title: {type: String, required: true, minlength: 3, maxlength: 160},
  description: {type: String, default: '', maxlength: 1200},
  program: {type: String, required: true, maxlength: 24},
  programKey: {type: String, required: true, maxlength: 24},
  semester: {type: Number, required: true, min: 1, max: 12},
  courseCode: {type: String, required: true, maxlength: 24},
  courseCodeKey: {type: String, required: true, maxlength: 24},
  fileName: {type: String, required: true, maxlength: 160},
  storageKey: {type: String, required: true},
  sizeBytes: {type: Number, required: true, min: 1, max: 8388608},
  mimeType: {type: String, enum: ['application/pdf'], required: true},
  status: {type: String, enum: ['published', 'archived'], required: true, default: 'published'},
  archivedBy: {type: Schema.Types.ObjectId, default: null},
  archivedAt: {type: Date, default: null}
}, {timestamps: true, collection: 'academic_resources', versionKey: false});

resourceSchema.index({universityId: 1, status: 1, programKey: 1,
  semester: 1, courseCodeKey: 1, createdAt: -1});
resourceSchema.index({universityId: 1, uploadedBy: 1, createdAt: -1});

export const AcademicResource = mongoose.models.AcademicResource ??
  mongoose.model('AcademicResource', resourceSchema);
