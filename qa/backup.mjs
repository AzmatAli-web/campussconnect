// Optional, manually invoked MongoDB dump. Never runs as part of an app request.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required (see qa/README.md).');
  return value;
}
function databaseName(value) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(value) ||
      ['admin', 'config', 'local'].includes(value.toLowerCase())) {
    throw new Error('CAMPUS_BACKUP_SOURCE_DB must be one ordinary application database name.');
  }
  return value;
}
async function existingFile(name) {
  const value = required(name);
  if (!path.isAbsolute(value) || !(await stat(value)).isFile()) {
    throw new Error(name + ' must point to an existing absolute file path.');
  }
  return value;
}
function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', shell: false, windowsHide: true });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(bin + ' exited with ' + code)));
  });
}
const db = databaseName(required('CAMPUS_BACKUP_SOURCE_DB'));
const config = await existingFile('CAMPUS_BACKUP_CONFIG');
const outputDir = required('CAMPUS_BACKUP_DIR');
if (!path.isAbsolute(outputDir)) throw new Error('CAMPUS_BACKUP_DIR must be an absolute path.');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(outputDir);
const relative = path.relative(root, output);
if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
  throw new Error('Backup destination must be outside the Git repository.');
}
await mkdir(output, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = 'campusconnect_' + db + '_' + stamp + '_' + randomBytes(4).toString('hex') + '.archive.gz';
const archive = path.join(output, filename);
const partial = archive + '.partial';
try {
  await run(process.env.CAMPUS_MONGODUMP_BIN || 'mongodump',
    ['--config=' + config, '--db=' + db, '--archive=' + partial, '--gzip']);
  const info = await stat(partial);
  if (!info.isFile() || info.size === 0) throw new Error('mongodump created an empty archive.');
  await chmod(partial, 0o600).catch(() => {}); // Windows permissions require separate ACLs.
  await rename(partial, archive);
  console.log('Backup archive created:', archive);
  console.log('Size (bytes):', info.size);
  console.log('Not encrypted/uploaded/scheduled. Protect and verify this archive before relying on it.');
} catch (error) {
  await rm(partial, { force: true }).catch(() => {});
  throw error;
}
