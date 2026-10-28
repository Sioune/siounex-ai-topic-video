import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {REVIEW_STAGE_POLICY,REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_TEXT,REVIEW_STAGE_POLICY_SHA256,textStagePolicy,splitNarrationPreflight,assertTextStagePreflight} from '../scripts/review-stage-policy.mjs';

test('acquisition-only pending does not reject text or claim production readiness', () => {
  const report = {machine_preflight:'blocked',problems:['segments[0] 素材未完成获取与核查','segments[1] 素材未完成获取与核查']};
  const before=JSON.stringify(report), split=splitNarrationPreflight(report);
  assert.equal(split.text_preflight,'clear');assert.deepEqual(split.text_problems,[]);assert.equal(split.material_problems.length,2);
  assert.equal(split.production_ready,false);assert.equal(split.material_status,'pending');assert.doesNotThrow(()=>assertTextStagePreflight({...report,...split}));
  assert.equal(JSON.stringify(report),before,'the frozen checker result stays unchanged');
});

test('misleading frontstage, malformed plans and unknown diagnostics remain blocking', () => {
  for(const problem of ['narration[0] 待改写或必要性复核：据官方资料介绍','subtitles 缺失或格式不正确','overlays[0] 待改写或必要性复核：来源：','segments[0] 缺文字或具体可见画面','缺少逐段真实素材映射','unrecognized future checker error']) {
    const report={machine_preflight:'blocked',problems:[problem,'segments[1] 素材未完成获取与核查']};
    assert.equal(splitNarrationPreflight(report).text_preflight,'blocked');assert.throws(()=>assertTextStagePreflight(report),/blocked text preflight/);
  }
  assert.throws(()=>assertTextStagePreflight({machine_preflight:'blocked',problems:[]}),/缺少具体诊断/);
  assert.throws(()=>assertTextStagePreflight({machine_preflight:'legacy-unavailable',problems:[]}),/尚未完成/);
  assert.throws(()=>assertTextStagePreflight({machine_preflight:'clear',problems:[],error:'checker unreadable'}),/checker unreadable/);
});

test('owner stage policy is versioned and applies only to source/script', () => {
  assert.ok(Object.isFrozen(REVIEW_STAGE_POLICY));assert.match(REVIEW_STAGE_POLICY_SHA256,/^[a-f0-9]{64}$/);
  assert.equal(REVIEW_STAGE_POLICY.version,REVIEW_STAGE_POLICY_VERSION);assert.equal(createHash('sha256').update(REVIEW_STAGE_POLICY_TEXT).digest('hex'),REVIEW_STAGE_POLICY_SHA256);
  for(const node of ['source','script']){
    const instructions=textStagePolicy(node);assert.ok(instructions.includes(REVIEW_STAGE_POLICY.version));assert.ok(instructions.includes(REVIEW_STAGE_POLICY_SHA256));
    assert.ok(instructions.includes('优先于旧冻结技能'));assert.ok(instructions.includes('不能仅因二者不同就退回'));
    assert.ok(instructions.includes('未发生的对照实验不能写成已经证实的结论'));assert.ok(instructions.includes('60秒'));assert.ok(instructions.includes('production_ready仍为false'));
    assert.ok(instructions.includes('不以模板或片单差异、选择状态过期、素材文件尚不可用作为revise或pause理由'));assert.ok(instructions.includes('制作记录中提到GLM等其他作品不等于本条口播事实错误'));
  }
  for(const node of ['cover','video','promotion','delivery'])assert.equal(textStagePolicy(node),'');
});
