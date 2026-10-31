/** An unchanged approved cover fitted to a platform slot. No new editorial image. */
export const COVER_FIT_ALGORITHM='contain-pad-16x9@1';
export type CoverAdaptation={schema:'publishing-cover-adaptation-v1';asset_id:string;package_id:string;platform:'bilibili';algorithm:typeof COVER_FIT_ALGORITHM;source:{role:'cover_4_3';site_archive_id:string;sha256:string;size_bytes:number;width:number;height:number};file:{file:string;sha256:string;size_bytes:number;width:1920;height:1080};content_rect:{x:number;y:number;width:number;height:number};background:'#101827';source_pixels_retained:true;no_new_editorial_content:true;local_sha256_verified:true;visual_check_note:string;evidence_reference:string;observed_at:string;storage:'owner-local-executor';server_archived_bytes:false};
type Obj=Record<string,unknown>;
function fail(message:string):never{throw Object.assign(Error(message),{status:400});}
function object(v:unknown,fields:string[]):Obj{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k)))fail('封面适配包含无效字段');return v as Obj;}
function text(v:unknown,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)fail('封面适配缺少文本证据');return v.trim();}
function sha(v:unknown){const s=text(v,64);if(!/^[a-f0-9]{64}$/.test(s))fail('封面适配SHA无效');return s;}
function positive(v:unknown,max=30000000){if(!Number.isSafeInteger(v)||Number(v)<=0||Number(v)>max)fail('封面适配规格无效');return Number(v);}
export function coverFitGeometry(width:number,height:number){const scale=Math.min(1920/width,1080/height),w=Math.round(width*scale),h=Math.round(height*scale);return {x:Math.floor((1920-w)/2),y:Math.floor((1080-h)/2),width:w,height:h};}
export function validateCoverAdaptation(value:unknown,approved:{role:string;site_archive_id:string;sha256:string;size_bytes:number}){
 const b=object(value,['algorithm','source','file','content_rect','background','source_pixels_retained','no_new_editorial_content','local_sha256_verified','visual_check_note','evidence_reference','observed_at']),s=object(b.source,['role','site_archive_id','sha256','size_bytes','width','height']),f=object(b.file,['file','sha256','size_bytes','width','height']);
 if(b.algorithm!==COVER_FIT_ALGORITHM||b.background!=='#101827'||b.source_pixels_retained!==true||b.no_new_editorial_content!==true||b.local_sha256_verified!==true)fail('只允许完整保留已审封面的等比居中适配，不重新作图或裁切');
 if(s.role!=='cover_4_3'||s.role!==approved.role||s.site_archive_id!==approved.site_archive_id||sha(s.sha256)!==approved.sha256||s.size_bytes!==approved.size_bytes)fail('适配必须来自本冻结包当前已审4:3封面');
 const width=positive(s.width,16384),height=positive(s.height,16384);if(width*3!==height*4)fail('原封面必须保持真实4:3尺寸');
 const file=text(f.file,1500);if(!/^(?:[A-Za-z]:[\\/]|\/)/.test(file)||/(?:^|[\\/])\.\.(?:[\\/]|$)|[\r\n\0]/.test(file)||!file.toLowerCase().endsWith('.png')||f.width!==1920||f.height!==1080)fail('适配文件须为本机1920×1080 PNG');
 const rect=object(b.content_rect,['x','y','width','height']),expected=coverFitGeometry(width,height);if(Object.keys(expected).some(k=>rect[k]!==expected[k as keyof typeof expected]))fail('适配必须完整居中，不能裁掉标题、主体或品牌');
 const observed=text(b.observed_at,100);if(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(observed)||!Number.isFinite(Date.parse(observed))||Date.parse(observed)>Date.now()+120000)fail('封面适配须保存实际核验时间');
 return {algorithm:COVER_FIT_ALGORITHM as typeof COVER_FIT_ALGORITHM,source:{...approved,role:'cover_4_3' as const,width,height},file:{file,sha256:sha(f.sha256),size_bytes:positive(f.size_bytes),width:1920 as const,height:1080 as const},content_rect:expected,background:'#101827' as const,source_pixels_retained:true as const,no_new_editorial_content:true as const,local_sha256_verified:true as const,visual_check_note:text(b.visual_check_note,4000),evidence_reference:text(b.evidence_reference),observed_at:observed};
}
export function coverAdaptationIdentity(a:CoverAdaptation){return {asset_id:a.asset_id,algorithm:a.algorithm,source:a.source,sha256:a.file.sha256,size_bytes:a.file.size_bytes,width:a.file.width,height:a.file.height,content_rect:a.content_rect,background:a.background};}
