import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {makeCoverThumbnail} from './cover-thumbnail.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Runs separately from production work; no archive or review state is changed.
export async function backfillCoverThumbnail({id,site_archive_id,source_sha256,role},call){
 if(!/^job_[a-f0-9-]+$/.test(id)||!/^sitefile_[a-f0-9]{64}$/.test(site_archive_id)||!/^[a-f0-9]{64}$/.test(source_sha256)||!['cover_3_4','cover_4_3'].includes(role))throw Error('THUMBNAIL_BINDING_INVALID');
 const request={id,site_archive_id,source_sha256,role};let count=1,total=null,chunkSize=null;const parts=[];
 for(let part=0;part<count;part++){
  const response=await call({action:'site_cover_source_part',...request,part,chunk_size:512*1024});if(response.status!==200)throw Error('THUMBNAIL_SOURCE_READ_FAILED');const v=response.body;const receivedSize=v.chunk_size===undefined?128*1024:v.chunk_size;
  if(v.source_sha256!==source_sha256||v.role!==role||v.part!==part||![128*1024,512*1024].includes(receivedSize)||!Number.isSafeInteger(v.part_count)||v.part_count<1||v.part_count>80||!Number.isSafeInteger(v.size_bytes)||v.size_bytes<24||v.size_bytes>=10*1024*1024||v.part_count!==Math.ceil(v.size_bytes/receivedSize)||total!==null&&(v.part_count!==count||v.size_bytes!==total||receivedSize!==chunkSize))throw Error('THUMBNAIL_SOURCE_BINDING_CHANGED');
  count=v.part_count;total=v.size_bytes;chunkSize=receivedSize;const bytes=Buffer.from(v.chunk_base64,'base64');if(hash(bytes)!==v.chunk_sha256||bytes.length!==Math.min(chunkSize,total-part*chunkSize))throw Error('THUMBNAIL_SOURCE_PART_CHANGED');parts.push(bytes);
 }
 const source=Buffer.concat(parts);if(source.length!==total||hash(source)!==source_sha256)throw Error('THUMBNAIL_SOURCE_CHANGED');const image=makeCoverThumbnail(source,source_sha256);
 const response=await call({action:'site_cover_thumbnail_put',...request,thumbnail_base64:image.bytes.toString('base64')});if(response.status!==200||response.body?.source_sha256!==source_sha256)throw Error('THUMBNAIL_SAVE_UNCONFIRMED');return{source_sha256,thumbnail_sha256:response.body.thumbnail_sha256,reused:!!response.body.reused};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [id,site_archive_id,source_sha256,role]=process.argv.slice(2);
 const {createNativeProductionTransport}=await import('./native-production-transport.mjs');
 const transport=createNativeProductionTransport();
 try{const result=await backfillCoverThumbnail({id,site_archive_id,source_sha256,role},body=>transport.call(body));process.stdout.write(JSON.stringify(result)+'\n');}
 finally{await transport.close();}
}
