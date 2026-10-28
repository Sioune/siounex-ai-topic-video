// SYNTHETIC UI states only. No network, model, production task or approval writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {executionDisplay,executionStatusLabel,executorConnectionDetail} from '../lib/execution-display.mts';

const NOW = 1700000000000;
const stale = {executors: [{online: false, state: 'stopped', last_seen: NOW - 3 * 86400000}]};
const fresh = {executors: [{online: true, state: 'active', last_seen: NOW}]};
test('a normal transfer yield displays automatic continuation without failure, manual-input or complete-package claims',()=>{const text=executorConnectionDetail({executor_id:'windows-topic-periodic-v1',scope:'scheduled-poll',state:'idle',online:false,schedule_interval_ms:900000,last_seen:NOW,last_started_at:NOW-100000,last_finished_at:NOW-1000,next_check_at:NOW+700000,outcome:'in-progress'},NOW);assert.match(text,/本轮已保存进度，下次巡检继续/);assert.doesNotMatch(text,/本轮执行失败|有待补充或人工决定|已完成本轮处理|结果未确认/);});

test('current automatic media work outranks stale missing-input preparation receipts',()=>{
 const b={revision:1,script_hash:'a'.repeat(64),mode_epoch:2,contract_hash:'c'.repeat(64)},job={status:'approved',revision:1,approved_revision:1,approved_hash:b.script_hash,mode_epoch:2,contract_hash:b.contract_hash,media_continuation:{current_id:'scope-1',scope:{id:'scope-1',binding:b}},facts:{native_preparation_handoff:{status:'claimed',lease_until:NOW+60000,binding:{...b,scope_id:'scope-1',scope:'private-video'},missing:[]}},stages:[{stage:'media_inputs',status:'blocked',review_revision:1,review_hash:b.script_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:'scope-1',binding:b,receipt:{status:'blocked'}})}]};
 assert.equal(executionDisplay(job,NOW).label,'正在自动制作');
 job.facts.native_preparation_handoff.status='completed';assert.equal(executionDisplay(job,NOW).label,'成片已生成，待回传');
 job.facts.native_preparation_handoff.status='blocked';job.facts.native_preparation_handoff.missing=[{code:'local-production:frame-error'}];assert.equal(executionDisplay(job,NOW).label,'制作异常，待恢复');
 assert.doesNotMatch(executionDisplay(job,NOW).message,/已有音轨和工程保留/,'a generic failure must not invent retained outputs');
 job.facts.native_preparation_handoff.missing=[{code:'local-production:Local tool failed/timed out: node.exe',detail:'阶段 ordinary-audio-and-editable-project：Error: TITLE_CANNOT_FIT_WITHOUT_TEXT_CHANGE'}];assert.equal(executionDisplay(job,NOW).label,'排版异常，待恢复');assert.match(executionDisplay(job,NOW).message,/已批准内容.*无需重复送审/);
 job.facts.native_preparation_handoff.binding.scope_id='old';assert.equal(executionDisplay(job,NOW).label,'准备检查待补充');
});

test('task status labels keep stopped and actual execution states primary without mutating review or counters',()=>{
 const cases=[
  ['paused',NOW+1000,'已暂停，需要决定'],['failed',NOW+1000,'执行失败'],
  ['waiting_executor',NOW+1000,'等待执行器领取'],
  ['running',NOW+1000,'执行器已领单 · 租约有效'],['running',NOW-1,'租约已过期 · 结果待核对']
 ];
 for(const [status,lease_until,label]of cases){
  const job={status,lease_until,attempt:2,reworks:1,ai_calls:1,milestones:[{node:'source',status:'revise'}]},before=structuredClone(job);
  assert.equal(executionStatusLabel(job,NOW),label);assert.deepEqual(job,before);
 }
 for(const status of ['awaiting_review','approved','completed'])assert.equal(executionStatusLabel({status,lease_until:NOW+1000,runtime:fresh},NOW),null,'existing review and delivery precedence stays with its caller');
 const executor={executor_id:'windows-topic-periodic-v1',scope:'scheduled-poll',state:'idle',online:false,last_seen:NOW-180000,last_started_at:NOW-180000,last_finished_at:NOW-120000,next_check_at:NOW+720000,schedule_interval_ms:900000,outcome:'idle'};
 assert.equal(executionStatusLabel({status:'waiting_executor',runtime:{executors:[executor]}},NOW),'等待下次后台巡检');
 assert.equal(executionStatusLabel({status:'waiting_executor',runtime:{executors:[executor]}},executor.next_check_at+120001),'等待执行器领取 · 巡检回执已逾期');
});

test('a claimed task remains claimed without an independent executor heartbeat', () => {
  const job = {status: 'running', revision: 0, lease_until: NOW + 1000, runtime: stale};
  const before = structuredClone(job);
  const view = executionDisplay(job, NOW);
  assert.equal(view.activeLease, true);
  assert.equal(view.expired, false);
  assert.equal(view.online, false);
  assert.match(view.connection, /已领单/);
  assert.match(view.emptyDraftMessage, /首稿尚未回传/);
  assert.doesNotMatch(view.message, /等待执行器领取|当前没有在线制作执行器/);
  assert.deepEqual(job, before);
});

test('expiry takes priority even while another executor heartbeat is online', () => {
  for (const lease_until of [NOW, NOW - 1, null, undefined, NaN]) {
    const view = executionDisplay({status: 'running', lease_until, runtime: fresh}, NOW);
    assert.equal(view.activeLease, false);
    assert.equal(view.expired, true);
    assert.equal(view.online, true);
    assert.match(view.emptyDraftMessage, /核对已有输出与回执/);
    assert.match(view.message, /禁止自动重跑/);
    assert.doesNotMatch(view.label, /租约有效/);
  }
});

test('queued, paused and reviewed jobs never acquire a live task from stale lease fields', () => {
  for (const status of ['waiting_executor', 'paused', 'awaiting_review']) {
    const view = executionDisplay({status, lease_until: NOW + 600000, runtime: stale}, NOW);
    assert.equal(view.activeLease, false);
    assert.equal(view.expired, false);
    assert.equal(view.online, false);
    assert.doesNotMatch(view.emptyDraftMessage, /已领单/);
    if (status === 'waiting_executor') assert.match(view.emptyDraftMessage, /等待执行器领取/);
    else assert.equal(view.message, null);
  }
  assert.equal(executionDisplay({status: 'waiting_executor', runtime: fresh}, NOW).online, true);
  assert.equal(executionDisplay({status: 'waiting_executor', runtime: {executors: [{online: true, last_seen: NOW - 45001}]}}, NOW).online, false);
});

test('scheduled waiting and overdue are distinct from the 45-second online signal',()=>{
 const executor={executor_id:'windows-topic-periodic-v1',scope:'scheduled-poll',state:'idle',online:false,last_seen:NOW-180000,last_started_at:NOW-180000,last_finished_at:NOW-120000,next_check_at:NOW+720000,schedule_interval_ms:900000,outcome:'idle'};
 const job={status:'waiting_executor',revision:0,runtime:{executors:[executor]}};
 const view=executionDisplay(job,NOW);assert.equal(view.activeLease,false);assert.equal(view.online,false);assert.equal(view.poll_state,'waiting');assert.equal(view.label,'等待下次后台巡检');assert.match(view.connection,/巡检间隔不代表离线/);assert.doesNotMatch(view.message,/未安装|不会自行唤醒/);
 const detail=executorConnectionDetail(executor,NOW);assert.match(detail,/每15分钟/);assert.match(detail,/最近完成/);assert.match(detail,/没有可自动领取的任务/);assert.match(detail,/下次检查/);
 const overdue=executionDisplay(job,executor.next_check_at+120001);assert.equal(overdue.poll_state,'overdue');assert.match(overdue.label,/巡检回执已逾期/);assert.equal(overdue.activeLease,false);
});
test('a scheduled pulse and an isolated QA heartbeat cannot claim an unrelated task',()=>{
 const scheduled={executor_id:'windows-topic-periodic-v1',scope:'scheduled-poll',state:'active',online:true,last_seen:NOW,last_started_at:NOW,schedule_interval_ms:900000};
 const view=executionDisplay({status:'waiting_executor',runtime:{executors:[scheduled]}},NOW);assert.equal(view.online,true);assert.equal(view.activeLease,false);assert.match(view.label,/本任务尚未领单/);
 const isolated={executor_id:'isolated-closure-qa',scope:'finite-foreground',state:'active',online:true,last_seen:NOW};const qa=executionDisplay({status:'waiting_executor',runtime:{executors:[isolated]}},NOW);assert.equal(qa.online,false);assert.equal(qa.scheduled,null);assert.equal(qa.activeLease,false);assert.match(executorConnectionDetail(isolated,NOW),/隔离测试/);
});

function preparedJob(status='blocked'){
 const binding={revision:2,script_hash:'a'.repeat(64),mode_epoch:3,contract_hash:'c'.repeat(64)},scope={id:'scope-current',scope:'preparation',binding};
 const receipt={schema:'media-input-probe-receipt-v1',status:'blocked',checks:[{code:'identity',passed:true,detail:'字节已核对'},{code:'audio',passed:false,detail:'当前执行目录缺少已授权音轨；尚未试听'}]};
 return {status:'approved',revision:2,approved_revision:2,approved_hash:binding.script_hash,mode_epoch:3,contract_hash:binding.contract_hash,media_continuation:{current_id:scope.id,scope},stages:[{stage:'media_inputs',status,review_revision:2,review_hash:binding.script_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:scope.id,binding,attempt:1,receipt})}],operations:[],publication_reports:[]};
}
test('current blocked preparation names its actual first failed check without relabeling it as media production',()=>{
 const job=preparedJob(),before=structuredClone(job),view=executionDisplay(job,NOW);assert.equal(view.label,'准备检查待补充');assert.equal(view.message,'当前执行目录缺少已授权音轨；尚未试听');assert.equal(view.activeLease,false);assert.deepEqual(job,before);
});
test('queued, live, expired and ready preparation use real scope-bound states',()=>{
 const queued=preparedJob('queued');assert.equal(executionDisplay(queued,NOW).label,'准备检查已排队');assert.match(executionDisplay(queued,NOW).message,/尚未开始成片制作/);
 const running=preparedJob('running'),result=JSON.parse(running.stages[0].result);result.lease_until=NOW+1000;running.stages[0].result=JSON.stringify(result);assert.equal(executionDisplay(running,NOW).label,'准备检查进行中');assert.equal(executionDisplay(running,NOW+1001).label,'准备检查租约已过期');
 const partial=preparedJob('ready');assert.equal(executionDisplay(partial,NOW).label,'准备检查尚未完整');
 const complete=structuredClone(partial);complete.stages.push({...complete.stages[0],stage:'media_inventory'});assert.equal(executionDisplay(complete,NOW).label,'准备检查已回传');
});
test('old revision, hash, scope, epoch, contract and published preparation never relabel current work',()=>{
 const variants=[];
 for(const modify of [j=>j.stages[0].review_revision--,j=>j.stages[0].review_hash='old',j=>j.media_continuation.current_id='withdrawn',j=>j.approved_revision--,j=>j.publication_reports.push({id:'published'}),j=>j.operations.push({revision:2,mode_epoch:3,script_hash:j.approved_hash,status:'running'}),j=>{const p=JSON.parse(j.stages[0].result);p.binding.mode_epoch--;j.stages[0].result=JSON.stringify(p);},j=>{const p=JSON.parse(j.stages[0].result);p.binding.contract_hash='old';j.stages[0].result=JSON.stringify(p);},j=>{const p=JSON.parse(j.stages[0].result);p.scope_id='old-scope';j.stages[0].result=JSON.stringify(p);}]){const job=preparedJob();modify(job);variants.push(job);}
 for(const job of variants){const view=executionDisplay(job,NOW);assert.equal(view.label,null);assert.equal(view.message,null);}
});

// Render the real continuation component. Only primitive UI and React transport
// are adapted for an in-memory bundle; approval and history logic stay intact.
globalThis.__executionUiReact = React;
globalThis.__executionUiJsx = jsxRuntime;
const bundled = await build({
  stdin: {contents: "export {default as MediaContinuation} from './components/media-continuation';", resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{name: 'isolated-ui', setup(b) {
    b.onResolve({filter: /^react(?:\/jsx-runtime)?$/}, args => ({path: args.path, namespace: 'fixture'}));
    b.onResolve({filter: /(?:^|\/)ui\/button$/}, () => ({path: 'button', namespace: 'fixture'}));
    b.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: args.path === 'react'
      ? 'export const {useState,useEffect}=globalThis.__executionUiReact;'
      : args.path === 'react/jsx-runtime'
        ? 'export const {jsx,jsxs,Fragment}=globalThis.__executionUiJsx;'
        : 'export function Button({variant,...props}){return globalThis.__executionUiReact.createElement("button",props)}'}));
  }}],
});
const ui = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const base = {id: 'job_11111111-1111-1111-1111-111111111111', revision: 0, approved_revision: null, approved_hash: null, status: 'running', review_mode: 'node', mode_epoch: 0, contract_hash: 'c'.repeat(64), is_test: 0, intake: null, stages: [], operations: [], publication_reports: []};
function render(job) {
  const before = structuredClone(job);
  const html = renderToStaticMarkup(React.createElement(ui.MediaContinuation, {job, onSaved() {throw Error('Rendering must not save or approve');}}));
  assert.deepEqual(job, before);
  return html;
}

test('zero revision and unapproved or incomplete approval bindings cannot offer media continuation', () => {
  for (const changes of [{}, {revision: 1, status: 'awaiting_review'}, {revision: 1, status: 'approved', approved_revision: 1}, {revision: 2, status: 'approved', approved_revision: 1, approved_hash: 'a'.repeat(64)}, {status: 'approved', approved_revision: 0, approved_hash: 'a'.repeat(64)}]) {
    const html = render({...base, ...changes});
    assert.doesNotMatch(html, /当前批准|源稿批准保留|口播批准已保留|预览继续范围/);
    assert.match(html, /先完成来源与脚本审核/);
  }
  const approved = render({...base, revision: 1, status: 'approved', approved_revision: 1, approved_hash: 'a'.repeat(64)});
  assert.match(approved, /当前批准/);
  assert.match(approved, /预览继续范围/);
});

test('unapproved current work keeps old scope and technical receipts visible', () => {
  const binding = {revision: 0, script_hash: 'old-script', mode_epoch: 2, contract_hash: base.contract_hash};
  const html = render({...base, media_continuation: {current_id: 'old-scope', scope: {id: 'old-scope', scope: 'preparation', binding}, licenses: []}, stages: [{id: 'old-stage', stage: 'media_inventory', review_revision: 0, status: 'blocked', result: JSON.stringify({scope_id: 'old-scope', binding, attempt: 1, receipt: {checks: [{code: 'old-check', passed: false, detail: 'SYNTHETIC retained technical receipt'}]}})}]});
  assert.match(html, /旧媒体范围已失效/);
  assert.match(html, /旧范围记录，保留历史/);
  assert.match(html, /SYNTHETIC retained technical receipt/);
  assert.doesNotMatch(html, /预览继续范围|当前批准/);
});
