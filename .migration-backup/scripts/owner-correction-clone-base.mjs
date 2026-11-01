import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const read=(file,hash)=>{const b=fs.readFileSync(file);if(sha(b)!==hash)throw Error('OWNER_CORRECTION_BYTES_CHANGED');return JSON.parse(b);};

// The approved correction is a cut of an earlier project, not that earlier
// project itself. Reuse its dependencies, but only the retained cut segments.
export function inspectOwnerCorrectionBase({job,request,draft,correctionDir,sourceDir}){
 const cp=path.join(correctionDir,'owner-correction-project.json'),receipt=path.join(correctionDir,'actual-edit-receipt.json');
 const c=read(cp,draft.request.project.file_sha256),e=read(receipt,draft.request.project.render_receipt_sha256);
 const originalFile=path.join(sourceDir,'editable-project.json'),p=read(originalFile,c.original_project_sha256),producer=JSON.parse(fs.readFileSync(path.join(sourceDir,'producer-receipt.json'),'utf8'));
 const video=fs.readFileSync(path.join(correctionDir,'owner-correction.mp4'));
 if(job.review_mode!=='node'||c.schema!=='owner-feedback-correction-project-v1'||e.schema!=='owner-feedback-outro-result-v1'||p.schema!=='editable-local-private-review-v1'||c.job_id!==job.id||e.job_id!==job.id||p.job_id!==job.id||c.binding.script_hash!==request.binding.script_hash||c.binding.revision!==request.binding.revision||c.binding.mode_epoch!==request.binding.mode_epoch||c.binding.contract_hash!==request.binding.contract_hash||c.binding.scope_id!==request.scope_id||sha(video)!==request.base.video_sha256||e.output_video_sha256!==request.base.video_sha256||e.source_video_sha256!==c.original_video_sha256||producer.video_sha256!==c.original_video_sha256||e.reviewed_video_sha256!==c.reviewed_video_sha256||e.feedback_sha256!==c.owner_feedback_sha256||e.preview_id!==c.preview_id||canonical(c.edit)!==canonical(e)||e.full_decode_exit_code!==0||e.new_paid_calls!==0||e.quality_approved!==false||e.publication_authorized!==false||e.fps!==30||e.body_end_frame!==c.body_frames||e.source_outro_end_frame-e.source_outro_start_frame!==c.outro_frames||e.frames!==c.body_frames+c.outro_frames||e.source_outro_start_frame!==p.body_frames||p.outro_frames!==c.outro_frames)throw Error('OWNER_CORRECTION_BINDING_CHANGED');
 if(!Array.isArray(c.source_to_timeline)||!c.source_to_timeline.length||c.source_to_timeline.length>p.source_to_timeline.length)throw Error('OWNER_CORRECTION_TIMELINE_CHANGED');
 let end=0;const segments=c.source_to_timeline.map((s,i)=>{const old=p.source_to_timeline[i];if(s.index!==i||s.start_frame!==end||s.start_frame!==old.start_frame||!Number.isInteger(s.end_frame)||s.end_frame>s.start_frame+(old.end_frame-old.start_frame)||s.end_frame<=s.start_frame||s.text!==old.text||canonical(s.media)!==canonical(old.media)||i<c.source_to_timeline.length-1&&s.end_frame!==old.end_frame)throw Error('OWNER_CORRECTION_TIMELINE_CHANGED');end=s.end_frame;return {...old,start_frame:s.start_frame,end_frame:s.end_frame};});
 if(end!==c.body_frames||p.source_to_timeline.slice(segments.length).some(s=>(s.text||'').trim())||segments.map(s=>s.text||'').join('').replace(/\s/gu,'')!==p.script.replace(/\s/gu,''))throw Error('OWNER_CORRECTION_TIMELINE_CHANGED');
 const coverage=structuredClone(p.material_coverage);if(coverage?.segments){coverage.segments=coverage.segments.filter(s=>s.storyboard_index<segments.length);for(const row of coverage.segments){const s=segments[row.storyboard_index],old=p.source_to_timeline[row.storyboard_index];if(row.kind==='video'&&s.end_frame<old.end_frame){if(!Number.isFinite(row.source_in_seconds)||!Number.isFinite(row.source_out_seconds))throw Error('OWNER_CORRECTION_TIMELINE_CHANGED');row.source_out_seconds=Math.min(row.source_out_seconds,row.source_in_seconds+(s.end_frame-s.start_frame)/30);}}}
 return {draft,project:{...p,source_to_timeline:segments,material_coverage:coverage,body_frames:c.body_frames,outro_frames:c.outro_frames},source_project:p,source_project_sha256:c.original_project_sha256,project_file:cp,dir:sourceDir,owner_correction:true};
}
