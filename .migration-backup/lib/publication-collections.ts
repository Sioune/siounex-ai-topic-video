import {db} from './store';
import {hash, ProductionError, text} from './production-contract';
import {logicalData} from './data-logical.mjs';
import {effectiveSamples} from './data-details.mjs';
import {metrics, samplingWindow} from './data-contract.mjs';
import {clickedPublicationDetails,nativePublicationInterval,NATIVE_COLLECTION_ANCHOR_NOTE} from './publication-details.mts';
import {COLLECTION_TARGETS, type PublicationCollection, type DueCollectionReminder} from './publication-collection-contract.mts';
import {validDelayedObservation} from './publishing-collection-policy.mts';

type Row = {id:string; [key:string]:unknown};
type CollectionRow = Row & {owner_id:string;video_id:string;job_id:string|null;target_hours:24|48;sample_kind:'single_t24'|'single_t48';initial_published_at:string;generated_at:string|null;generated_for_due_at:string|null;generated_request_id:string|null;created_at:string};
const now = () => new Date().toISOString();
export function optionalCollectionTime(value:unknown):string|null {
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new ProductionError('请填写带时区的真实时间，未知可留空',400);
 return new Date(value).toISOString();
}

/** Called in the same batch as the immutable publication insert. */
export async function collectionInsertStatements(owner:string,videoId:string,canonicalVideoId=videoId,jobId?:string) {
 return Promise.all(COLLECTION_TARGETS.map(async target=>db().prepare(`INSERT INTO production_data_collections(id,owner_id,video_id,job_id,target_hours,sample_kind,initial_published_at,created_at) SELECT ?,?,?,COALESCE(?,job_id),?,?,published_at,? FROM production_data_videos WHERE id=? AND published_at IS NOT NULL AND (owner_id=? OR owner_id IS NULL) AND EXISTS(SELECT 1 FROM production_data_videos original WHERE original.id=? AND (original.owner_id=? OR original.owner_id IS NULL)) ON CONFLICT(owner_id,video_id,target_hours) DO NOTHING`).bind('dc_'+await hash(owner+'\n'+videoId+'\n'+target),owner,videoId,jobId||null,target,target===24?'single_t24':'single_t48',now(),canonicalVideoId,owner,videoId,owner)));
}

async function collectionState(owner:string) {
 const result=await db().batch([
  db().prepare('SELECT * FROM production_data_collections WHERE owner_id=? ORDER BY created_at DESC,id').bind(owner),
  db().prepare('SELECT * FROM production_data_videos WHERE owner_id=? OR owner_id IS NULL').bind(owner),
  db().prepare('SELECT s.* FROM production_data_samples s JOIN production_data_videos v ON v.id=s.video_id WHERE v.owner_id=? OR v.owner_id IS NULL').bind(owner),
  db().prepare('SELECT a.collection_id,a.captured_at AS attachment_captured_at,a.attached_at,e.id,e.file_name,e.content_type,e.sha256,e.size_bytes,e.captured_at FROM production_data_collection_evidence a JOIN production_data_collections c ON c.id=a.collection_id JOIN production_data_evidence e ON e.id=a.evidence_id WHERE c.owner_id=? AND a.owner_id=? AND e.owner_id=? ORDER BY a.attached_at,e.id').bind(owner,owner,owner)
 ]);
 const rows=result[0].results as CollectionRow[],videos=result[1].results as Row[],rawSamples=result[2].results as Row[],attachments=result[3].results as Row[];
 const lineage=logicalData(videos,rawSamples,[]),samples=effectiveSamples(lineage.canonical_samples as Row[]);
 const current=new Map(lineage.current_videos.map(v=>[lineage.revision_roots[v.id],v]));
 const clock=Date.now();
 const collections:PublicationCollection[]=rows.map(row=>{
  const v=current.get(lineage.revision_roots[row.video_id])||videos.find(v=>v.id===row.video_id);
  const published=typeof v?.published_at==='string'&&Number.isFinite(Date.parse(v.published_at))?v.published_at:null;
  const due=published?new Date(Date.parse(published)+row.target_hours*3600000).toISOString():null;
  const candidates=samples.filter(s=>s.video_id===v?.id&&!s.relation_id&&(s.sample_kind===row.sample_kind||s.sample_kind==='single_snapshot')&&typeof s.observed_at==='string'&&Date.parse(s.observed_at)<=clock);
  const sampled=candidates.filter(s=>{
   // A target-labelled late sample completes the operational task. Only on-time snapshots
   // can stand in for a target; strict cross-video comparisons retain samplingWindow.
   if(!published||!due||!(s.sample_kind===row.sample_kind?validDelayedObservation(due,String(s.observed_at),new Date(clock).toISOString()):samplingWindow(published,String(s.observed_at),row.target_hours).comparable))return false;
   try{return Object.values(metrics(typeof s.metrics==='string'?JSON.parse(s.metrics):s.metrics)).some(x=>x!==null);}catch{return false;}
  });
  const evidence=attachments.filter(a=>a.collection_id===row.id).map(a=>({id:a.id,file_name:String(a.file_name),content_type:String(a.content_type),sha256:String(a.sha256),size_bytes:Number(a.size_bytes),captured_at:(a.attachment_captured_at||a.captured_at||null) as string|null,attached_at:String(a.attached_at),url:'/api/data-center?evidence='+encodeURIComponent(a.id)}));
  const source=clickedPublicationDetails(v?.publication_source),status=sampled.length?'sampled':evidence.length?'uploaded':due&&Date.parse(due)<=clock?'due':'scheduled';
  const interval=nativePublicationInterval(v?.publication_source,published);
  return {id:row.id,video_id:v?.id||row.video_id,original_video_id:row.video_id,job_id:row.job_id,title:String(v?.title||'作品记录'),platform:source?.platform||'unspecified',published_at:published,target_hours:row.target_hours,sample_kind:row.sample_kind,due_at:due,status,evidence,sample_ids:sampled.map(s=>s.id),generated_at:due===row.generated_for_due_at?row.generated_at:null,upload_url:'/data/upload?collection='+encodeURIComponent(row.id),...(interval?{native_observation:interval,collection_anchor_note:NATIVE_COLLECTION_ANCHOR_NOTE}: {})};
 });
 return {rows,collections,lineage,videos,rawSamples};
}

export async function readPublicationCollections(owner:string,filter:{id?:string;video_id?:string;job_id?:string}={}) {
 const state=await collectionState(owner);
 let collections=state.collections;
 if(filter.id){collections=collections.filter(c=>c.id===filter.id);if(!collections.length)throw new ProductionError('采集任务不存在或无权读取',404);}
 if(filter.video_id){const root=state.lineage.revision_roots[filter.video_id];if(!root)throw new ProductionError('作品不存在或无权读取',404);collections=collections.filter(c=>state.lineage.revision_roots[c.original_video_id]===root);}
 if(filter.job_id)collections=collections.filter(c=>c.job_id===filter.job_id);
 return {collections};
}

export async function attachCollectionEvidence(owner:string,b:Record<string,unknown>) {
 const id=text(b.collection_id,100),evidenceId=text(b.evidence_id,100),captured=optionalCollectionTime(b.captured_at);
 const collection=await db().prepare('SELECT id FROM production_data_collections WHERE id=? AND owner_id=?').bind(id,owner).first();
 if(!collection)throw new ProductionError('采集任务不存在或无权使用',404);
 const evidence=await db().prepare('SELECT id FROM production_data_evidence WHERE id=? AND owner_id=?').bind(evidenceId,owner).first();
 if(!evidence)throw new ProductionError('截图不存在或不属于本人',404);
 const inserted=await db().prepare(`INSERT INTO production_data_collection_evidence(collection_id,evidence_id,owner_id,captured_at,attached_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM production_data_collections WHERE id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM production_data_evidence WHERE id=? AND owner_id=?) ON CONFLICT(collection_id,evidence_id) DO NOTHING`).bind(id,evidenceId,owner,captured,now(),id,owner,evidenceId,owner).run();
 return {...await readPublicationCollections(owner,{id}),replayed:!inserted.meta.changes};
}

export async function readDueCollectionReminders(owner:string):Promise<{reminders:DueCollectionReminder[]}> {
 const {collections}=await readPublicationCollections(owner);
 const reminders=await Promise.all(collections.filter(c=>c.status==='due'&&c.due_at&&!c.generated_at).map(async c=>{
  const id='dcr_'+await hash(c.id+'\n'+c.due_at);
  return {id,reminder_id:id,collection_id:c.id,video_id:c.video_id,job_id:c.job_id,title:c.title,platform:c.platform,due_at:c.due_at!,target_hours:c.target_hours,sample_kind:c.sample_kind,upload_url:c.upload_url};
 }));
 return {reminders:reminders.sort((a,b)=>a.due_at.localeCompare(b.due_at)||a.id.localeCompare(b.id))};
}

/** Records reminder generation only. It never asserts external notification delivery. */
export async function markCollectionRemindersGenerated(owner:string,b:{reminder_ids:unknown;request_id:unknown}) {
 const request=text(b.request_id,120);
 if(!Array.isArray(b.reminder_ids)||!b.reminder_ids.length||b.reminder_ids.length>100)throw new ProductionError('请选择1至100条实际到期提醒',400);
 const ids=[...new Set(b.reminder_ids.map(id=>text(id,100)))];
 const {rows,collections,rawSamples}=await collectionState(owner),selected:PublicationCollection[]=[];
 for(const id of ids){
  let found:PublicationCollection|undefined;
  for(const c of collections)if(c.due_at&&id==='dcr_'+await hash(c.id+'\n'+c.due_at)){found=c;break;}
  if(!found||!found.due_at||Date.parse(found.due_at)>Date.now()||!['due'].includes(found.status))throw new ProductionError('提醒不存在、尚未到期、已上传或已采样；未标记生成',409);
  selected.push(found);
 }
 const generated=now();
 const sampleSnapshot=JSON.stringify([...rawSamples].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(s=>({id:s.id,record_hash:s.record_hash})));
 const statements=selected.filter(c=>!c.generated_at).map(c=>{
  const row=rows.find(r=>r.id===c.id)!;
  return db().prepare(`UPDATE production_data_collections SET generated_at=?,generated_for_due_at=?,generated_request_id=? WHERE id=? AND owner_id=? AND COALESCE(generated_at,'')=? AND COALESCE(generated_for_due_at,'')=? AND COALESCE(generated_request_id,'')=? AND NOT EXISTS(SELECT 1 FROM production_data_collection_evidence WHERE collection_id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM production_data_videos WHERE id=? AND published_at=? AND (owner_id=? OR owner_id IS NULL)) AND NOT EXISTS(SELECT 1 FROM production_data_videos WHERE supersedes_id=? AND (owner_id=? OR owner_id IS NULL)) AND (SELECT COALESCE(json_group_array(json_object('id',s.id,'record_hash',s.record_hash)),'[]') FROM (SELECT sample.id,sample.record_hash FROM production_data_samples sample JOIN production_data_videos v ON v.id=sample.video_id WHERE v.owner_id=? OR v.owner_id IS NULL ORDER BY sample.id) s)=?`).bind(generated,c.due_at,request,c.id,owner,row.generated_at||'',row.generated_for_due_at||'',row.generated_request_id||'',c.id,owner,c.video_id,c.published_at,owner,c.video_id,owner,owner,sampleSnapshot);
 });
 // Each row is protected by its prior generation state and current publication anchor.
 const results=statements.length?await db().batch(statements):[],after=await collectionState(owner);
 for(const c of selected){const row=after.rows.find(r=>r.id===c.id);if(row?.generated_for_due_at!==c.due_at||!row.generated_at)throw new ProductionError('提醒状态并发变化；请读取当前状态，未重复生成',409);}
 return {reminder_ids:ids,generated_at:after.rows.find(r=>r.id===selected[0].id)?.generated_at||generated,replayed:results.every(r=>!r.meta.changes),notification_delivery:'not_asserted' as const};
}

function icsText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function icsTime(value:string){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
function folded(line:string){let rest=line,result='';while(new TextEncoder().encode(rest).length>73){let cut=0,size=0;for(const character of rest){const length=new TextEncoder().encode(character).length;if(size+length>72)break;size+=length;cut+=character.length;}result+=rest.slice(0,cut)+'\r\n ';rest=rest.slice(cut);}return result+rest;}
export async function collectionCalendar(owner:string,videoId:string,origin:string) {
 const {collections}=await readPublicationCollections(owner,{video_id:videoId});
 if(collections.length!==2||collections.some(c=>!c.due_at))throw new ProductionError('尚无可导入的24/48小时采集计划',409);
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Topic Studio//Private Collections//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const c of collections){const url=new URL(c.upload_url,origin).href,description='请在手机打开上传入口，上传平台后台原始截图。上传后仍须核对指标。'+(c.collection_anchor_note?c.collection_anchor_note:'')+url;
  lines.push('BEGIN:VEVENT','UID:'+c.id+'@topic-studio','DTSTAMP:'+icsTime(now()),'DTSTART:'+icsTime(c.due_at!),'DTEND:'+icsTime(new Date(Date.parse(c.due_at!)+15*60000).toISOString()),'SUMMARY:'+icsText(c.title+' · T+'+c.target_hours+'数据采集'),'DESCRIPTION:'+icsText(description),'URL:'+url,'STATUS:CONFIRMED','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M','DESCRIPTION:'+icsText('上传「'+c.title+'」T+'+c.target_hours+'数据截图'),'END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(folded).join('\r\n')+'\r\n';
}
