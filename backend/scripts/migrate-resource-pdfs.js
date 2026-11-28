import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import {parseEnvironment} from '../src/config/environment.js';
import {connectDatabase} from '../src/config/database.js';
import {AcademicResource} from '../src/models/academic-resource.js';
import {migrateLegacyPdf} from '../src/services/resource-storage.js';

try {
  const config = parseEnvironment();
  if (!config.universityId || !await connectDatabase(config)) throw Error('Missing campus database');
  const root = path.resolve(process.env.RESOURCE_UPLOAD_DIR || 'private_uploads');
  const legacy = AcademicResource.find({universityId:config.universityId, status:'published',
    storageKey:{$exists:true}, scannedAt:{$exists:false}}).cursor();
  for await (const resource of legacy) {
    try { await migrateLegacyPdf(resource, root); }
    catch (error) {
      console.error('Resource migration pending review:', String(resource._id), error.code || error.name);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error('Migration unavailable:', error.name);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
