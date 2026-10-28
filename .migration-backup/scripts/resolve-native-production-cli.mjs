// Native production binary identity only; no browser, voice or business authorization. No process launch, installation,
// version-directory scan or npm fallback. A local descriptor cannot expand the
// independently selected official install roots.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const NATIVE_PRODUCTION_CLI_SCHEMA='native-production-desktop-cli-binding-v1';
export const NATIVE_PRODUCTION_CLI_PURPOSE='owner-private-production-native';
const codes=new Set(['NATIVE_PRODUCTION_CLI_DESCRIPTOR_INVALID','NATIVE_PRODUCTION_CLI_MANIFEST_INVALID','NATIVE_PRODUCTION_CLI_SCOPE_INVALID','NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED','NATIVE_PRODUCTION_CLI_UNAVAILABLE']);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join()===expected.sort().join();
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const textPath=value=>typeof value==='string'&&!!value&&!/[\0\r\n]/.test(value)&&path.isAbsolute(value);
const canonicalPath=value=>process.platform==='win32'?value.toLowerCase():value;
const samePath=(a,b)=>canonicalPath(a)===canonicalPath(b);
const sha=value=>createHash('sha256').update(value).digest('hex');

export function nativeProductionCliOptions(root=process.cwd(),environment=process.env){
 const local=environment?.LOCALAPPDATA,profile=environment?.USERPROFILE,codex=environment?.CODEX_HOME||(textPath(profile)?path.join(profile,'.codex'):null);
 if(!textPath(root)||!textPath(local)||!textPath(codex))fail('NATIVE_PRODUCTION_CLI_UNAVAILABLE');
 return{descriptor_file:path.join(path.resolve(root),'.sites-runtime/runtime-descriptors/production-cli.json'),official_manifest_root:path.join(codex,'plugins/cache/openai-bundled/unified-computer-use'),official_binary_root:path.join(local,'OpenAI/Codex/bin')};
}

function checkedPath(value,directory=false){
 if(!textPath(value))fail('NATIVE_PRODUCTION_CLI_SCOPE_INVALID');
 const resolved=path.resolve(value);let current=path.parse(resolved).root;
 for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const stat=fs.lstatSync(current);
  if(stat.isSymbolicLink()||current!==resolved&&!stat.isDirectory())fail('NATIVE_PRODUCTION_CLI_SCOPE_INVALID');
 }
 const stat=fs.lstatSync(resolved),real=fs.realpathSync(resolved);
 if(stat.isSymbolicLink()||!(directory?stat.isDirectory():stat.isFile())||!samePath(real,resolved))fail('NATIVE_PRODUCTION_CLI_SCOPE_INVALID');
 return real;
}
function installedEntry(root,file,name){
 const relative=path.relative(root,file),parts=relative.split(path.sep);
 if(path.isAbsolute(relative)||parts.length!==2||!parts[0]||parts[0]==='..'||!samePath(parts[1],name)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(parts[0]))fail('NATIVE_PRODUCTION_CLI_SCOPE_INVALID');
}
function fileBytes(file,max,collect=true){
 const initial=fs.lstatSync(file);if(initial.isSymbolicLink()||!initial.isFile()||initial.size<1||initial.size>max)fail('NATIVE_PRODUCTION_CLI_SCOPE_INVALID');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const before=fs.fstatSync(fd);if(before.dev!==initial.dev||before.ino!==initial.ino||!before.isFile())fail('NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED');
  const hash=createHash('sha256'),buffer=Buffer.alloc(Math.min(1024*1024,before.size)),chunks=[];let position=0;
  while(position<before.size){const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,before.size-position),position);if(!count)fail('NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED');hash.update(buffer.subarray(0,count));if(collect)chunks.push(Buffer.from(buffer.subarray(0,count)));position+=count;}
  const after=fs.fstatSync(fd),current=fs.lstatSync(file);
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||current.isSymbolicLink()||current.dev!==before.dev||current.ino!==before.ino||current.size!==before.size||current.mtimeMs!==before.mtimeMs)fail('NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED');
  return{sha256:hash.digest('hex'),...(collect?{bytes:Buffer.concat(chunks)}:{})};
 }finally{fs.closeSync(fd);}
}

// JSON.parse silently keeps the last duplicate key. Reject duplicates including
// escaped spellings, so there is exactly one selected CUA path in the manifest.
function uniqueJson(bytes,code){
 const source=bytes.toString('utf8');if(!Buffer.from(source).equals(bytes))fail(code);let at=0;
 const whitespace=()=>{while(/[\x20\t\r\n]/.test(source[at]||'!'))at++;};
 function string(){const start=at++;let escape=false;for(;at<source.length;at++){const c=source[at];if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"'){at++;return JSON.parse(source.slice(start,at));}}fail(code);}
 function value(depth=0){
  if(depth>64)fail(code);whitespace();const c=source[at];
  if(c==='"'){string();return;}
  if(c==='{'||c==='['){const map=c==='{',seen=new Set(),end=map?'}':']';at++;whitespace();if(source[at]===end){at++;return;}
   while(at<source.length){if(map){if(source[at]!=='"')fail(code);const key=string();if(seen.has(key))fail(code);seen.add(key);whitespace();if(source[at++]!==':')fail(code);}value(depth+1);whitespace();if(source[at]===end){at++;return;}if(source[at++]!==',')fail(code);whitespace();}fail(code);
  }
  const literal=source.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!literal)fail(code);at+=literal[0].length;
 }
 try{value();whitespace();if(at!==source.length)fail(code);return JSON.parse(source);}catch{fail(code);}
}

export function resolveNativeProductionCli(options){
 try{
  if(!object(options))fail('NATIVE_PRODUCTION_CLI_DESCRIPTOR_INVALID');
  const descriptorFile=checkedPath(options.descriptor_file),manifestRoot=checkedPath(options.official_manifest_root,true),binaryRoot=checkedPath(options.official_binary_root,true);
  const descriptor=uniqueJson(fileBytes(descriptorFile,65536).bytes,'NATIVE_PRODUCTION_CLI_DESCRIPTOR_INVALID');
  if(!keys(descriptor,['schema','purpose','manifest','binary'])||descriptor.schema!==NATIVE_PRODUCTION_CLI_SCHEMA||descriptor.purpose!==NATIVE_PRODUCTION_CLI_PURPOSE||!keys(descriptor.manifest,['path','sha256'])||!keys(descriptor.binary,['path','sha256','version'])||!digest(descriptor.manifest.sha256)||!digest(descriptor.binary.sha256)||typeof descriptor.binary.version!=='string'||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(descriptor.binary.version))fail('NATIVE_PRODUCTION_CLI_DESCRIPTOR_INVALID');
  const manifestPath=checkedPath(descriptor.manifest.path);installedEntry(manifestRoot,manifestPath,'.mcp.json');
  // The bundled manifest may refresh transient desktop fields (for example
  // its session pipe) without changing the selected production executable.
  // Parse the current official file, then independently bind its CLI path and
  // executable bytes below. Keep the actual manifest hash in the receipt.
  const manifestFile=fileBytes(manifestPath,2*1024*1024);
  const manifest=uniqueJson(manifestFile.bytes,'NATIVE_PRODUCTION_CLI_MANIFEST_INVALID'),server=manifest?.mcpServers?.cua_repl;
  if(!object(manifest?.mcpServers)||!object(server)||server.enabled!==true||!object(server.env)||!Object.hasOwn(server.env,'CODEX_CLI_PATH')||!textPath(server.env.CODEX_CLI_PATH))fail('NATIVE_PRODUCTION_CLI_MANIFEST_INVALID');
  const executable=checkedPath(descriptor.binary.path),manifestExecutable=checkedPath(server.env.CODEX_CLI_PATH);installedEntry(binaryRoot,executable,'codex.exe');
  if(!samePath(executable,manifestExecutable))fail('NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED');
  if(fileBytes(executable,1024*1024*1024,false).sha256!==descriptor.binary.sha256)fail('NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED');
  const identity={schema:descriptor.schema,purpose:descriptor.purpose,manifest_path:manifestPath,manifest_sha256:manifestFile.sha256,cli_path:executable,binary_sha256:descriptor.binary.sha256,version:descriptor.binary.version,entrypoint_kind:'native'};
  return{cli_path:executable,version:descriptor.binary.version,source_identity_sha256:sha(JSON.stringify(identity)),entrypoint_kind:'native'};
 }catch(error){const code=codes.has(error?.code)?error.code:'NATIVE_PRODUCTION_CLI_UNAVAILABLE';throw Object.assign(new Error(code),{code});}
}
