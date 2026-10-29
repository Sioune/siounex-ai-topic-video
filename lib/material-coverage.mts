import {motionSha} from './content-motion-contract.mts';
// A source identity is not evidence that it depicts an approved action. Keep
// material acquisition separate from the exact, reviewed storyboard contract.
export const MATERIAL_COVERAGE_VERSION = 'exact-material-coverage-v1';
type Row = Record<string, any>;
const digest = /^[a-f0-9]{64}$/;
const fail = (code: string): never => { throw Object.assign(new Error(code), {code}); };
const idsOf = (s: Row) => String(s.asset_id || '').split(',').map(s => s.trim());
const bindingKeys = ['revision', 'script_hash', 'mode_epoch', 'contract_hash', 'scope_id'];
const text = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
export function validateMaterialCoverage(contract: any, context: {job_id: string; binding: Row; storyboard: Row[]; media: Row[]; human_review?: boolean}) {
 if (contract == null) return null;
 if (contract.schema !== MATERIAL_COVERAGE_VERSION || contract.job_id !== context.job_id || !contract.binding || bindingKeys.some(k => contract.binding[k] !== context.binding[k]) || !Array.isArray(contract.segments)) fail('MATERIAL_COVERAGE_BINDING_CHANGED');
 const seen = new Set<number>();
 for (const c of contract.segments) {
  const index = c.storyboard_index, approved = context.storyboard[index];
  if (!Number.isInteger(index) || !approved || seen.has(index)) fail('MATERIAL_COVERAGE_SEGMENT_INVALID');
  seen.add(index);
  const ids = idsOf(approved), assets = ids.map(id => context.media.find(m => m.asset_id === id));
  if (c.approved_visual !== approved.visual || !Array.isArray(c.asset_ids) || JSON.stringify(c.asset_ids) !== JSON.stringify(ids) || !Array.isArray(c.source_sha256) || assets.some(a => !a) || JSON.stringify(c.source_sha256) !== JSON.stringify(assets.map(a => a?.sha256)) || c.source_sha256.some((h: unknown) => !digest.test(String(h)))) fail('MATERIAL_COVERAGE_SOURCE_CHANGED');
  if (!['image', 'video', 'article-quote'].includes(c.kind) || assets.some(a => a?.kind !== c.kind) || !(context.human_review===true&&c.semantic_review==='pending-owner-review'&&c.supports_approved_visual===false)&&!(c.semantic_review==='actual-source-reviewed'&&c.supports_approved_visual===true) || !text(c.evidence_reference) || !text(c.visible_content)) fail('MATERIAL_COVERAGE_SEMANTIC_REVIEW_REQUIRED');
  // Pending actions may not be recast as stills or editorial quotations by an
  // acquisition-side switch. Such a form change belongs in the approved draft.
  if (c.kind !== 'video' && approved.material_kind !== c.kind && !ids.every(id => /^image_\d+$/.test(id) && c.kind === 'image')) fail('MATERIAL_COVERAGE_APPROVED_FORM_REQUIRED');
  if (c.kind === 'article-quote' && (assets.some(a => !text(a?.text) || !text(a?.source_url)) || !text(c.source_document_sha256) || !digest.test(c.source_document_sha256))) fail('MATERIAL_COVERAGE_QUOTE_SOURCE_REQUIRED');
  if (c.kind === 'video') {
   const contextual=['published-source-clip','edited-source-sequence'].includes(c.source_kind)&&c.review_scope==='whole-decoded-source-context',review=assets[0]?.video_review;
   if(c.source_kind==='edited-source-sequence'){const r=assets[0]?.content_motion_sequence;if(r?.schema!=='verified-content-motion-sequence-v1'||!digest.test(r.identity||'')||!Array.isArray(r.shots)||!r.shots.length||motionSha(r.shots)!==r.recipe_sha256)fail('MATERIAL_COVERAGE_DERIVED_RECIPE_REQUIRED');}
   if(contextual&&(approved.material_kind!=='video'||(approved.demonstration_required===true&&context.human_review!==true)||review?.full_decode!==true||review.source_sha256!==assets[0]?.sha256||!Number.isFinite(c.source_duration_seconds)||c.source_duration_seconds!==review.duration_seconds||c.source_out_seconds>review.duration_seconds))fail('MATERIAL_COVERAGE_PUBLISHED_CONTEXT_CHANGED');
   if (assets.length !== 1 || !Number.isFinite(c.source_in_seconds) || !Number.isFinite(c.source_out_seconds) || c.source_in_seconds < 0 || c.source_out_seconds <= c.source_in_seconds || !['official-source-recording', 'recorded-tool-session', 'original-interview','published-source-clip','edited-source-sequence'].includes(c.source_kind) || c.full_decode !== true || c.simulated_ui !== false || !Array.isArray(c.frames) || c.frames.length < (contextual?1:2) || c.frames.some((f: Row) => !text(f.file) || !digest.test(String(f.sha256)) || !Number.isFinite(f.source_second) || !text(f.visible_content) || (contextual?!review.frames?.some((r:Row)=>r.frame_id===f.frame_id&&r.file===f.file&&r.sha256===f.sha256&&r.source_second===f.source_second):f.source_second<c.source_in_seconds||f.source_second>c.source_out_seconds)) || new Set(c.frames.map((f: Row) => f.source_second)).size < (contextual?1:2)) fail('MATERIAL_COVERAGE_ACTUAL_VIDEO_REQUIRED');
   if(c.source_kind==='published-source-clip'&&(!/^https:\/\//.test(String(c.source_url||''))||!text(c.rights_status)||c.source_url!==(assets[0]?.source_url||assets[0]?.url)))fail('MATERIAL_COVERAGE_PUBLISHED_SOURCE_REQUIRED');
  }
 }
 return contract;
}
export function resolveSegmentMaterial({storyboard_index, approved, media, contract, required_frames, used_ranges = new Map(), human_review = false}: {storyboard_index: number; approved: Row; media: Row[]; contract?: any; required_frames: number; used_ranges?: Map<string, Array<[number, number]>>; human_review?: boolean}) {
 const ids = idsOf(approved), assets = ids.map(id => media.find(m => m.asset_id === id)), c = contract?.segments.find((s: Row) => s.storyboard_index === storyboard_index);
 const missing = (reason: string) => ({media: null, gap: {code: 'material:' + ids.join(','), detail: approved.visual, reason}});
 if (!ids.length || assets.some(a => !a)) return missing('exact-approved-asset-missing');
 const legacyStatic = !c && approved.material_kind !== 'video' && ids.every(id => /^image_\d+$/.test(id)) && assets.every(a => a?.kind === 'image');
 if (!c && !legacyStatic) return missing('exact-reviewed-material-coverage-required');
 const chosen = assets as Row[];
 if (chosen[0].kind === 'video') {
  const start = c.source_in_seconds, end = start + required_frames / 30;
  if (!Number.isInteger(required_frames) || required_frames <= 0 || end > c.source_out_seconds + 1e-8) return missing('reviewed-normal-speed-source-range-too-short');
  const contextual=['published-source-clip','edited-source-sequence'].includes(c.source_kind)&&c.review_scope==='whole-decoded-source-context';
  if (!contextual&&new Set(c.frames.filter((f: Row) => f.source_second >= start && f.source_second <= end + 1e-8).map((f: Row) => f.source_second)).size < 2) return missing('reviewed-frames-outside-selected-source-range');
  const key = chosen[0].sha256, prior = used_ranges.get(key) || [];
  const overlap=([a,b]:[number,number],[x,y]:[number,number])=>a<y-1e-8&&b>x+1e-8,hasOverlap=prior.some(r=>overlap(r,[start,end])),alreadyReused=prior.some((r,i)=>prior.slice(i+1).some(other=>overlap(r,other)));
  if (hasOverlap&&!human_review&&(!contextual||!text(c.editorial_reuse_reason)||alreadyReused)) return missing('reviewed-source-range-reused');
  used_ranges.set(key, [...prior, [start, end]]);
  return {media: {...chosen[0], start_seconds: start, demonstration: human_review&&contextual?{verified:false,evidence:c.evidence_reference,status:'pending-owner-review'}:{verified:true,evidence:c.evidence_reference}, material_coverage: c}, coverage: c};
 }
 return {media: chosen.length === 1 ? {...chosen[0]} : {kind: 'image-sequence', asset_id: ids.join(','), items: chosen.map(a => ({...a}))}, coverage: c || {kind: 'legacy-exact-approved-static-image', asset_ids: ids, source_sha256: chosen.map(a => a.sha256)}};
}
