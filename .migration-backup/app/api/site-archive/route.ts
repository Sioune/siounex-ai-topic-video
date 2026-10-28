import {getSiteArchiveMetadata,openSiteArchiveForRead} from '@/lib/site-file-archive';
import {requirePrivateMediaIdentity,requirePrivateMediaOwner} from '@/lib/private-media-access';
import {ProductionError,text} from '@/lib/production-contract';
import {warehouseBrandCover} from '@/lib/cover-branding.mts';
import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';

const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function byteRange(value:string,size:number):{offset:number;length:number}|null{
 const match=/^bytes=(\d*)-(\d*)$/i.exec(value.trim());
 if(!match||!match[1]&&!match[2])return null;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;const length=Math.min(suffix,size);return{offset:size-length,length};}
 const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
 return{offset:start,length:Math.min(end,size-1)-start+1};
}
const encodedName=(name:string)=>encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
async function serve(req:Request,head:boolean){
 try{
  const owner=await requirePrivateMediaIdentity(req),url=new URL(req.url),id=text(url.searchParams.get('id'),100),sid=text(url.searchParams.get('archive'),100);
  await requirePrivateMediaOwner(id,owner);
  const branded=warehouseBrandCover(id,sid);
  if(branded&&sid===branded.file.site_archive_id){
   const {file,migration}=branded,source=await getSiteArchiveMetadata(id,file.source_archive_id,owner),binding=migration.original_binding;
   if(source.status!=='confirmed'||source.file.sha256!==file.source_sha256||source.file.role!==file.role||source.binding.revision!==binding.revision||source.binding.script_hash!==binding.script_hash||source.binding.mode_epoch!==binding.mode_epoch||source.binding.contract_hash!==binding.contract_hash)throw new ProductionError('品牌封面与已审原件绑定不一致',409);
   const headers={...privateHeaders,'Content-Type':'image/png','Content-Length':String(file.size_bytes),'X-Asset-SHA256':file.sha256,'Content-Disposition':(url.searchParams.get('download')==='1'?'attachment':'inline')+"; filename*=UTF-8''"+encodedName(file.file_name)};
   if(head)return new Response(null,{headers});
   const assets=(env as unknown as {ASSETS?:{fetch:(r:Request)=>Promise<Response>}}).ASSETS;
   // The fallback is an ordinary same-Site asset read under the already
   // authenticated request. Never forward identity or credentials elsewhere.
   const assetHeaders=new Headers(req.headers);for(const key of ['range','if-none-match','if-modified-since','host'])assetHeaders.delete(key);
   const assetRequest=new Request(new URL(file.asset_path,req.url),{headers:assetHeaders,redirect:'error'});
   const result=assets?await assets.fetch(assetRequest):await fetch(assetRequest),bytes=await result.arrayBuffer();
   if(!result.ok||bytes.byteLength!==file.size_bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==file.sha256)throw new ProductionError('品牌封面文件校验失败',503);
   return new Response(bytes,{headers});
  }
  const opened=await openSiteArchiveForRead(id,sid,owner),archive=opened.archive,file=archive.file,size=file.size_bytes;
  const disposition=file.mime_type==='application/zip'||file.mime_type==='text/plain'||file.mime_type==='image/png'&&url.searchParams.get('download')==='1'?'attachment':'inline';
  const headers={...privateHeaders,'Content-Type':file.mime_type+(file.mime_type==='text/plain'?'; charset=utf-8':''),'Content-Disposition':disposition+"; filename*=UTF-8''"+encodedName(file.file_name),'Content-Length':String(size),'Accept-Ranges':'bytes','X-Asset-SHA256':file.sha256};
  const rangeHeader=req.headers.get('range');let range:{offset:number;length:number}|undefined;
  if(rangeHeader!==null){const parsed=byteRange(rangeHeader,size);if(!parsed)return new Response(null,{status:416,headers:{...privateHeaders,'Accept-Ranges':'bytes','Content-Range':'bytes */'+size,'Content-Length':'0'}});range=parsed;}
  const responseHeaders=range?{...headers,'Content-Length':String(range.length),'Content-Range':`bytes ${range.offset}-${range.offset+range.length-1}/${size}`}:headers;
  if(head)return new Response(null,{status:range?206:200,headers:responseHeaders});
  // Metadata and stream share this request's already-validated owner/manifest.
  const result=await opened.read(range);
  if(result.archive.site_archive_id!==archive.site_archive_id||result.archive.file.sha256!==file.sha256||result.archive.file.size_bytes!==size)throw new ProductionError('归档文件绑定已变，请重新读取',409);
  return new Response(result.body,{status:range?206:200,headers:responseHeaders});
 }catch(error){const status=error instanceof ProductionError?error.status:503;return Response.json({error:error instanceof ProductionError?error.message:'私有归档暂不可用'}, {status,headers:privateHeaders});}
}
export const GET=(req:Request)=>serve(req,false);
export const HEAD=(req:Request)=>serve(req,true);
