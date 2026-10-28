export type ScriptLock={schema:'owner-script-lock-v1';text:string;sha256:string;source_revision:number;source_hash:string;mode_epoch:number;contract_hash:string;quality_approval:false;media_authorization:false;publication_authorization:false};
export function exactScript(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>12000)throw Error('完整原稿不能为空或超过12000字');return value;}
// Each character, including whitespace and punctuation, is retained in order.
export function lockSegments(text:string){exactScript(text);const out:string[]=[];let start=0;for(let i=0;i<text.length;i++){if(/[。！？!?\n]/u.test(text[i])){while(i+1<text.length&&/[。！？!?\n”’」』]/u.test(text[i+1]))i++;out.push(text.slice(start,i+1));start=i+1;}}if(start<text.length)out.push(text.slice(start));if(out.length>80)throw Error('原稿分段超过80段，请先在站内修改');return out;}
export function activeScriptLock(job:{revision:number;mode_epoch:number;contract_hash:string;drafts?:{revision:number;content_hash:string;content?:string}[];reviews?:Record<string,unknown>[]}){
 for(const q of job.reviews||[]){if(q.decision!=='script_feedback_rework')continue;const binding=JSON.parse(String(q.note));if(binding.source_revision<job.revision||binding.mode_epoch!==job.mode_epoch)continue;
  const opinion=job.reviews?.find(r=>r.id===binding.feedback_id&&r.decision==='script_feedback');const standalone=job.reviews?.find(r=>r.decision==='script_lock'&&JSON.parse(String(r.note)).queue_id===String(q.id));const lock:ScriptLock|undefined=standalone?JSON.parse(String(standalone.note)):opinion&&JSON.parse(String(opinion.note)).script_lock;if(!lock)continue;
  const d=job.drafts?.find(d=>d.revision===job.revision);if(lock.schema!=='owner-script-lock-v1'||lock.source_revision!==job.revision||lock.source_hash!==d?.content_hash||lock.mode_epoch!==job.mode_epoch||lock.contract_hash!==job.contract_hash||(standalone?JSON.parse(String(standalone.note)).feedback_id!==String(opinion?.id):binding.locked_script_sha256!==lock.sha256))throw Error('全文锁稿绑定已失效，请重新读取站内版本');exactScript(lock.text);lockSegments(lock.text);return {...lock,feedback_id:String(opinion!.id),queue_id:String(q.id)};
 }
 // A returned locked draft keeps the owner's exact text for later revision too.
 // Rebind the existing immutable text to the current draft; changing review mode
 // or using a different review entry point cannot silently unlock it.
 const draft=job.drafts?.find(d=>d.revision===job.revision);if(!draft?.content)return null;
 const content=JSON.parse(draft.content),saved=(job.reviews||[]).find(r=>r.decision==='script_lock'&&r.revision===job.revision&&JSON.parse(String(r.note)).mode_epoch===job.mode_epoch),standalone=saved?JSON.parse(String(saved.note)):null,prior=standalone||content.execution?.script_lock;
 if(!prior){const queues=(job.reviews||[]).filter(r=>r.decision==='script_feedback_rework').map(r=>JSON.parse(String(r.note))).filter(q=>q.source_revision===job.revision);if(queues.length&&!queues.some(q=>q.mode_epoch===job.mode_epoch))throw Error('全文锁稿或反馈模式绑定已失效，请在当前模式重新提交');return null;}
 const original=standalone?.text||content.script;exactScript(original);lockSegments(original);
 if(!/^[a-f0-9]{64}$/.test(String(prior.sha256)))throw Error('已回站全文锁稿哈希无效');
 return {schema:'owner-script-lock-v1' as const,text:original,sha256:prior.sha256,source_revision:job.revision,source_hash:draft.content_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,quality_approval:false as const,media_authorization:false as const,publication_authorization:false as const,feedback_id:String(prior.feedback_id||''),queue_id:String(prior.queue_id||'')};
}
export function verifyLockedDraft(lock:ScriptLock,draft:{script:string;storyboard?:{narration:string}[];execution?:{script_lock?:{sha256:string;source_revision:number;source_hash:string;mode_epoch:number;feedback_id?:string;queue_id?:string}}}){
 if(draft.script!==lock.text)throw Error('回传口播与站内锁定全文不一致，拒绝提交');const segments=lockSegments(lock.text);if(!draft.storyboard||draft.storyboard.length!==segments.length||draft.storyboard.some((s,i)=>s.narration!==segments[i]))throw Error('分镜口播改写、遗漏或重排了锁定原稿，拒绝提交');const b=draft.execution?.script_lock;if(!b||b.sha256!==lock.sha256||b.source_revision!==lock.source_revision||b.source_hash!==lock.source_hash||b.mode_epoch!==lock.mode_epoch)throw Error('缺少全文锁稿版本回执，拒绝提交');
}
export function constructLockedOutput(lock:ScriptLock,parsed:Record<string,unknown>){
 const segments=lockSegments(lock.text),storyboard=parsed.storyboard as Record<string,unknown>[];
 if(parsed.script!==undefined||!Array.isArray(storyboard)||storyboard.length!==segments.length||storyboard.some((s,i)=>s.segment_index!==i||s.narration!==undefined))throw Error('模型输出违反逐字锁稿协议，暂停；不替换或掩盖改写');
 return {...parsed,script:lock.text,storyboard:storyboard.map(({segment_index,...s})=>({...s,narration:segments[Number(segment_index)]}))};
}
