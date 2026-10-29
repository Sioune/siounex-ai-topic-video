import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {RELEASE_PACKAGE_MEMBERS,validateReleasePackageManifest,validateReleasePackageMembers,releasePackageMemberExpectations} from './release-package-contract.mts';
function fail(code:string):never{throw Object.assign(Error(code),{code});}

/** Independently inspect this small release ZIP using only built-in modules.
 * ZIP64, encryption, duplicate/extra members and oversized expansions are refused.
 * Every uncompressed byte is hashed; a client inventory alone is insufficient.
 */
export function validateReleasePackageZip(value:Uint8Array,manifestValue:unknown){
 const manifest=validateReleasePackageManifest(manifestValue),bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength),limit=50*1024*1024;
 if(bytes.length<22||bytes.length>=limit)fail('RELEASE_PACKAGE_ZIP_CAPACITY');let end=-1;
 for(let n=bytes.length-22;n>=Math.max(0,bytes.length-65557);n--)if(bytes.readUInt32LE(n)===0x06054b50&&n+22+bytes.readUInt16LE(n+20)===bytes.length){end=n;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==RELEASE_PACKAGE_MEMBERS.length||bytes.readUInt16LE(end+10)!==RELEASE_PACKAGE_MEMBERS.length)fail('RELEASE_PACKAGE_ZIP_DIRECTORY');
 const offset=bytes.readUInt32LE(end+16),directorySize=bytes.readUInt32LE(end+12);if(offset+directorySize!==end)fail('RELEASE_PACKAGE_ZIP_DIRECTORY');let cursor=offset,total=0;const members:{file:string;sha256:string;size_bytes:number}[]=[],seen=new Set<string>(),expected=releasePackageMemberExpectations(manifest),ranges:{start:number;end:number}[]=[];
 for(let i=0;i<RELEASE_PACKAGE_MEMBERS.length;i++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)fail('RELEASE_PACKAGE_ZIP_DIRECTORY');const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42),next=cursor+46+nameLength+extra+comment;
  if(next>end||flags&1||![0,8].includes(method)||bytes.readUInt16LE(cursor+34))fail('RELEASE_PACKAGE_ZIP_DIRECTORY');const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8'),wanted=expected[name as keyof typeof expected];
  if(!wanted||seen.has(name)||size<1||size>(name==='promotion.json'?100000:limit)||wanted.size_bytes!==null&&size!==wanted.size_bytes||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)fail('RELEASE_PACKAGE_ZIP_MEMBERS_CHANGED');
  const localName=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localName+localExtra,stop=start+compressed;if(stop>offset||bytes.subarray(local+30,local+30+localName).toString('utf8')!==name||ranges.some(r=>local<r.end&&stop>r.start))fail('RELEASE_PACKAGE_ZIP_MEMBERS_CHANGED');ranges.push({start:local,end:stop});total+=size;if(total>=limit)fail('RELEASE_PACKAGE_ZIP_CAPACITY');
  let raw:Buffer;try{raw=method===0?bytes.subarray(start,stop):inflateRawSync(bytes.subarray(start,stop),{maxOutputLength:size});}catch{fail('RELEASE_PACKAGE_ZIP_DECODE_FAILED');}
  if(raw.length!==size||createHash('sha256').update(raw).digest('hex')!==wanted.sha256)fail('RELEASE_PACKAGE_ZIP_BYTES_CHANGED');members.push({file:name,sha256:wanted.sha256,size_bytes:size});seen.add(name);cursor=next;
 }
 if(cursor!==end)fail('RELEASE_PACKAGE_ZIP_DIRECTORY');validateReleasePackageMembers(manifest,members);return{verified:true as const,file_count:members.length,files:members};
}
