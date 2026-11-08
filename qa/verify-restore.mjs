import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
const uri=process.env.MONGO_URI, source=process.env.BACKUP_SOURCE_DB;
if(!uri||!source||!/^[\w-]+$/.test(source))throw new Error('Set MONGO_URI and BACKUP_SOURCE_DB');
const dir=path.resolve(process.env.BACKUP_DIR||'./backups');
const files=(await readdir(dir)).filter(f=>/^campusconnect-.*\.archive\.gz$/.test(f)).sort();
const archive=process.env.BACKUP_FILE|| (files.length?path.join(dir,files.at(-1)):null);
if(!archive)throw new Error('No backup found');
const testDb='campusconnect_restore_test_'+Date.now()+'_'+process.pid;
function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(bin+' exited '+code)));});}
let MongoClient;
try {({MongoClient}=await import('mongodb'));}catch{throw new Error('Install mongodb in repository root: npm install --no-save mongodb');}
const client=new MongoClient(uri);
try {
 await client.connect();
 await run('mongorestore',['--uri',uri,'--archive='+archive,'--gzip','--nsFrom='+source+'.*','--nsTo='+testDb+'.*']);
 const cols=await client.db(testDb).listCollections().toArray();
 if(!cols.length)throw new Error('No collections restored');
 for(const col of cols)console.log(col.name,await client.db(testDb).collection(col.name).countDocuments());
 console.log('PASS: restored',cols.length,'collections');
}finally{
 try{await client.db(testDb).dropDatabase();}finally{await client.close();}
}
