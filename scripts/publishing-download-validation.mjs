// Validates decoded archive bytes against the immutable publishing work packet.
// This module has no network, browser, credential, or owner-identity capability.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream,existsSync,linkSync,mkdirSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export function validateExpectedArchive(binding){
 if(!binding||typeof binding.expected_sha256!=='string'||!/^[a-f0-9]{64}$/.test(binding.expected_sha256))throw Error('Expected archive SHA must be the approved work-packet SHA256');
 if(!Number.isSafeInteger(binding.expected_size_bytes)||binding.expected_size_bytes<=0)throw Error('expected_size_bytes must be the positive integer byte size from the approved work packet');
 return {expected_sha256:binding.expected_sha256,expected_size_bytes:binding.expected_size_bytes};
}
function headerFacts(response){
 const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding'),decodedLength=encoding===null||encoding.trim().toLowerCase()==='identity';
 return {header_content_length:length,header_content_encoding:encoding,header_length_scope:decodedLength?'decoded-archive-bytes':'encoded-transfer-bytes',length:length===null?null:Number(length),valid_length:length===null||/^\d+$/.test(length)&&Number.isSafeInteger(Number(length)),decoded_length:decodedLength};
}
function validationError(message,actual,binding,headers){
 // Explicit whitelist: never include request payloads, URLs, credentials or full headers.
 return Error(message+' '+JSON.stringify({actual_sha256:actual?.sha256??null,actual_size_bytes:actual?.size_bytes??null,expected_sha256:binding.expected_sha256,expected_size_bytes:binding.expected_size_bytes,header_content_length:headers.header_content_length,header_content_encoding:headers.header_content_encoding,header_length_scope:headers.header_length_scope}));
}
function verify(actual,binding,headers,message){
 if(actual.sha256!==binding.expected_sha256||actual.size_bytes!==binding.expected_size_bytes||!headers.valid_length||headers.decoded_length&&headers.length!==null&&actual.size_bytes!==headers.length)throw validationError(message,actual,binding,headers);
}
async function inspectFile(file){const digest=createHash('sha256');let size=0;for await(const bytes of createReadStream(file)){digest.update(bytes);size+=bytes.length;}return {sha256:digest.digest('hex'),size_bytes:size};}

export async function saveVerifiedArchive(response,expected,downloadRoot){
 const binding=validateExpectedArchive(expected),headers=headerFacts(response);
 if(response.headers.get('x-asset-sha256')!==binding.expected_sha256)throw validationError('Expected final-media SHA does not match private archive response',null,binding,headers);
 if(!headers.valid_length)throw validationError('Invalid archive Content-Length header',null,binding,headers);
 let name;try{name=decodeURIComponent((response.headers.get('content-disposition')||'').split("filename*=UTF-8''")[1]||'');}catch{throw Error('Unsafe archive filename');}
 if(!name||name==='.'||name==='..'||name!==path.basename(name)||/[\\/\0<>:"|?*]/.test(name))throw Error('Unsafe archive filename');
 const root=path.resolve(downloadRoot),destination=path.join(root,name);mkdirSync(root,{recursive:true});let temporary=null,ownsTemporary=false;
 const existing=async()=>{const actual=await inspectFile(destination);verify(actual,binding,headers,'Existing downloaded file has another binding; no overwrite');return {path:destination,...actual};};
 try{
  if(existsSync(destination))return await existing();
  if(!response.body)throw validationError('Archive response has no body',null,binding,headers);
  temporary=path.join(root,'.'+name+'.part-'+randomUUID());const digest=createHash('sha256');let size=0;
  const tap=new Transform({transform(bytes,_encoding,callback){digest.update(bytes);size+=bytes.length;callback(null,bytes);}}),output=createWriteStream(temporary,{flags:'wx'});output.once('open',()=>{ownsTemporary=true;});
  await pipeline(Readable.fromWeb(response.body),tap,output);const actual={sha256:digest.digest('hex'),size_bytes:size};verify(actual,binding,headers,'Downloaded archive bytes failed SHA/length verification');
  // Atomic no-overwrite publication of already-verified bytes. A competing cache wins.
  try{linkSync(temporary,destination);}catch(error){if(error?.code==='EEXIST')return await existing();throw error;}
  return {path:destination,...actual};
 }finally{
  if(ownsTemporary&&temporary&&existsSync(temporary))unlinkSync(temporary);
  // Fetch may have decompressed body bytes while preserving encoded transfer headers.
  // Only identity/no-encoding Content-Length is compared to decoded archive length.
  if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});
 }
}
