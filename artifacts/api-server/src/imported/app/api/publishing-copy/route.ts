import {identity,json} from '@/lib/api';
import {ProductionError,text} from '@/lib/production-contract';
import {currentPublishingBinding} from '@/lib/publishing';
import {platformCopyReview} from '@/lib/publishing-copy-review';
import {readSiteArchiveFile} from '@/lib/site-file-archive';
import {promoZip} from '@/lib/promo-zip.mts';
export const dynamic='force-dynamic';
const labels:Record<string,string>={douyin:'抖音',wechat_channels:'微信视频号',bilibili:'哔哩哔哩',kuaishou:'快手',xiaohongshu:'小红书'};
export async function GET(req:Request){
 const owner=await identity(req);if(!owner)return json({error:'请登录本人工作区'},401);
 try{
  const url=new URL(req.url),jobId=text(url.searchParams.get('job'),100),binding=await currentPublishingBinding(owner,jobId),review=await platformCopyReview(owner,binding);
  if(!review||review.status==='source_changed')throw new ProductionError('当前平台稿或来源绑定不可用',409);
  if(url.searchParams.get('hash')!==review.copy_hash)throw new ProductionError('稿件版本已变化，请刷新审阅卡片后下载',409);
  const enc=new TextEncoder(),status=review.status==='revise'?'有修改意见':'可使用',files=Object.entries(review.platforms).map(([p,c])=>({name:(labels[p]||p)+'_发布文案.txt',bytes:enc.encode('标题\n'+c.title+'\n\n简介\n'+c.description+'\n\n话题标签\n'+c.tags.map(t=>'#'+t).join(' ')+'\n')}));
  const covers=[];
  for(const m of binding.materials.filter(m=>m.role!=='promotion')){
   const result=await readSiteArchiveFile(jobId,m.site_archive_id,owner),bytes=new Uint8Array(await new Response(result.body).arrayBuffer()),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==m.size_bytes||digest!==m.sha256)throw new ProductionError('封面实际字节与本版归档绑定不符',409);
   files.push({name:m.role==='cover_3_4'?'封面_3比4.png':'封面_4比3.png',bytes});covers.push(m);
  }
  files.push({name:'编辑依据与审核状态_不作为发布正文.json',bytes:enc.encode(JSON.stringify({schema:'platform-promotion-download-v1',status,copy_hash:review.copy_hash,strategy_version:review.strategy_version,reviewed_at:review.reviewed_at,binding,covers,approaches:Object.fromEntries(Object.entries(review.platforms).map(([p,c])=>[p,c.approach])),publication:false,contains_video:false,wechat_access:'security_blocked',xiaohongshu_scope:'copy-only; no additional automatic destination'},null,2))});
  if(JSON.stringify(binding)!==JSON.stringify(await currentPublishingBinding(owner,jobId)))throw new ProductionError('下载期间成品绑定已变化，请刷新后下载',409);
  const bytes=promoZip(files);return new Response(bytes as unknown as BodyInit,{headers:{'Content-Type':'application/zip','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('五平台宣发包_'+status+'_'+jobId+'.zip'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return json({error:e instanceof ProductionError?e.message:'宣发包下载未完成，请保留当前审核状态后重试'},e instanceof ProductionError?e.status:503);}
}
