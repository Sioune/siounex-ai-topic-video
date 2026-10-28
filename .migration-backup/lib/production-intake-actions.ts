import {db} from './store';import {readIntake,acceptedIntake} from './production-intake';import {createJob,getJob} from './production';import {hash,text,ProductionError} from './production-contract';
export async function acceptIntake(topicId:string,version:string,owner:string,goal?:string){
 text(owner,100);
 const existing=await db().prepare('SELECT id FROM production_jobs WHERE topic_id=?').bind(topicId).first<{id:string}>();
 if(existing){const old=await getJob(existing.id,owner),accepted=await acceptedIntake(old.id);if(accepted){if(accepted.proposal.version!==version||accepted.proposal.goal!==(goal===undefined?accepted.proposal.goal:text(goal,4000)))throw new ProductionError('此题已有绑定另一指令的任务；先审查原任务');return {job:old,created:false,replayed:true};}}
 const proposal=await readIntake(topicId);if(!proposal||proposal.version!==version)throw new ProductionError('提案版本已变化，请重新查看');
 // This function is called only after the existing owner browser identity check.
 // Create paused first, so a timer cannot claim between creation and approval.
 const command={...proposal,goal:goal===undefined?proposal.goal:text(goal,4000)},commandHash=await hash(JSON.stringify(command));
 const created=await createJob(topicId,owner,false,'node','paused');let j=created.job;
 const prior=await acceptedIntake(j.id);if(prior){if(prior.command_hash!==commandHash)throw new ProductionError('此题已有绑定另一指令的任务；先审查原任务');return {job:await getJob(j.id,owner),created:false,replayed:true};}
 if(j.revision===0&&j.status==='waiting_executor'&&!j.lease_until&&j.attempt===0){await db().prepare("UPDATE production_jobs SET status='paused' WHERE id=? AND owner_id=? AND revision=0 AND status='waiting_executor' AND lease_until IS NULL AND attempt=0").bind(j.id,owner).run();j=await getJob(j.id,owner);}
 if(j.revision!==0||j.status!=='paused'||j.lease_until||j.attempt!==0||j.reworks!==0||j.ai_calls!==0||j.drafts.length||j.operations.length)throw new ProductionError('此题已有执行或制作历史，不能覆盖指令或把旧成果当新授权');
 const note=JSON.stringify({schema:'owner-site-text-authorization-v1',proposal:command,command_hash:commandHash,contract_hash:j.contract_hash,text_authorized:true,authorized_nodes:['source','script'],new_paid_authorization:false,publication_authorization:false,owner_confirmed_at:new Date().toISOString()}),rid='intake_acceptance_'+await hash(j.id+commandHash+owner),t=new Date().toISOString();
 const results=await db().batch([db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,0,?,'intake_accepted',?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND status='paused' AND revision=0 AND attempt=0 AND reworks=0 AND ai_calls=0 AND lease_until IS NULL ON CONFLICT(id) DO NOTHING").bind(rid,version,note,owner,t,j.id,owner),db().prepare("UPDATE production_jobs SET status='waiting_executor',mode_epoch=mode_epoch+CASE WHEN review_mode='node' THEN 0 ELSE 1 END,review_mode='node',error=NULL,updated_at=? WHERE id=? AND owner_id=? AND revision=0 AND attempt=0 AND status='paused' AND EXISTS(SELECT 1 FROM production_reviews WHERE id=?)").bind(t,j.id,owner,rid)]);
 if(!results[1].meta.changes){const current=await acceptedIntake(j.id);if(current?.proposal.version!==version||current.command_hash!==commandHash)throw new ProductionError('确认时任务或文字指令已变化，请重新读取',409);}
 return {job:await getJob(j.id,owner),created:created.created,replayed:!results[0].meta.changes};
}
