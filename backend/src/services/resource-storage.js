import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {AcademicResource} from '../models/academic-resource.js';
import {HttpError} from '../lib/http-error.js';
import {scanResource} from './resource-scanner.js';

export const quarantineExpiry = () => new Date(Date.now() + 24 * 3600000);

export async function migrateLegacyPdf(resource, root, scan = scanResource) {
  if (!/^[a-f0-9-]{36}\.pdf$/.test(resource.storageKey))
    throw new HttpError(404, 'RESOURCE_FILE_MISSING', 'Legacy PDF unavailable');
  let bytes;
  try { bytes = await readFile(path.join(root, resource.storageKey)); }
  catch { throw new HttpError(404, 'RESOURCE_FILE_MISSING', 'Legacy PDF unavailable'); }
  if (bytes.length !== resource.sizeBytes || bytes.length > 8388608)
    throw new HttpError(409, 'RESOURCE_FILE_CHANGED', 'Legacy PDF size mismatch');
  const filter = {_id:resource._id, universityId:resource.universityId,
    status:'published', storageKey:resource.storageKey, scannedAt:{$exists:false}};
  try { await scan(bytes); }
  catch (error) {
    if (error.code === 'RESOURCE_SCAN_REJECTED')
      await AcademicResource.updateOne(filter, {$set:{status:'quarantined', purgeAt:quarantineExpiry()}});
    throw error;
  }
  await AcademicResource.updateOne(filter, {$set:{pdfBytes:bytes, scannedAt:new Date()}, $unset:{storageKey:1}});
}
