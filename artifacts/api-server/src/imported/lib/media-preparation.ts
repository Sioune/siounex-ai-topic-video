import {assertMediaScope} from './media-continuation';
import {db} from './store';
import {assertFinalDuration} from './final-media-contract';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';
import type {MediaPreparation} from './media-preparation-contract';
// Private working files may be prepared in parallel. This event never creates a
// video milestone, changes approval, claims an operation, or bypasses the cover gate.
export async function recordPreparation(id:string,value:MediaPreparation){
 const j=await getJob(id);await assertMediaScope(j,'video');if(id==='job_e13e8b19-aa0a-4840-abc9-333eefc91b05')throw new ProductionError('当前Claude任务由独立制作任务维护',409);
 if(j.status!=='approved'||j.approved_revision!==value.revision||j.revision!==value.revision||j.approved_hash!==value.script_hash||j.mode_epoch!==value.mode_epoch)throw new ProductionError('准备稿必须绑定当前已批准稿件和审核模式');
 if(value.schema!=='private-media-preparation-v1'||value.cost!==0||value.quality_approved!==false||value.publication!==false||value.voice_kind!=='ordinary-review'||!value.qa?.decoded||value.qa.listened!==false||value.qa.full_playback_verified!==false||!Number.isFinite(value.duration)||value.duration<3||value.duration>120)throw new ProductionError('仅接受零费用、未批准的普通配音私有准备稿',400);
 text(value.authorization_reference,1000);text(value.limits,4000);
 if(!Array.isArray(value.assets)||value.assets.length<2||value.assets.length>10||!value.assets.some(a=>a.node==='video')||!value.assets.some(a=>a.node==='cover'))throw new ProductionError('需真实视频与3:4封面Library归档',400);
 const roles=new Set();for(const a of value.assets){if(!/^[a-f0-9]{64}$/.test(a.sha256)||!/^libfile_[a-f0-9]+$/.test(a.library_file_id)||!/^file_[a-f0-9]+$/.test(a.file_id)||!Number.isInteger(a.version)||a.version<0||!Number.isInteger(a.size_bytes)||a.size_bytes<1||a.size_bytes>150000000||roles.has(a.node))throw new ProductionError('归档身份、哈希或文件角色无效',400);roles.add(a.node);text(a.node,40);text(a.file_name,300);}
 const choice=j.series?.current,binding=value.series_selection;if(binding){if(!choice||binding.id!==choice.id||binding.template_hash!==choice.template_hash||binding.seed!==choice.seed||!j.series?.choice_current)throw new ProductionError('准备稿系列选择已变化；不得把旧渲染绑定到新模板');text(binding.association_evidence,2000);}else if(choice)throw new ProductionError('已有系列选择，准备稿须带其真实绑定');
 const note=JSON.stringify(value);if(note.length>20000)throw new ProductionError('准备稿回执过大',400);const rid='media_preparation_'+await hash(JSON.stringify([id,value.revision,value.mode_epoch,note]));
 const prior=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{note:string}>();if(prior){if(prior.note!==note)throw new ProductionError('准备稿记录冲突');return {job:await getJob(id),replayed:true};}
 assertFinalDuration(value.qa.final_duration,value.assets.find(a=>a.node==='video')!.sha256);
 const guard=binding?` AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND json_extract(value,'$.current.id')=? AND json_extract(value,'$.current.template_hash')=? AND json_extract(value,'$.current.seed')=?)`:'';
 const r=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,approved_hash,'media_preparation',?,'private-local-renderer',? FROM production_jobs WHERE id=? AND revision=? AND approved_revision=? AND approved_hash=? AND mode_epoch=? AND status='approved'${guard} ON CONFLICT(id) DO NOTHING`).bind(rid,note,new Date().toISOString(),id,value.revision,value.revision,value.script_hash,value.mode_epoch,...(binding?['series_selection_v1:'+id,binding.id,binding.template_hash,binding.seed]:[])).run();
 if(!r.meta.changes&&!(await db().prepare('SELECT id FROM production_reviews WHERE id=?').bind(rid).first()))throw new ProductionError('准备稿版本已变化');return {job:await getJob(id),preparation_id:rid,quality_approval:false,formal_video_node_started:false};
}
