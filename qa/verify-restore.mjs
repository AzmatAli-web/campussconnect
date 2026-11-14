// Manual restore verification. Dry-run by default; never drops a database.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required (see qa/README.md).');
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
const source = required('CAMPUS_BACKUP_SOURCE_DB');
if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(source) ||
    ['admin', 'config', 'local'].includes(source.toLowerCase())) {
  throw new Error('Provide an ordinary application source database name.');
}
const config = await existingFile('CAMPUS_RESTORE_CONFIG');
const archive = await existingFile('CAMPUS_BACKUP_FILE');
if (!archive.endsWith('.archive.gz')) throw new Error('Expected a .archive.gz backup file.');
if ((await stat(archive)).size === 0) throw new Error('Backup archive is empty.');
if (process.env.CAMPUS_BACKUP_CONFIG &&
    path.resolve(process.env.CAMPUS_BACKUP_CONFIG) === path.resolve(config)) {
  throw new Error('Restore credentials must be a separate disposable-test connection.');
}
const write = process.env.CAMPUS_RESTORE_WRITE === 'YES_DISPOSABLE';
const target = 'campusconnect_restore_' + Date.now() + '_' + randomBytes(4).toString('hex');
const args = [
  '--config=' + config, '--archive=' + archive, '--gzip',
  '--nsInclude=' + source + '.*',
  '--nsFrom=' + source + '.*', '--nsTo=' + target + '.*',
  '--stopOnError'
];
if (!write) args.push('--dryRun');
console.log(write
  ? 'WRITING into a uniquely named database on the explicitly configured disposable target.'
  : 'DRY RUN ONLY: no documents will be written.');
console.log('Proposed destination database:', target);
await run(process.env.CAMPUS_MONGORESTORE_BIN || 'mongorestore', args);
console.log(write
  ? 'Restore command completed. Manually inspect document counts/indexes in ' + target +
    ' on the disposable target, then clean up that temporary database.'
  : 'Dry run completed. This is NOT a verified full restore; use a disposable target for that.');
