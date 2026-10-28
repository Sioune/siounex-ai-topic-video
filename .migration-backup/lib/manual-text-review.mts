// A same-draft human text decision is independent of the job's automation mode.
// It never approves media, changes budgets, or grants permission to generate.
type Node={id:string;node:string;revision:number;artifact_hash:string;artifact_version?:number;mode_epoch:number;status:string};
type Job={revision:number;mode_epoch:number;review_mode:string;milestones?:Node[];reviews?:Record<string,unknown>[]};
export function textReviewNodes(j:Job){return ['source','script'].map(node=>(j.milestones||[]).filter(m=>m.node===node&&m.revision===j.revision&&m.mode_epoch===j.mode_epoch&&!['superseded','invalidated'].includes(m.status)).sort((a,b)=>(b.artifact_version||1)-(a.artifact_version||1))[0]);}
export function manualTextReviewAvailable(j:Job){const nodes=textReviewNodes(j);return j.review_mode==='auto'&&j.revision>0&&nodes.every(Boolean)&&nodes.some(m=>m.status!=='approved');}
export function manualTextReviewBinding(j:Job,epoch=j.mode_epoch){return {revision:j.revision,mode_epoch:epoch,nodes:textReviewNodes(j).filter(Boolean).map(m=>({id:m.id,node:m.node,artifact_hash:m.artifact_hash}))};}
export function currentManualTextReview(j:Job){if(j.review_mode!=='auto')return false;const binding=manualTextReviewBinding(j);if(binding.nodes.length!==2)return false;return (j.reviews||[]).some(r=>{if(r.decision!=='resume_manual_text'||Number(r.revision)!==j.revision)return false;try{const v=JSON.parse(String(r.note));return v.schema==='manual-text-review-v1'&&JSON.stringify(v.binding)===JSON.stringify(binding)&&v.keep_automatic_mode===true}catch{return false}});}
