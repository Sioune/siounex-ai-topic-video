import {db} from './store';
import {logicalData} from './data-logical.mjs';
import {readPublicationCollections} from './publication-collections';
import {getSiteArchiveMetadata} from './site-file-archive';
import {nativeReceiptSource,nativeReceiptProjection} from './publishing-native-receipts.mts';
import type {PublishingDashboard,NativePublishingReceipt} from './publishing-contract.mts';
/** Read-only joining of the normal owner registration and its existing collection tasks. */
export async function readNativePublishingReceipts(owner:string,dashboard:PublishingDashboard){
 const posts=dashboard.publications.filter(p=>p.platform==='wechat_channels'),receipts:NativePublishingReceipt[]=[],issues:{browser_post_id:string;job_id:string;reason:string}[]=[];
 if(!posts.length)return {native_receipts:receipts,native_receipt_issues:issues};
 const [saved,{collections}]=await Promise.all([db().prepare('SELECT * FROM production_data_videos WHERE owner_id=?').bind(owner).all<{id:string;[key:string]:unknown}>(),readPublicationCollections(owner)]);
 const lineage=logicalData(saved.results,[],[]);
 // Independent metadata checks are bounded to avoid a burst of archive reads.
 // Collect each batch in input order, including failures, as in the serial path.
 for(let i=0;i<posts.length;i+=3){const batch=await Promise.all(posts.slice(i,i+3).map(async post=>{const reserve=dashboard.reserve_queue.find(r=>r.id===post.release_id);if(!reserve)return {};
  const candidates=lineage.current_videos.filter(row=>nativeReceiptSource(row,reserve.binding));
  if(candidates.length>1)return {issue:{browser_post_id:post.id,job_id:reserve.job_id,reason:'同一正式版本有多项原生登记，需核对原回执；浏览器状态保留。'}};
  const row=candidates[0];if(!row)return {};
  try{const archive=await getSiteArchiveMetadata(reserve.job_id,reserve.binding.site_archive_id,owner),receipt=nativeReceiptProjection(post,reserve.binding,row,lineage.revision_roots[row.id],archive,collections);return receipt?{receipt}:{issue:{browser_post_id:post.id,job_id:reserve.job_id,reason:'原生登记与本时段正式归档版本绑定未通过核对。'}};}
  catch{return {issue:{browser_post_id:post.id,job_id:reserve.job_id,reason:'原生登记已找到，正式归档绑定暂未读取成功；保留原记录，稍后重新读取。'}};}
 }));for(const result of batch){if(result.receipt)receipts.push(result.receipt);if(result.issue)issues.push(result.issue);}}
 return {native_receipts:receipts,native_receipt_issues:issues};
}
