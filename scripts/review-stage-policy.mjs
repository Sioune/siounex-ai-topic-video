import {createHash} from 'node:crypto';
import {REVIEW_STAGE_POLICY,REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_TEXT,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';
export {REVIEW_STAGE_POLICY,REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_TEXT,REVIEW_STAGE_POLICY_SHA256};
if(createHash('sha256').update(REVIEW_STAGE_POLICY_TEXT).digest('hex')!==REVIEW_STAGE_POLICY_SHA256)throw Error('Review stage policy text/hash mismatch; no review may start');

export function textStagePolicy(node) {
  if (!REVIEW_STAGE_POLICY.stages.includes(node)) return '';
  return `本次本人已确认的阶段审核政策 ${REVIEW_STAGE_POLICY_VERSION}，SHA256 ${REVIEW_STAGE_POLICY_SHA256}：${REVIEW_STAGE_POLICY_TEXT}`;
}

// Retain the frozen checker's combined result for later production gates. Only
// its exact acquisition-pending diagnostic is deferred; malformed text/plans
// and unknown diagnostics remain blocking for the text review.
export function splitNarrationPreflight(report) {
  const problems = Array.isArray(report.problems) ? report.problems.map(String) : [];
  const materialProblems = problems.filter(p => /^segments\[\d+\] 素材未完成获取与核查$/.test(p));
  const textProblems = problems.filter(p => !materialProblems.includes(p));
  if (report.error) textProblems.push(String(report.error));
  if (report.machine_preflight === 'blocked' && !problems.length && !report.error) textProblems.push('前台文案预检受阻但缺少具体诊断');
  if (!['clear', 'blocked'].includes(report.machine_preflight)) textProblems.push('前台文案预检尚未完成');
  return {
    text_preflight: textProblems.length ? 'blocked' : 'clear',
    text_problems: textProblems,
    material_problems: materialProblems,
    production_ready: false,
    material_status: 'pending',
    review_stage_policy_version: REVIEW_STAGE_POLICY.version,
    review_stage_policy_sha256: REVIEW_STAGE_POLICY_SHA256,
  };
}

export function assertTextStagePreflight(report) {
  if (!report) return;
  const split = splitNarrationPreflight(report);
  if (split.text_preflight !== 'clear') throw Error('Cannot approve script with blocked text preflight: ' + split.text_problems.join('; '));
}
