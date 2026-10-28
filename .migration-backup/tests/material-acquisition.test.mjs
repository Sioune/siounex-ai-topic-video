// Synthetic owners, public-address mocks and local bytes. No live network,
// speech, render, paid generation, login, or website changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {articleMaterialReferences,discoverMaterials,readPublicMaterial,inspectMaterial,materialAcquisitionCodeSha} from '../scripts/material-acquisition.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const ID='job_55555555-5555-4555-8555-555555555555';
const sourceUrl='https://source.example.org/current';
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32)]);
const mp4=Buffer.alloc(128);mp4.write('ftyp',4);mp4.write('isom',8);
const publicLookup=async()=>[{address:'93.184.216.34',family:4}];
const technical={probe:{width:1280,height:720,duration_seconds:12,codec_name:'h264',audio_present:false},frame:png};
const article=(extra='')=>'<html><title>SYNTHETIC exact teacher case</title><body><article><p>'+('SYNTHETIC approved article. '.repeat(12))+'</p>'+extra+'</article><aside><video src="https://ads.example.org/advert/not-the-case.mp4"></video></aside></body></html>';
test('source identities normalize only checkout CRLF, preserving actual source edits and all raw evidence bytes',()=>{
 const code='export const value=1;\nexport const label="source";\n',lf=Buffer.from(code),crlf=Buffer.from(code.replace(/\n/g,'\r\n'));
 assert.equal(materialAcquisitionCodeSha([lf]),materialAcquisitionCodeSha([crlf]));assert.notEqual(sha(lf),sha(crlf));
 for(const changed of [code.replace('value=1','value=2'),code+' ',code.replace(/\n/g,'\r'),'\uFEFF'+code])assert.notEqual(materialAcquisitionCodeSha([lf]),materialAcquisitionCodeSha([Buffer.from(changed)]));
 assert.notEqual(materialAcquisitionCodeSha([Buffer.from([255,10])]),materialAcquisitionCodeSha([Buffer.from([254,10])]),'all other source bytes remain exact, including invalid UTF-8');
});
function fixture(t,{html=article(),related_urls=[]}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-material-discovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source_snapshot=JSON.stringify({url:sourceUrl,title:'SYNTHETIC specific current teacher',related_urls}),content=JSON.stringify({script:'SYNTHETIC approved exact script',storyboard:[{narration:'SYNTHETIC approved exact script',visual:'同一老师同一课件的真实连续操作原片，不得用别人的课件替代',asset_id:'pending_exact_lesson',start:0,end:10}],evidence:[{url:sourceUrl,sha256:sha(html)}]}),binding={revision:1,script_hash:sha(content),mode_epoch:2,contract_hash:'a'.repeat(64),scope:'private-video',scope_id:'SYNTHETIC-owner-private-scope'},scope={id:binding.scope_id,binding:{revision:1,script_hash:binding.script_hash,mode_epoch:2,contract_hash:binding.contract_hash},scope:'private-video',owner_confirmed:true,authorization_source:'owner-private-video',new_paid_authorization:false,publication_authorization:false,quality_approved:false},job={id:ID,is_test:0,status:'approved',review_mode:'auto',revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:2,contract_hash:binding.contract_hash,source_snapshot,drafts:[{revision:1,content_hash:binding.script_hash,content}],milestones:['source','script'].map(node=>({node,revision:1,mode_epoch:2,status:'approved',artifact_hash:binding.script_hash,artifact_version:1})),media_continuation:{scope}};
 const frozen=path.join(root,'.sites-runtime/dispatch-sources',ID,binding.contract_hash);fs.mkdirSync(frozen,{recursive:true});fs.writeFileSync(path.join(frozen,'source.txt'),html);fs.writeFileSync(path.join(frozen,'source-receipt.json'),JSON.stringify({url:sourceUrl,source_snapshot_hash:sha(source_snapshot),sha256:sha(html),complete_response:true}));
 const jobRoot=path.join(root,'.sites-runtime/authorized-inputs',ID,'revision-1');return {root,job,binding,frozen,jobRoot,html};
}
function response(url,kind,body){return {url,resolved_url:url,body,sha256:sha(body),size_bytes:body.length,mime_type:kind==='video'?'video/mp4':kind==='image'?'image/png':'text/html',content_type:'text/html; charset=utf-8'}}

test('published product-video configuration reaches the normal acquisition queue as exact bytes without claiming the article case or version',async t=>{
 const clip='https://cdn.example.org/product-demo.mp4',html=article('<script type="application/json">'+JSON.stringify({home_feature_create_video:clip})+'</script>'),f=fixture(t,{html}),calls=[];
 const r=await discoverMaterials(f,{read:async(url,{kind})=>{calls.push({url,kind});assert.equal(url,clip);return response(url,'video',mp4)},inspect:()=>technical});assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].sha256,sha(mp4));assert.match(r.candidates[0].source_context.relation,/未证明属于本文案例或本次版本/);assert.equal(r.candidates[0].semantic_verification,'pending-exact-segment-review');assert.equal(r.quality_approved,false);assert.deepEqual(calls,[{url:clip,kind:'video'}]);
});
test('declared reusable silent tail creates no external material requirement; the approved body remains exact',async t=>{const f=fixture(t),draft=JSON.parse(f.job.drafts[0].content);draft.storyboard.push({start:10,end:14,asset_id:'',narration:'',visual:'沿用既有4秒片尾：保留品牌原件',sound:'无新增旁白；音乐沿用'});const content=JSON.stringify(draft),hash=sha(content);Object.assign(f.job.drafts[0],{content,content_hash:hash});f.job.approved_hash=hash;f.binding.script_hash=hash;f.job.media_continuation.scope.binding.script_hash=hash;for(const m of f.job.milestones)m.artifact_hash=hash;const r=await discoverMaterials(f,{read:()=>{throw Error('No external read expected')},inspect:()=>{throw Error('No media inspection expected')}});assert.equal(r.requirements.length,1);assert.equal(r.requirements[0].asset_id,'pending_exact_lesson');assert.equal(r.missing.length,1);assert.equal(f.job.drafts[0].content,content);});

test('article scope excludes recommendation/ad players, audio and page-wide fallback',()=>{
 const html=article('<audio><source src="https://media.example.org/news.mp4" type="audio/mp4"></audio><video src="/lesson.mp4"></video><iframe src="https://player.example.org/exact"></iframe><img data-original="https://media.example.org/teacher.png"><img src="/qrcode.png" alt="qrcode"><video src="https://videos.taboola.com/ad.mp4"></video>');
 const r=articleMaterialReferences(html,sourceUrl);assert.equal(r.article_found,true);assert.deepEqual(r.references.map(x=>[x.kind,x.url]),[['video','https://source.example.org/lesson.mp4'],['document','https://player.example.org/exact'],['image','https://media.example.org/teacher.png']]);
 const fallback=articleMaterialReferences('<div><video src="/unknown.mp4"></video></div>',sourceUrl);assert.equal(fallback.article_found,false);assert.deepEqual(fallback.references,[]);
 const narrow=articleMaterialReferences('<div class="article"><div class="article-content"><p>SYNTHETIC real prose</p><video src="/exact.mp4"></video></div><div class="recommend"><video src="/other.mp4"></video><img src="/code.png"></div></div>',sourceUrl);assert.deepEqual(narrow.references.map(r=>r.url),['https://source.example.org/exact.mp4']);
});

test('an explicit related public player can expose HTML video, Open Graph and VideoObject while ordinary page fallback stays disabled',()=>{
 const html='<html><head><title>SYNTHETIC exact public PV</title><meta property="og:video:secure_url" content="https://cdn.example.org/og.mp4"><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'VideoObject',contentUrl:'https://cdn.example.org/structured.mp4',embedUrl:'https://player.example.org/exact-pv'}]})+'</script></head><body><video><source type="video/mp4" src="https://cdn.example.org/source.mp4"></video><iframe src="https://player.example.org/direct"></iframe><aside><video src="https://cdn.example.org/unrelated.mp4"></video></aside><video src="https://ads.example.org/advert/ad.mp4"></video><video src="http://127.0.0.1/private.mp4"></video><video src="https://cdn.example.org/private.m3u8"></video></body></html>';
 assert.deepEqual(articleMaterialReferences(html,sourceUrl).references,[]);
 const refs=articleMaterialReferences(html,sourceUrl,{public_player:true}).references;assert.deepEqual(refs.map(r=>r.url),['https://cdn.example.org/og.mp4','https://cdn.example.org/source.mp4','https://player.example.org/direct','https://cdn.example.org/structured.mp4','https://player.example.org/exact-pv']);assert.ok(refs.filter(r=>r.kind==='document').every(r=>r.public_player===true));
});

test('research video watch pages and embedded public players resolve actual public MP4 bytes without treating HTML as a video',async t=>{
 const f=fixture(t),calls=[],watch='https://official.example.org/works/pv',embedded='https://player.example.org/public-pv',clip='https://cdn.example.org/public-pv.mp4';
 const r=await discoverMaterials({...f,candidate_sources:[{url:watch,kind:'video',relation:'SYNTHETIC current named work PV'}]},{read:async(url,{kind})=>{calls.push({url,kind});if(url===watch)return response(url,'document',Buffer.from('<html><title>Public PV</title><iframe src="'+embedded+'"></iframe></html>'));if(url===embedded)return response(url,'document',Buffer.from('<html><title>Public embedded PV</title><meta property="og:video" content="'+clip+'"></html>'));return response(url,'video',mp4)},inspect:()=>technical});
 assert.deepEqual(calls,[{url:watch,kind:'page-or-video'},{url:embedded,kind:'page-or-video'},{url:clip,kind:'video'}]);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].kind,'video');assert.equal(r.candidates[0].source_url,embedded);assert.equal(sha(fs.readFileSync(r.candidates[0].file)),sha(mp4));assert.equal(r.semantic_approval,false);
});

test('public page-or-video reader preserves MIME, signatures and DNS boundaries for extensionless video endpoints',async()=>{
 for(const [body,contentType,detected]of [[Buffer.from('<html>SYNTHETIC public player</html>'),'text/html; charset=utf-8','document'],[mp4,'video/mp4','video']]){const r=await readPublicMaterial('https://official.example.org/play?id=public',{kind:'page-or-video',lookup:publicLookup,transport:async()=>({status:200,body,contentType})});assert.equal(r.detected_kind,detected);assert.equal(r.sha256,sha(body));}
 for(const result of [{status:200,body:Buffer.from('not video'),contentType:'video/mp4'},{status:200,body:mp4,contentType:'application/json'},{status:200,body:Buffer.from('#EXTM3U'),contentType:'application/vnd.apple.mpegurl'}])await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'page-or-video',lookup:publicLookup,transport:async()=>result}),/MATERIAL_/);
 let reads=0;await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'page-or-video',lookup:publicLookup,transport:async()=>{reads++;return{status:302,location:'https://127.0.0.1/private.mp4'}}}),/公开/);assert.equal(reads,1);
});

test('an explicit extensionless public media endpoint is recognized from validated response bytes',async t=>{
 const f=fixture(t),url='https://cdn.example.org/public?id=clip';const r=await discoverMaterials({...f,candidate_sources:[{url,kind:'video'}]},{read:async(url,{kind})=>({...response(url,'video',mp4),detected_kind:'video'}),inspect:()=>technical});assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].url,url);assert.equal(r.candidates[0].kind,'video');
});

test('default and researched source sets keep independent byte-checked resumable cache indexes across scheduled budget slices',async t=>{
 const f=fixture(t),watch='https://official.example.org/pv',clip='https://cdn.example.org/pv.mp4',calls=[],opts={read:async(url,{kind})=>{calls.push(url);return url===watch?response(url,'document',Buffer.from('<html><title>Public PV</title><video src="'+clip+'"></video></html>')):response(url,'video',mp4)},inspect:()=>technical,now:()=> '2026-10-20T10:00:00.000Z'};
 const a=await discoverMaterials(f,opts),b=await discoverMaterials({...f,candidate_sources:[{url:watch,kind:'video'}]},opts);assert.notEqual(a.input_hash,b.input_hash);assert.equal(calls.length,2);
 const a2=await discoverMaterials(f,opts),b2=await discoverMaterials({...f,candidate_sources:[{url:watch,kind:'video'}]},opts);assert.equal(a2.cached,true);assert.equal(b2.cached,true);assert.equal(a2.attempt_file,a.attempt_file);assert.equal(b2.attempt_file,b.attempt_file);assert.equal(calls.length,2,'resuming either phase does not repeat network acquisition');
 for(const r of [a,b]){const pointer=JSON.parse(fs.readFileSync(path.join(f.jobRoot,'material-acquisition',r.input_hash,'latest.json')));assert.equal(pointer.sha256,sha(fs.readFileSync(pointer.attempt_file)));assert.equal(pointer.attempt_file,r.attempt_file);}
 const source=b.checked_sources.find(s=>s.url===watch);fs.writeFileSync(source.file,'SYNTHETIC altered public page');await assert.rejects(()=>discoverMaterials({...f,candidate_sources:[{url:watch,kind:'video'}]},opts),/MATERIAL_ACQUISITION_CACHE_CHANGED/);assert.equal(calls.length,2,'changed cached evidence cannot authorize another download');assert.equal((await discoverMaterials(f,opts)).cached,true,'changed B evidence never invalidates unrelated exact A cache');
 f.job.review_note='SYNTHETIC new actual owner direction';const changed=await discoverMaterials(f,opts);assert.notEqual(changed.input_hash,a.input_hash);assert.equal(changed.cached,false,'new owner feedback still invalidates the relevant prior input');
});

test('actual frozen article yields bounded original video, probe and frame without satisfying any action',async t=>{
 const f=fixture(t,{html:article('<video><source type="video/mp4" src="https://media.example.org/lesson.mp4"></video>')}),calls=[];
 const r=await discoverMaterials(f,{read:async(url,{kind})=>{calls.push({url,kind});return response(url,kind,mp4)},inspect:()=>technical,now:()=> '2026-10-20T10:00:00.000Z'});
 assert.equal(r.status,'candidates-found');assert.equal(r.candidates.length,1);assert.equal(r.new_paid_calls,0);assert.equal(r.semantic_approval,false);assert.equal(r.requirements[0].satisfied,false);assert.equal(r.candidates[0].satisfies_requirements,false);assert.equal(r.candidates[0].semantic_verification,'pending-exact-segment-review');assert.equal(r.candidates[0].source_url,sourceUrl);assert.deepEqual(calls,[{url:'https://media.example.org/lesson.mp4',kind:'video'}]);
 assert.equal(sha(fs.readFileSync(r.candidates[0].file)),sha(mp4));assert.equal(sha(fs.readFileSync(r.candidates[0].frame.file)),sha(png));assert.equal(sha(fs.readFileSync(r.attempt_file)),r.sha256);assert.equal(fs.statSync(r.attempt_file).size,r.size_bytes);assert.ok(path.isAbsolute(r.attempt_file));assert.ok(r.attempt_file.includes(path.join(ID,'revision-1','material-acquisition')));assert.ok(r.missing.length);assert.equal(r.checked_sources[0].origin,'approved-frozen-complete-source');
});

test('missing real case produces persisted checked URLs and an exact next step, never a generated substitute',async t=>{
 const f=fixture(t),r=await discoverMaterials(f,{read:()=>{throw Error('Frozen source must avoid network')},now:()=> '2026-10-20T10:00:00.000Z'});
 assert.equal(r.status,'missing');assert.deepEqual(r.candidates,[]);assert.equal(r.checked_sources[0].url,sourceUrl);assert.equal(r.requirements[0].visual,JSON.parse(f.job.drafts[0].content).storyboard[0].visual);assert.match(r.next_steps[0],/系统.*继续检索/);assert.equal(fs.existsSync(path.join(f.jobRoot,'ready.json')),false);assert.equal(r.publication_authorized,false);
});

test('stable cached observation survives elapsed TTL while a changed bound manifest creates a new input',async t=>{
 const f=fixture(t,{related_urls:['https://official.example.org/case']}),calls=[];let stamp='2026-10-20T10:00:00.000Z';const options={read:async(url,{kind})=>{calls.push(url);return response(url,kind,Buffer.from(article()))},inspect:()=>technical,now:()=>stamp};
 const first=await discoverMaterials(f,options);assert.equal(calls.length,1);stamp='2026-10-20T10:15:00.000Z';const second=await discoverMaterials(f,options);assert.equal(second.cached,true);assert.equal(second.observed_at,first.observed_at);assert.equal(second.attempt_file,first.attempt_file);assert.equal(calls.length,1);
 fs.writeFileSync(path.join(f.jobRoot,'materials-manifest.json'),JSON.stringify({job_id:ID,binding:f.binding,candidate_sources:[{url:'https://media.example.org/new.mp4',kind:'video'}]}));const third=await discoverMaterials(f,{...options,read:async(url,{kind})=>{calls.push(url);return response(url,kind,kind==='video'?mp4:Buffer.from(article()))}});assert.equal(third.cached,false);assert.notEqual(third.input_hash,first.input_hash);assert.equal(third.observed_at,stamp);assert.equal(third.candidates.length,1);
 stamp='2026-10-20T13:00:00.000Z';const count=calls.length,expired=await discoverMaterials(f,options);assert.equal(expired.cached,true);assert.equal(expired.observed_at,third.observed_at);assert.equal(expired.attempt_file,third.attempt_file);assert.equal(calls.length,count,'time alone does not reread completed evidence or claim it was refreshed');
});

test('changed cached media is not reused as a byte-verified candidate',async t=>{
 const f=fixture(t,{html:article('<video src="https://media.example.org/lesson.mp4"></video>')});let reads=0;const opts={read:async(url,{kind})=>{reads++;return response(url,kind,mp4)},inspect:()=>technical,now:()=> '2026-10-20T10:00:00.000Z'},first=await discoverMaterials(f,opts);fs.writeFileSync(first.candidates[0].file,'changed');await assert.rejects(()=>discoverMaterials(f,opts),/MATERIAL_ACQUISITION_CACHE_CHANGED/);assert.equal(reads,1,'tampering never falls through into a replacement network result');
});

test('completed original bytes, source gaps and observation time remain reusable days later with zero new reads or probes',async t=>{
 const f=fixture(t,{html:article('<video src="https://media.example.org/lesson.mp4"></video>')});let reads=0,probes=0,stamp='2026-10-20T10:00:00.000Z';
 const opts={read:async(url,{kind})=>{reads++;return response(url,kind,mp4)},inspect:()=>{probes++;return technical},now:()=>stamp};
 const first=await discoverMaterials(f,opts),original=fs.readFileSync(first.attempt_file);stamp='2026-10-25T10:00:00.000Z';const later=await discoverMaterials(f,opts);
 assert.equal(reads,1);assert.equal(probes,1);assert.equal(later.cached,true);assert.equal(later.attempt_file,first.attempt_file);assert.deepEqual(later.missing,first.missing);assert.deepEqual(later.checked_sources,first.checked_sources);assert.equal(later.observed_at,first.observed_at);assert.deepEqual(fs.readFileSync(first.attempt_file),original);assert.equal(later.quality_approved,false);
});

test('the exact predecessor cache is adopted only through its recomputed complete input identity',async t=>{
 const f=fixture(t,{html:article('<video src="https://media.example.org/lesson.mp4"></video>')});let reads=0,stamp='2026-10-20T10:00:00.000Z';
 const opts={read:async(url,{kind})=>{reads++;return response(url,kind,mp4)},inspect:()=>technical,now:()=>stamp},first=await discoverMaterials(f,opts),a=JSON.parse(fs.readFileSync(first.attempt_file));
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),legacy='68bac4e87d6f008e4267b431cbeda40d31d70850b2162cdd4af6655668fffe78';
 const hash=sha(canonical({schema:a.schema,implementation_sha256:legacy,binding:f.binding,source_snapshot_sha256:sha(f.job.source_snapshot),frozen_sha256:sha(f.html),draft_sha256:f.job.approved_hash,owner_feedback_sha256:sha(''),sources:[{url:sourceUrl,kind:'document',basis:'current-approved-source'}],manifests:[],policy:a.budget.policy}));
 a.input_hash=hash;a.implementation_sha256=legacy;const bytes=Buffer.from(JSON.stringify(a)),pointer={input_hash:hash,attempt_file:first.attempt_file,sha256:sha(bytes),size_bytes:bytes.length,observed_at:a.observed_at};fs.writeFileSync(first.attempt_file,bytes);fs.mkdirSync(path.join(f.jobRoot,'material-acquisition',hash),{recursive:true});fs.writeFileSync(path.join(f.jobRoot,'material-acquisition',hash,'latest.json'),JSON.stringify(pointer));fs.unlinkSync(path.join(f.jobRoot,'material-acquisition',first.input_hash,'latest.json'));
 stamp='2026-10-25T10:00:00.000Z';const resumed=await discoverMaterials(f,opts);assert.equal(resumed.cached,true);assert.equal(resumed.input_hash,hash);assert.equal(reads,1);assert.deepEqual(fs.readFileSync(first.attempt_file),bytes);
 f.job.review_note='SYNTHETIC genuinely new direction';const changed=await discoverMaterials(f,opts);assert.equal(changed.cached,false);assert.notEqual(changed.input_hash,hash);assert.equal(reads,2);
});

test('an old transient-network-only cache is retried once after the transport implementation changes',async t=>{
 const f=fixture(t,{html:article('<video src="https://media.example.org/lesson.mp4"></video>')});let reads=0,ok=false;
 const opts={read:async(url,kind)=>{reads++;if(!ok)throw Object.assign(Error('ECONNRESET'),{code:'ECONNRESET'});return response(url,'video',mp4)},inspect:()=>technical,now:()=> '2026-10-25T10:00:00.000Z'};
 const first=await discoverMaterials(f,opts),a=JSON.parse(fs.readFileSync(first.attempt_file)),canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),legacy='68bac4e87d6f008e4267b431cbeda40d31d70850b2162cdd4af6655668fffe78';
 const hash=sha(canonical({schema:a.schema,implementation_sha256:legacy,binding:f.binding,source_snapshot_sha256:sha(f.job.source_snapshot),frozen_sha256:sha(f.html),draft_sha256:f.job.approved_hash,owner_feedback_sha256:sha(''),sources:[{url:sourceUrl,kind:'document',basis:'current-approved-source'}],manifests:[],policy:a.budget.policy}));
 a.input_hash=hash;a.implementation_sha256=legacy;a.resume_state.pending_sources=[];const bytes=Buffer.from(JSON.stringify(a)),pointer={input_hash:hash,attempt_file:first.attempt_file,sha256:sha(bytes),size_bytes:bytes.length,observed_at:a.observed_at};fs.writeFileSync(first.attempt_file,bytes);fs.mkdirSync(path.join(f.jobRoot,'material-acquisition',hash),{recursive:true});fs.writeFileSync(path.join(f.jobRoot,'material-acquisition',hash,'latest.json'),JSON.stringify(pointer));fs.writeFileSync(path.join(f.jobRoot,'material-acquisition','latest.json'),JSON.stringify(pointer));fs.unlinkSync(path.join(f.jobRoot,'material-acquisition',first.input_hash,'latest.json'));
 ok=true;const next=await discoverMaterials(f,opts);assert.equal(next.cached,false);assert.equal(next.candidates.length,1);assert.equal(reads,2);assert.deepEqual(fs.readFileSync(first.attempt_file),bytes,'old result and original failure remain intact');
 const later=await discoverMaterials(f,opts);assert.equal(later.cached,true);assert.equal(reads,2,'unchanged new acquisition is reused');
});

test('expired pending acquisition resumes finitely and does not replay completed reads',async t=>{
 const urls=Array.from({length:6},(_,n)=>'https://media.example.org/pending-'+n+'.mp4'),f=fixture(t,{html:article(urls.map(url=>'<video src="'+url+'"></video>').join(''))}),reads=[];let stamp='2026-10-20T10:00:00.000Z';
 const opts={read:async(url,{kind})=>{reads.push(url);if(urls.indexOf(url)<3)throw Error('MATERIAL_DEADLINE');return response(url,kind,mp4)},inspect:()=>technical,now:()=>stamp};
 const first=await discoverMaterials(f,opts);stamp='2026-10-25T10:00:00.000Z';const second=await discoverMaterials(f,opts);assert.equal(second.discovery_progress.pass_count,2);assert.equal(second.input_hash,first.input_hash);assert.deepEqual(reads,urls);assert.equal(JSON.parse(fs.readFileSync(second.attempt_file)).resume_state.previous_attempt_sha256,first.sha256);
 stamp='2026-11-25T10:00:00.000Z';const finished=await discoverMaterials(f,opts);assert.equal(finished.cached,true);assert.equal(reads.length,6);
});

test('temporary failures can recover in a later pass without replaying successful media',async t=>{
 const urls=Array.from({length:4},(_,n)=>'https://media.example.org/exhausted-'+n+'.mp4'),f=fixture(t,{html:article(urls.map(url=>'<video src="'+url+'"></video>').join(''))}),reads=[];let day=20;
 let recovered=false;const opts={read:async url=>{reads.push(url);if(!recovered)throw Error('MATERIAL_DEADLINE');return response(url,'video',mp4)},inspect:()=>technical,now:()=>new Date(Date.UTC(2026,9,day,10)).toISOString(),bounds:{media:1}};
 let result;for(let n=0;n<6;n++){result=await discoverMaterials(f,opts);day++;}assert.equal(result.discovery_progress.pass_count,6);assert.equal(reads.length,6);
 recovered=true;result=await discoverMaterials(f,opts);assert.equal(result.cached,false);assert.equal(result.candidates.length,1);assert.equal(reads.length,7);day++;const reused=await discoverMaterials(f,opts);assert.equal(reused.cached,true);assert.equal(reads.length,7);
});

test('job, approved draft, source milestone, frozen source and manifest mutations reject before any network read',async t=>{
 for(const mutation of [f=>{f.binding.script_hash='b'.repeat(64)},f=>{f.job.drafts[0].content+=' '},f=>{f.job.milestones[0].status='rejected'},f=>{f.job.media_continuation.scope.owner_confirmed=false},f=>{fs.writeFileSync(path.join(f.frozen,'source.txt'),'changed')},f=>{fs.mkdirSync(f.jobRoot,{recursive:true});fs.writeFileSync(path.join(f.jobRoot,'materials-manifest.json'),JSON.stringify({job_id:ID,binding:{...f.binding,revision:2}}))}]){
  const f=fixture(t);mutation(f);let reads=0;await assert.rejects(()=>discoverMaterials(f,{read:()=>{reads++;throw Error('Forbidden')}}),/MATERIAL_/);assert.equal(reads,0);
 }
});

test('private and mixed DNS answers and private redirect destinations are rejected without transport access',async()=>{
 for(const lookup of [async()=>[{address:'127.0.0.1',family:4}],async()=>[{address:'93.184.216.34',family:4},{address:'10.1.2.3',family:4}]]){let reads=0;await assert.rejects(()=>readPublicMaterial(sourceUrl,{lookup,transport:()=>{reads++;throw Error('Forbidden')}}),/非公开/);assert.equal(reads,0)}
 let reads=0;await assert.rejects(()=>readPublicMaterial(sourceUrl,{lookup:publicLookup,transport:async()=>{reads++;return{status:302,location:'https://127.0.0.1/internal'}}}),/公开/);assert.equal(reads,1);
 reads=0;await assert.rejects(()=>readPublicMaterial(sourceUrl,{lookup:async name=>name==='private.example.org'?[{address:'192.168.1.2',family:4}]:publicLookup(),transport:async()=>{reads++;return{status:302,location:'https://private.example.org/secret'}}}),/非公开/);assert.equal(reads,1);
});

test('redirect DNS is independently pinned and video MIME/signature/size bounds reject fabricated media',async()=>{
 const pins=[],r=await readPublicMaterial('https://source.example.org/video',{kind:'video',lookup:async name=>[{address:name==='cdn.example.org'?'93.184.216.35':'93.184.216.34',family:4}],transport:async(url,address)=>{pins.push([url.hostname,address]);return url.hostname==='source.example.org'?{status:302,location:'https://cdn.example.org/original.mp4'}:{status:200,body:mp4,contentType:'video/mp4'}}});assert.equal(r.sha256,sha(mp4));assert.deepEqual(pins,[['source.example.org','93.184.216.34'],['cdn.example.org','93.184.216.35']]);
 for(const response of [{status:200,body:mp4,contentType:'audio/mp4'},{status:200,body:Buffer.from('SYNTHETIC fake video'),contentType:'video/mp4'},{status:200,body:mp4,contentType:'video/mp4',contentEncoding:'gzip'}])await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'video',lookup:publicLookup,transport:async()=>response}),/MATERIAL_/);
 await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'video',maxBytes:12,lookup:publicLookup,transport:async()=>({status:200,body:mp4,contentType:'video/mp4'})}),/MATERIAL_RESPONSE_INVALID/);
});

test('bounded documents/media and real reader errors leave precise diagnostic attempts instead of success',async t=>{
 const f=fixture(t,{related_urls:['https://one.example.org/case','https://two.example.org/case']}),read=[];
 const r=await discoverMaterials(f,{read:async url=>{read.push(url);throw Error('SYNTHETIC real HTTP 404')},bounds:{documents:2},now:()=> '2026-10-20T10:00:00.000Z'});assert.deepEqual(read,['https://one.example.org/case']);assert.equal(r.status,'missing');assert.ok(r.checked_sources.some(s=>s.status==='not-read-budget'));assert.ok(r.checked_sources.some(s=>s.status==='unavailable'&&/404/.test(s.error)));
 const small=fixture(t,{html:article('<video src="https://media.example.org/one.mp4"></video><video src="https://media.example.org/two.mp4"></video>')}),one=await discoverMaterials(small,{read:async(url,{kind})=>response(url,kind,mp4),inspect:()=>technical,bounds:{media:1}});assert.equal(one.candidates.length,1);assert.ok(one.checked_sources.some(s=>s.status==='not-read-budget'));
});

test('video originals have priority over photos, and identical bytes from separate URLs remain one candidate',async t=>{
 const f=fixture(t,{html:article('<img src="https://media.example.org/photo.png"><video src="https://media.example.org/one.mp4"></video><video src="https://media.example.org/two.mp4"></video>')}),reads=[];
 const r=await discoverMaterials(f,{read:async(url,{kind})=>{reads.push(url);return response(url,kind,kind==='video'?mp4:png)},inspect:()=>technical,bounds:{media:2}});assert.deepEqual(reads,['https://media.example.org/one.mp4','https://media.example.org/two.mp4']);assert.equal(r.candidates.length,1);assert.deepEqual(r.candidates[0].alternate_urls,['https://media.example.org/two.mp4']);assert.ok(r.checked_sources.some(s=>s.status==='candidate-duplicate-bytes'));
});

test('a partial failed-media budget resumes previously unread public clips instead of caching the first three failures for hours',async t=>{
 const urls=Array.from({length:6},(_,n)=>'https://media.example.org/public-'+n+'.mp4'),f=fixture(t,{html:article(urls.map(url=>'<video src="'+url+'"></video>').join(''))}),calls=[],opts={read:async(url,{kind})=>{calls.push(url);if(urls.indexOf(url)<3)throw Error('MATERIAL_DEADLINE');return response(url,kind,mp4);},inspect:()=>technical,now:()=> '2026-10-20T10:00:00.000Z'};
 const first=await discoverMaterials(f,opts);assert.equal(first.candidates.length,0);assert.deepEqual(calls,urls.slice(0,3));assert.equal(first.discovery_progress.resumable,true);assert.equal(first.discovery_progress.pending_count,6);const firstBytes=fs.readFileSync(first.attempt_file);
 const second=await discoverMaterials(f,opts);assert.equal(second.cached,false);assert.equal(second.input_hash,first.input_hash);assert.equal(second.discovery_progress.pass_count,2);assert.deepEqual(calls.slice(3),urls.slice(3),'unread clips run before bounded retries of failed ones');assert.equal(second.candidates[0].kind,'video');assert.equal(second.candidates[0].source_context.page_title,'SYNTHETIC exact teacher case');assert.equal(second.candidates[0].source_context.claim,'public-page-context-only; exact-work-identity-unverified');assert.deepEqual(fs.readFileSync(first.attempt_file),firstBytes,'the previous partial attempt stays immutable');assert.equal(JSON.parse(fs.readFileSync(second.attempt_file)).resume_state.previous_attempt_sha256,first.sha256);
 const third=await discoverMaterials(f,opts);assert.equal(third.cached,true);assert.equal(third.attempt_file,second.attempt_file);assert.equal(calls.length,6,'a usable byte-verified video does not trigger more acquisition');
});

test('transient failures resume when connectivity recovers while HTTP denials remain terminal',async t=>{
 let recovered=false;const f=fixture(t,{html:article('<video src="https://media.example.org/transient.mp4"></video><video src="https://media.example.org/denied.mp4"></video>')}),calls=[],opts={read:async url=>{calls.push(url);if(recovered&&!url.includes('denied'))return response(url,'video',mp4);const error=Error(url.includes('denied')?'MATERIAL_HTTP_403':'MATERIAL_DEADLINE');error.read_diagnostics=[{phase:'public-https',validated_public_ipv4:'93.184.216.34',...(url.includes('denied')?{status:403}:{error:'ETIMEDOUT'})}];throw error;},inspect:()=>technical,now:()=> '2026-10-20T10:00:00.000Z'};
 const first=await discoverMaterials(f,opts);assert.equal(first.discovery_progress.pending_count,1);assert.equal(first.checked_sources.find(r=>r.url.includes('denied')).transient,false);assert.equal(first.checked_sources.find(r=>r.url.includes('denied')).read_diagnostics[0].status,403);
 const second=await discoverMaterials(f,opts);assert.equal(second.discovery_progress.resumable,false);assert.equal(calls.filter(url=>url.includes('transient')).length,2);assert.equal(calls.filter(url=>url.includes('denied')).length,1);recovered=true;const third=await discoverMaterials(f,opts);assert.equal(third.candidates.length,1);assert.equal(calls.filter(url=>url.includes('transient')).length,3);assert.equal(calls.filter(url=>url.includes('denied')).length,1,'HTTP denial is never retried');assert.equal((await discoverMaterials(f,opts)).cached,true);
});

test('only connectivity errors may try another validated public CDN edge; successful DNS results are reused in a pass',async()=>{
 const dnsCache=new Map(),pins=[];let lookups=0;const lookup=async()=>{lookups++;return [{address:'93.184.216.34',family:4},{address:'93.184.216.35',family:4}]},transport=async(url,address)=>{pins.push(address);if(address.endsWith('.34'))throw Object.assign(Error('SYNTHETIC connection reset'),{code:'ECONNRESET',transport_phase:'tcp-connect'});return{status:200,body:mp4,contentType:'video/mp4'};};
 const first=await readPublicMaterial('https://cdn.example.org/a.mp4',{kind:'video',lookup,transport,dnsCache});assert.equal(first.read_diagnostics[0].validated_public_ipv4,'93.184.216.34');assert.equal(first.read_diagnostics[0].error,'ECONNRESET');assert.equal(first.read_diagnostics[1].validated_public_ipv4,'93.184.216.35');await readPublicMaterial('https://cdn.example.org/b.mp4',{kind:'video',lookup,transport,dnsCache});assert.equal(lookups,1);assert.deepEqual(pins,['93.184.216.34','93.184.216.35','93.184.216.35']);
 let reads=0;await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'video',lookup,transport:async()=>{reads++;throw Error('MATERIAL_HTTP_403')}}),error=>{assert.equal(error.read_diagnostics.length,1);return /HTTP_403/.test(error.message)});assert.equal(reads,1,'HTTP rejection cannot authorize another edge');
 await assert.rejects(()=>readPublicMaterial(sourceUrl,{kind:'video',dnsCache:new Map([['source.example.org',[{address:'127.0.0.1',family:4}]]]),transport:()=>{throw Error('Must not connect')}}),/PUBLIC_DNS_REQUIRED/);
});

test('stalled transports time out and local video inspection uses only file/pipe with real decoded frame',async()=>{
 await assert.rejects(()=>readPublicMaterial(sourceUrl,{lookup:publicLookup,timeoutMs:25,transport:()=>new Promise(()=>{})}),/DEADLINE/);
 const calls=[],r=inspectMaterial('/SYNTHETIC/original.mp4',{run:(command,args,options)=>{calls.push({command,args,options});return command==='ffprobe'?{status:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:1280,height:720,avg_frame_rate:'30/1',codec_name:'h264'}],format:{duration:'12'}})}:{status:0,stdout:png}}});assert.equal(r.probe.duration_seconds,12);assert.equal(calls.length,2);for(const c of calls){assert.equal(c.options.windowsHide,true);assert.equal(c.args[c.args.indexOf('-protocol_whitelist')+1],'file,pipe');assert.ok(c.options.timeout<=10000)}
 assert.throws(()=>inspectMaterial('/SYNTHETIC/audio.mp4',{run:()=>({status:0,stdout:JSON.stringify({streams:[{codec_type:'audio'}],format:{duration:12}})})}),/MATERIAL_PROBE_INVALID/);
});
