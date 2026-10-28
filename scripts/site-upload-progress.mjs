// Exact local evidence for resuming immutable Site archive transfers. Callers
// must hold their own output-directory upload lock; this never acquires/steals it.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),fail=()=>{throw Error('SITE_UPLOAD_PROGRESS_IDENTITY_OR_BYTES_CHANGED')};
const readBytes=file=>{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())fail();return fs.readFileSync(file)};
export function createSiteUploadProgress(outputDir,{namespace,job_id,transfer_id,input_hash,binding,files}){
 if(!/^[a-z][a-z-]{0,39}$/.test(namespace||'')||!/^job_[a-f0-9-]{36}$/.test(job_id||'')||typeof transfer_id!=='string'||!transfer_id||transfer_id.length>240||!/^[a-f0-9]{64}$/.test(input_hash||'')||!binding||typeof binding!=='object'||!files||typeof files!=='object')fail();
 const root=fs.realpathSync(outputDir);if(!fs.statSync(root).isDirectory())fail();const normalized=Object.fromEntries(Object.entries(files).map(([role,f])=>{if(!/^[a-z][a-z0-9_]{0,39}$/.test(role)||!/^[a-f0-9]{64}$/.test(f.sha256||'')||!Number.isSafeInteger(f.size_bytes)||f.size_bytes<1)fail();return[role,{sha256:f.sha256,size_bytes:f.size_bytes}]})),identity={schema:'exact-site-upload-progress-v1',namespace,job_id,transfer_id,input_hash,binding,files:normalized},file=path.join(root,'.site-upload-'+namespace+'-progress.json');let state={...identity,archives:{}};
 if(fs.existsSync(file)){try{state=JSON.parse(readBytes(file).toString('utf8'))}catch{fail()}const{archives,...saved}=state;if(canonical(saved)!==canonical(identity)||!archives||typeof archives!=='object'||Array.isArray(archives)||Object.keys(archives).some(role=>!normalized[role]))fail();}
 const save=()=>{const temp=file+'.partial-'+randomUUID();try{fs.writeFileSync(temp,canonical(state),{flag:'wx'});fs.renameSync(temp,file)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}};
 return{forArchive(role,a){
  // The service may add dimensions after decoding a sealed PNG. They do not
  // change the immutable uploaded bytes or restart this transfer identity.
  const expected=normalized[role],fileIdentity=a?.file?Object.fromEntries(['role','sha256','size_bytes','file_name','mime_type'].map(k=>[k,a.file[k]])):null,descriptor={site_archive_id:a?.site_archive_id,file:fileIdentity,part_size:a?.part_size,part_count:a?.part_count};if(!expected||typeof a?.site_archive_id!=='string'||!a.site_archive_id||a.file?.role!==role||a.file.sha256!==expected.sha256||a.file.size_bytes!==expected.size_bytes||!Number.isSafeInteger(a.part_size)||a.part_size<1||!Number.isSafeInteger(a.part_count)||a.part_count!==Math.ceil(expected.size_bytes/a.part_size))fail();
  let p=state.archives[role];if(!p){p=state.archives[role]={descriptor,uploaded:{},readback:{}};save()}else if(canonical(p.descriptor)!==canonical(descriptor)||!p.uploaded||!p.readback||Object.keys(p).sort().join(',')!=='descriptor,readback,uploaded')fail();
  const check=(n,bytes)=>{if(!Number.isSafeInteger(n)||n<0||n>=a.part_count||!Buffer.isBuffer(bytes)||bytes.length!==Math.min(a.part_size,expected.size_bytes-n*a.part_size))fail();return{sha256:sha(bytes),size_bytes:bytes.length}};
  const chunk=n=>path.join(root,'.site-upload-'+namespace+'-'+role+'-'+sha(a.site_archive_id).slice(0,24)+'-'+n+'.bin');
  return{uploaded(n,bytes){const r=check(n,bytes),saved=p.uploaded[n];if(!saved)return false;if(canonical(saved)!==canonical(r))fail();return true},
   acknowledgeUpload(n,bytes){const r=check(n,bytes);if(p.uploaded[n]&&canonical(p.uploaded[n])!==canonical(r))fail();p.uploaded[n]=r;save()},
   cachedReadback(n,expectedBytes){const r=check(n,expectedBytes),saved=p.readback[n];if(!saved)return null;if(canonical(saved)!==canonical(r)||!fs.existsSync(chunk(n)))fail();const bytes=readBytes(chunk(n));if(bytes.length!==r.size_bytes||sha(bytes)!==r.sha256)fail();return bytes},
   rememberReadback(n,bytes,expectedBytes){const r=check(n,bytes),expected=check(n,expectedBytes);if(canonical(r)!==canonical(expected))fail();const dest=chunk(n);if(fs.existsSync(dest)){const prior=readBytes(dest);if(!prior.equals(bytes))fail()}else fs.writeFileSync(dest,bytes,{flag:'wx'});p.readback[n]=r;save()}
  };
 }};
}
