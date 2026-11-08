import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';
const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI is required');
const dir = path.resolve(process.env.BACKUP_DIR || './backups');
const days = Number(process.env.BACKUP_RETENTION_DAYS || 7);
if (!Number.isFinite(days) || days < 1) throw new Error('Invalid retention');
await mkdir(dir,{recursive:true,mode:0o700});
const archive=path.join(dir,'campusconnect-'+new Date().toISOString().replace(/[:.]/g,'-')+'.archive.gz');
function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(bin+' exited '+code)));});}
try {
 await run('mongodump',['--uri',uri,'--archive='+archive,'--gzip']);
 await chmod(archive,0o600);
 if ((await stat(archive)).size===0) throw new Error('Empty backup');
 for(const f of await readdir(dir)){
  if(!/^campusconnect-.*\.archive\.gz$/.test(f))continue;
  const full=path.join(dir,f);
  if(Date.now()-(await stat(full)).mtimeMs>days*86400000)await unlink(full);
 }
 console.log('Backup saved:',archive);
}catch(e){await unlink(archive).catch(()=>{});throw e;}
