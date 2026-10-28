import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {createReleasePackageManifest,releasePackageJson,RELEASE_PACKAGE_PLATFORMS} from '../../lib/release-package-contract.mts';
import {resolvePublishingCopy} from '../../lib/publishing-copy.mts';
import {validateReleasePackageZip} from '../../lib/release-package-zip.mts';

const sha=b=>createHash('sha256').update(b).digest('hex');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
// A real, tiny ZIP containing synthetic bytes, never a production file.
export function syntheticReleaseZip(members){
 const local=[],central=[];let offset=0;
 for(const[name,bytes]of Object.entries(members)){
  const file=Buffer.from(name),data=Buffer.from(bytes),compressed=deflateRawSync(data),crc=crc32(data),l=Buffer.alloc(30),c=Buffer.alloc(46);
  l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(file.length,26);
  c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(file.length,28);c.writeUInt32LE(offset,42);
  local.push(l,file,compressed);central.push(c,file);offset+=l.length+file.length+compressed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(members).length,8);end.writeUInt16LE(Object.keys(members).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
export function syntheticReleaseAssets({job_id,plan,video,promotion,assets}){
 const platform_copies=Object.fromEntries(RELEASE_PACKAGE_PLATFORMS.map(platform=>{const copy=resolvePublishingCopy(promotion.cross_platform_description,platform);if(!copy.ok)throw Error('SYNTHETIC missing platform copy');return[platform,{title:copy.title,description:copy.description,tags:copy.tags}];}));
 const manifest=createReleasePackageManifest({job_id,...(plan.delivery_mode?{delivery_mode:plan.delivery_mode}:{}),binding:plan.binding,video:{site_archive_id:plan.base_video.site_archive_id,sha256:plan.base_video.sha256,size_bytes:plan.base_video.size_bytes},project_archive:plan.project_archive,files:Object.fromEntries(['cover_3_4','cover_4_3','promotion'].map(role=>[role,assets.files[role]])),promo_content_hash:assets.promoHash,platform_copies,release_policy:plan.release_policy});
 const members={'video.mp4':video,'cover_3_4.png':assets.bytes.cover_3_4,'cover_4_3.png':assets.bytes.cover_4_3,'promotion.txt':assets.bytes.promotion,'promotion.json':Buffer.from(JSON.stringify(promotion)),'publishing-policy.json':Buffer.from(releasePackageJson(plan.release_policy)),'release-manifest.json':Buffer.from(releasePackageJson(manifest))};
 const zip=syntheticReleaseZip(members);validateReleasePackageZip(zip,manifest);assets.bytes.complete_bundle=zip;assets.files.complete_bundle={sha256:sha(zip),size_bytes:zip.length,file_name:'release-package.zip',mime_type:'application/zip'};return{...assets,release_manifest:manifest,release_members:members};
}
