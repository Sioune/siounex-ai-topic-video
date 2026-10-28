import {automaticCloneAudioProjection,automaticCloneAudioEvidence,automaticCloneAudioFile} from '../lib/automatic-clone-contract.mts';
import {studioGenerationValid} from '../lib/studio-preview-generation-contract.mts';
import {WORKSTATION_FLOW} from './production-flow-lifecycle.mjs';
// Local render ownership only. This module grants no provider, voice or Play action.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const digest = /^[a-f0-9]{64}$/;
const runPattern = /^[0-9TZ.-]+-[a-f0-9-]{36}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const liveClaims = new WeakSet();
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function fail(code = 'AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN') { throw Object.assign(Error(code), {code}); }
function regular(file) { try { const s = fs.lstatSync(file); return s.isFile() && !s.isSymbolicLink() ? s : null; } catch { return null; } }
function directory(value) {
 const resolved = path.resolve(value); let current = path.parse(resolved).root;
 for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) { current = path.join(current, part); const s = fs.lstatSync(current); if (!s.isDirectory() || s.isSymbolicLink()) fail(); }
 if (fs.realpathSync(resolved) !== resolved) fail(); return resolved;
}
function read(file) { const s = regular(file); if (!s || s.size < 1 || s.size > 64000) fail(); const bytes = fs.readFileSync(file); let value; try { value = JSON.parse(bytes); } catch { fail(); } return {value, sha256: sha(bytes)}; }
function within(root, file) { const relative = path.relative(root, file); return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep); }

export function requireCloneLocalRenderBudget({deadline_ms = Infinity, now = Date.now, minimum_ms = 300000} = {}) {
 if (typeof now !== 'function' || !Number.isFinite(now()) || deadline_ms !== Infinity && !Number.isFinite(deadline_ms) || !Number.isSafeInteger(minimum_ms) || minimum_ms < 60000) fail();
 if (now() + minimum_ms >= deadline_ms) fail('AUTOMATIC_CLONE_RENDER_DEFERRED');
 return true;
}

export function claimCloneLocalRenderLock(input = {}, {now = Date.now, pid = process.pid} = {}) {
 if(typeof now !== 'function' || !Number.isFinite(now()) || input.deadline_ms !== undefined && input.deadline_ms !== Infinity && !Number.isFinite(input.deadline_ms)) fail();
 const root = directory(input.root), out = directory(input.out), r = automaticCloneAudioProjection(input.request), job = input.job, b = r?.binding;
 if (!within(path.join(root, '.sites-runtime/automatic-clone-renders'), out) || path.basename(out) !== input.input_hash || !digest.test(input.input_hash || '') || !/^job_[a-f0-9-]{36}$/.test(job?.id || '') || !/^acl_[a-f0-9]{64}$/.test(r?.id || '') || r.job_id !== job.id || !b || b.revision !== job.revision || !Number.isSafeInteger(b.revision) || b.revision < 1 || !Number.isSafeInteger(b.mode_epoch) || b.mode_epoch < 0 || !digest.test(b.script_hash || '') || !digest.test(b.contract_hash || '') || !digest.test(r.provider_result?.audio_sha256 || '') || !Number.isSafeInteger(pid) || pid < 1) fail();
 const requestDir = path.join(root, '.sites-runtime/authorized-inputs', job.id, 'revision-' + job.revision, 'automatic-clone', r.id), raw = path.resolve(root, r.provider_result.audio_file || '');
 if (!within(directory(requestDir), raw) || directory(path.dirname(raw)) !== path.dirname(raw) || !regular(raw) || sha(fs.readFileSync(raw)) !== r.provider_result.audio_sha256 || r.provider_result.audio_size_bytes !== undefined && fs.statSync(raw).size !== r.provider_result.audio_size_bytes) fail();
 if(r.studio_preview_generation_head){const h=r.studio_preview_generation_head;if(!automaticCloneAudioEvidence(r,r.provider_result)||!automaticCloneAudioFile(r,r.provider_result.audio_file)||path.dirname(raw)!==path.join(requestDir,'preview-generations',h.generation_id))fail();const stored=read(path.join(path.dirname(raw),'preview-generation.json')),g=stored.value;if(stored.sha256!==h.header_sha256||!studioGenerationValid(g)||g.generation_id!==h.generation_id||g.request_id!==r.id||g.job_id!==job.id||g.binding.script_hash!==r.binding.script_hash||g.binding.contract_hash!==r.binding.contract_hash||g.binding.voice_id!==r.voice_id)fail();}
 const renderer = input.renderer_file || path.join(root, 'scripts/automatic-clone-render.mjs'); if (!regular(renderer)) fail();
 const run = input.periodic_run_id ?? process.env.SIOUNEX_PERIODIC_RUN_ID;
 let executor;
 if (run !== undefined) {
  if (!runPattern.test(run || '')) fail();
  const dir = directory(path.join(root, '.sites-runtime/periodic-runs', run, 'executor')), source = read(path.join(dir, 'process-started.json')), s = source.value;
  const started = Date.parse(s.started_at), natural = s.completion_policy === 'natural', flow = s.production_lifecycle === WORKSTATION_FLOW;
  // The current invocation itself is alive. A historical clock boundary does
  // not turn that owned PID into an unknown or permit stealing another lock.
  if (fs.existsSync(path.join(dir, 'process-exit.json')) || s.scope !== 'owned-child-tree' || s.pid !== pid || s.periodic_run_id !== run || !Number.isFinite(started) || started > now() + 5000 || (natural ? s.deadline_ms !== null || (flow ? s.admission_deadline_ms !== null : !Number.isFinite(s.admission_deadline_ms) || s.admission_deadline_ms < 0) : s.completion_policy !== undefined || !Number.isFinite(s.deadline_ms) || s.deadline_ms < started)) fail();
  executor = {scope: 'owned-child-tree', pid, periodic_run_id: run, started_at: s.started_at, deadline_ms: s.deadline_ms, ...(natural ? {completion_policy: 'natural', admission_deadline_ms: s.admission_deadline_ms,...(flow?{production_lifecycle:WORKSTATION_FLOW}:{})} : {}), process_started_sha256: source.sha256};
 } else {
  // Direct local/test invocations never acquire an owned-executor recovery proof.
  executor = {scope: 'unscheduled-current-node', pid, periodic_run_id: null, started_at: new Date(now() - process.uptime() * 1000).toISOString(), deadline_ms: Number.isFinite(input.deadline_ms) ? input.deadline_ms : null, process_started_sha256: null};
 }
 const lock_file = path.join(out, 'render.lock'), ownerName = 'render-owner-' + randomUUID() + '.json', owner_file = path.join(out, ownerName);
 const evidence = {schema: 'automatic-clone-local-render-owner-v1', job_id: job.id, request_id: r.id, binding: structuredClone(b), input_hash: input.input_hash, audio_sha256: r.provider_result.audio_sha256, ...(r.studio_preview_generation_head?{generation_id:r.studio_preview_generation_head.generation_id,generation_header_sha256:r.studio_preview_generation_head.header_sha256}:{}), base: structuredClone(r.base || null), renderer_sha256: sha(fs.readFileSync(renderer)), project_sha256: null, render_deadline_ms: Number.isFinite(input.deadline_ms) ? input.deadline_ms : null, executor, owner_history_file: ownerName, created_at: new Date(now()).toISOString(), nonce: randomUUID(), provider_calls_allowed: false, new_play_allowed: false};
 const bytes = Buffer.from(canonical(evidence)); let fd;
 try { fd = fs.openSync(lock_file, 'wx'); } catch { fail(); }
 try { fs.writeFileSync(fd, bytes); fs.writeFileSync(owner_file, bytes, {flag: 'wx'}); }
 catch (error) { fs.closeSync(fd); throw error; } // A partial claim stays unknown; never erase it here.
 const claim = {fd, lock_file, owner_file, lock_sha256: sha(bytes), evidence, pid}; liveClaims.add(claim); return claim;
}

export function releaseCloneLocalRenderLock(claim) {
 if (!claim || !liveClaims.has(claim) || !Number.isSafeInteger(claim.fd) || claim.pid !== claim.evidence?.executor?.pid) fail();
 liveClaims.delete(claim);
 let valid = false;
 try { valid = regular(claim.lock_file) && sha(fs.readFileSync(claim.lock_file)) === claim.lock_sha256 && regular(claim.owner_file) && sha(fs.readFileSync(claim.owner_file)) === claim.lock_sha256; }
 finally { fs.closeSync(claim.fd); }
 if (!valid) fail();
 fs.unlinkSync(claim.lock_file); // Only this exact live invocation's lock; legacy locks are never opened.
 return true;
}
