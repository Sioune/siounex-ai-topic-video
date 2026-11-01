// Pure copy rules and synthetic SQLite receipts. Never runs an executor, model, browser or paid API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import guide from '../production/platform-publishing-guide.json' with {type:'json'};
import * as contentApi from '../lib/promo-content.mts';

const sha=v=>createHash('sha256').update(v).digest('hex');
const OWNER='SYNTHETIC-owner',JOB='SYNTHETIC-job';
const labels=['微信视频号','抖音','哔哩哔哩','快手','小红书'];
const section=(label,i)=>`## ${label}\n标题：SYNTHETIC ${label}标题\n\n简介：SYNTHETIC ${label}叙事，只依据已冻结来源中的模拟展示。\n\n标签：#AI工具 #实践${i}\n\n编辑依据：SYNTHETIC INTERNAL ${label}取舍依据；分类和声明待真实控件核对，不是公开正文。`;
function sample(){return {recommended_title:'SYNTHETIC 微信视频号标题',alternate_titles:['SYNTHETIC 备选1','SYNTHETIC 备选2'],description:'SYNTHETIC 微信视频号叙事，只依据已冻结来源中的模拟展示。',cross_platform_description:labels.map(section).join('\n\n'),hashtags:['AI工具','实践0'],pinned_comment:'SYNTHETIC 你会如何使用？',cover_title:'SYNTHETIC 封面标题',cover_subtitle:'',moments_copy:'SYNTHETIC 分享当前真实内容',editorial_notes:'SYNTHETIC INTERNAL global candidate notes'};}
function platformTags(content,label,tags){const index=labels.indexOf(label),before=section(label,index);assert.ok(content.cross_platform_description.includes(before));content.cross_platform_description=content.cross_platform_description.replace(before,before.replace(/标签：[^\n]+/u,'标签：'+tags.map(tag=>'#'+tag).join(' ')));if(label==='微信视频号')content.hashtags=[...tags];return content;}
function legacy(){return {...sample(),cross_platform_description:'旧式通用正文，仅用于历史兼容；不代表平台独立专稿。'};}

const bundle=await build({stdin:{contents:"export * from './lib/promo-packages.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'synthetic-promo-generation',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic'}));b.onResolve({filter:/^\.\/production$/},()=>({path:'production',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},a=>({contents:a.path==='store'?'export function db(){return globalThis.__promoGeneration.db}':`export async function getJob(id,owner){const f=globalThis.__promoGeneration;if(id!==f.job.id||(owner&&owner!==f.owner))throw Error('SYNTHETIC owner mismatch');return structuredClone(f.job)}`}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const at=new Date().toISOString(),draft=JSON.stringify({script:'SYNTHETIC facts: one official simulated demo, no owner experience.',materials:'SYNTHETIC source',limits:'SYNTHETIC simulation only'}),hash=sha(draft);
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk) VALUES ('SYNTHETIC-topic','https://synthetic.invalid/','synthetic','synthetic','SYNTHETIC','SYNTHETIC','s',?,'AI实用',1,'m','h','a','m','r')").run(at);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,mode_epoch,created_at,updated_at) VALUES (?,'SYNTHETIC-topic',?,1,'approved','{}','{}','SYNTHETIC',1,1,?,0,?,?)").run(JOB,OWNER,hash,at,at);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,1,'SYNTHETIC-draft',?,?,'SYNTHETIC',?)").run(JOB,draft,hash,at);
 const job={id:JOB,status:'approved',revision:1,mode_epoch:0,updated_at:at,source_snapshot:JSON.stringify({facts:['SYNTHETIC official simulation only']}),skill_snapshot:JSON.stringify({sha256:'e'.repeat(64)}),drafts:[{revision:1,content:draft,content_hash:hash}],reviews:[],milestones:[]};
 const observedReads=[];class Statement{constructor(q,args=[]){this.q=q;this.args=args}bind(...args){return new Statement(this.q,args)}async first(){return sql.prepare(this.q).get(...this.args)||null}async all(){const results=sql.prepare(this.q).all(...this.args);observedReads.push({query:this.q,bytes:Buffer.byteLength(JSON.stringify(results))});return {results}}async run(){return {meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}}}}
 const f={sql,job,owner:OWNER,observedReads,db:{prepare:q=>new Statement(q)}};globalThis.__promoGeneration=f;t.after(()=>{sql.close();delete globalThis.__promoGeneration;});
 f.queue=async(request='SYNTHETIC-request')=>(await api.requestPromo(JOB,OWNER,request)).package;
 f.row=id=>sql.prepare('SELECT * FROM production_promo_packages WHERE id=?').get(id);
 f.receipt=(p,content)=>{const bound=JSON.parse(p.input_snapshot).publishing_policy,c=JSON.stringify(contentApi.validateGeneratedPromoContent(content));return {model:'gpt-5.6-sol',exit_code:0,input_sha256:sha(p.input_snapshot),content_sha256:sha(c),prompt_sha256:'f'.repeat(64),publishing_policy_version:bound.version,publishing_policy_sha256:bound.content_sha256,copy_format:contentApi.GENERATED_PROMO_FORMAT,copy_parser_version:contentApi.PROMO_COPY_PARSER_VERSION,paid_media_calls:0,publication:false};};
 return f;
}

test('history view omits unused snapshots but preserves versions, owner scope and unknown outcome',async t=>{
 const f=fixture(t),empty=await api.listPromos(JOB,OWNER,{historySummary:true});assert.deepEqual(empty.packages,[]);assert.ok(empty.current_binding);assert.equal('input_snapshot' in empty.current_binding,false);
 const p=await f.queue(),snapshot=JSON.parse(p.input_snapshot);snapshot.synthetic_large_context='X'.repeat(300000);f.sql.prepare("UPDATE production_promo_packages SET input_snapshot=?,status='failed',error='SYNTHETIC unknown outcome' WHERE id=?").run(JSON.stringify(snapshot),p.id);
 f.job.mode_epoch=1;const full=await api.listPromos(JOB,OWNER),summary=await api.listPromos(JOB,OWNER,{historySummary:true});
 assert.equal(full.packages.length,1);assert.equal(full.packages[0].is_current,false);assert.equal(full.packages[0].retry_state.result_unknown,true);assert.equal(typeof full.packages[0].input_snapshot,'string');assert.ok(full.current_binding.input_snapshot);
 const {input_snapshot:ignored,...expected}=full.packages[0],{input_snapshot:ignoredBinding,...expectedBinding}=full.current_binding;assert.deepEqual(summary.packages,[expected]);assert.deepEqual(summary.current_binding,expectedBinding);assert.ok(JSON.stringify(summary).length<JSON.stringify(full).length/10);
 await assert.rejects(()=>api.listPromos(JOB,'SYNTHETIC-other-owner',{historySummary:true}),/owner mismatch/);
});

test('history SQL omits bulky source fields while preserving status and original archive',async t=>{
 const f=fixture(t),p=await f.queue(),snapshot=JSON.parse(p.input_snapshot);
 snapshot.source={facts:['X'.repeat(300000)]};snapshot.draft={script:'Y'.repeat(100000)};snapshot.skill={content:'Z'.repeat(100000)};snapshot.video={note:'W'.repeat(100000)};
 const saved=JSON.stringify(snapshot);f.sql.prepare("UPDATE production_promo_packages SET input_snapshot=?,status='failed',error='SYNTHETIC unknown outcome' WHERE id=?").run(saved,p.id);
 f.observedReads.length=0;const full=await api.listPromos(JOB,OWNER);const fullRead=f.observedReads.find(x=>x.query.includes('FROM production_promo_packages WHERE job_id='));
 f.observedReads.length=0;const summary=await api.listPromos(JOB,OWNER,{historySummary:true});const liteRead=f.observedReads.find(x=>x.query.includes('FROM production_promo_packages WHERE job_id='));
 const {input_snapshot:ignored,...expected}=full.packages[0];assert.deepEqual(summary.packages,[expected]);assert.equal(f.row(p.id).input_snapshot,saved);assert.ok(fullRead.bytes>600000);assert.ok(liteRead.bytes<fullRead.bytes/10);
});

test('history projection preserves legacy missing fields and malformed input failures',async t=>{
 const f=fixture(t),p=await f.queue(),snapshot=JSON.parse(p.input_snapshot);delete snapshot.mode_epoch;delete snapshot.contract_hash;delete snapshot.publishing_policy;
 f.sql.prepare('UPDATE production_promo_packages SET input_snapshot=? WHERE id=?').run(JSON.stringify(snapshot),p.id);
 const full=await api.listPromos(JOB,OWNER),lite=await api.listPromos(JOB,OWNER,{historySummary:true});const {input_snapshot:ignored,...expected}=full.packages[0];assert.deepEqual(lite.packages,[expected]);assert.equal(lite.packages[0].generation_policy,'legacy');
 f.sql.prepare('UPDATE production_promo_packages SET input_snapshot=? WHERE id=?').run('{invalid',p.id);
 let fullError,liteError;try{await api.listPromos(JOB,OWNER)}catch(e){fullError=e}try{await api.listPromos(JOB,OWNER,{historySummary:true})}catch(e){liteError=e}assert.ok(fullError instanceof SyntaxError);assert.ok(liteError instanceof SyntaxError);assert.equal(liteError.message,fullError.message);
});

test('multi-version list reuses one binding and current policy while checking every version',async t=>{
 const f=fixture(t),p=await f.queue(),base=f.row(p.id);f.sql.prepare("UPDATE production_promo_packages SET status='failed',error='SYNTHETIC unknown' WHERE id=?").run(p.id);
 const cols=Object.keys(base),insert=f.sql.prepare('INSERT INTO production_promo_packages ('+cols.map(c=>'"'+c+'"').join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');
 for(let i=2;i<=6;i++){const row={...base,id:'SYNTHETIC-history-'+i,version:i,request_id:'SYNTHETIC-request-'+i,status:'failed',error:'SYNTHETIC unknown'};const snapshot=JSON.parse(row.input_snapshot);if(i===5)delete snapshot.publishing_policy;if(i===6)snapshot.publishing_policy.version='SYNTHETIC-obsolete';if(i===4)snapshot.mode_epoch=999;row.input_snapshot=JSON.stringify(snapshot);insert.run(...cols.map(c=>row[c]));}
 const subtle=crypto.subtle,original=subtle.digest;let calls=0;subtle.digest=function(...args){calls++;return original.apply(this,args)};let result;try{result=await api.listPromos(JOB,OWNER,{historySummary:true})}finally{subtle.digest=original}
 assert.equal(result.packages.length,6);assert.equal(calls,6,'one binding hash, one current-policy hash, and one per valid saved policy');
 const byVersion=new Map(result.packages.map(row=>[row.version,row]));assert.equal(byVersion.get(4).is_current,false);assert.equal(byVersion.get(5).generation_policy,'legacy');assert.equal(byVersion.get(6).generation_policy,'mismatch');for(const row of result.packages)assert.equal(row.retry_state.result_unknown,true);
 const full=await api.listPromos(JOB,OWNER);for(const row of full.packages){const {input_snapshot:ignored,...expected}=row;assert.deepEqual(byVersion.get(row.version),expected)}
});

test('new generated content requires five independent platform sections and retains video-channel compatibility',()=>{
 const c=contentApi.validateGeneratedPromoContent(sample());assert.equal(contentApi.promoContentFormat(c),'five-platform-specific-v1');assert.equal(c.description,sample().description);assert.equal(contentApi.promoContentFormat(legacy()),'legacy');assert.doesNotThrow(()=>contentApi.validatePromoContent(legacy()));
 for(const name of labels){const changed=sample();changed.cross_platform_description=changed.cross_platform_description.replace(new RegExp('## '+name+'[\\s\\S]*?(?=\\n## |$)'),'');assert.throws(()=>contentApi.validateGeneratedPromoContent(changed),/专稿不完整|平台专段/);}
});

test('new Kuaishou generation accepts four topics and rejects five without truncating or reclassifying historical copy',()=>{
 const four=['AI工具','AI兴趣卡','日语学习','实用知识'],accepted=platformTags(sample(),'快手',four),rejected=platformTags(sample(),'快手',[...four,'产品解读']);
 assert.deepEqual(contentApi.validateNewGeneratedPromoContent(accepted),accepted);const before=JSON.stringify(rejected);assert.throws(()=>contentApi.validateNewGeneratedPromoContent(rejected),/快手新生成宣发最多4个.*当前有5个/);assert.equal(JSON.stringify(rejected),before,'rejected output is never silently shortened');
 assert.doesNotThrow(()=>contentApi.validateGeneratedPromoContent(rejected),'historical structural validation is unchanged');assert.equal(contentApi.promoContentFormat(rejected),'five-platform-specific-v1');assert.doesNotThrow(()=>contentApi.validatePromoContent(rejected),'saved/imported/manual content remains readable');
});

test('the Kuaishou topic maximum does not apply to the other four platform strategies',()=>{
 const tags=['AI工具','具体任务','产品解读','使用边界','怎么用好AI'];for(const label of labels.filter(label=>label!=='快手')){const content=platformTags(sample(),label,tags);assert.deepEqual(contentApi.validateNewGeneratedPromoContent(content),content,label+' retains its own topic strategy');}
});

test('a platform may not borrow another title, description or tags and each needs non-public rationale',()=>{
 for(const field of ['标题','简介','标签','编辑依据']){const c=sample();c.cross_platform_description=c.cross_platform_description.replace(new RegExp(field+'：[^\\n]+'),'');assert.throws(()=>contentApi.validateGeneratedPromoContent(c));}
 const duplicate=sample();duplicate.cross_platform_description+='\n\n'+section('抖音',1);assert.throws(()=>contentApi.validateGeneratedPromoContent(duplicate),/不唯一|唯一/);const mismatch=sample();mismatch.description='Different description';assert.throws(()=>contentApi.validateGeneratedPromoContent(mismatch),/description字段/);
 const leaked=sample();leaked.cross_platform_description=leaked.cross_platform_description.replace('SYNTHETIC 抖音叙事，只依据已冻结来源中的模拟展示。','编辑依据：SYNTHETIC private rationale');assert.throws(()=>contentApi.validateGeneratedPromoContent(leaked),/编辑依据混入公开字段/);
 const generic=sample();generic.cross_platform_description=labels.map(label=>`## ${label}\n标题：通用标题\n简介：通用简介\n标签：#同一词\n编辑依据：SYNTHETIC no independent organization`).join('\n\n');generic.recommended_title='通用标题';generic.description='通用简介';generic.hashtags=['同一词'];assert.throws(()=>contentApi.validateGeneratedPromoContent(generic),/通用稿复制/);
});

test('editorial rationale stays out of public downloads and parser-selected public fields',()=>{
 const c=sample(),text=contentApi.promoPublicText(c);assert.ok(text.includes('抖音叙事'));assert.doesNotMatch(text,/INTERNAL|编辑依据：|编辑备注（/);assert.ok(text.includes('小红书'));assert.ok(text.includes('#实践4'));const old=legacy();old.cross_platform_description+='\n编辑依据：SYNTHETIC INTERNAL old\nold private second line';assert.doesNotMatch(contentApi.promoPublicText(old),/INTERNAL|private second/);
});

test('prompt is deterministic and binds five-platform editing to the real source and versioned strategy',()=>{
 const snapshot=JSON.stringify({source:{fact:'SYNTHETIC simulation'},draft:{script:'SYNTHETIC exact script'}}),prompt=contentApi.buildPromoGenerationPrompt(snapshot,'SYNTHETIC frozen skill',guide);assert.equal(prompt,contentApi.buildPromoGenerationPrompt(snapshot,'SYNTHETIC frozen skill',guide));assert.ok(prompt.includes(guide.strategy_version));assert.ok(prompt.includes(contentApi.canonicalPromoPolicy(guide)));assert.ok(prompt.includes(snapshot));for(const name of labels)assert.ok(prompt.includes('## '+name));for(const rule of ['禁止通用稿替代','随机换同义词','不编功能','不声称自己已观看','不得承诺推流','非公开字段'])assert.ok(prompt.includes(rule));assert.equal(contentApi.canonicalPromoPolicy({b:2,a:1}),contentApi.canonicalPromoPolicy({a:1,b:2}));
});
test('future prompt distinguishes the current exact material summary from obsolete draft pending notes without claiming a viewing',()=>{const old=JSON.stringify({draft:{script:'current exact narration',materials:'旧会场图待补'},video:{sha256:'a'.repeat(64)}}),summary={video_sha256:'a'.repeat(64),project_sha256:'b'.repeat(64),materials:[{kind:'image',visible_content:'真实课件页面静态截图'}]},p=contentApi.buildPromoGenerationPrompt(old,'frozen skill',guide,summary);assert.ok(p.includes('不能直接当成当前成片事实'));assert.ok(p.includes('真实课件页面静态截图'));assert.ok(p.includes('不代表你已观看'));assert.notEqual(p,contentApi.buildLegacyPromoGenerationPrompt(old,'frozen skill',guide));assert.ok(contentApi.buildLegacyPromoGenerationPrompt(old,'frozen skill',guide).endsWith(old));});

test('the current generation policy and prompt explicitly bind the observed Kuaishou four-topic limit',()=>{
 assert.equal(guide.generation_contract.platform_limits.kuaishou.max_tags,contentApi.NEW_PROMO_KUAISHOU_MAX_TAGS);const prompt=contentApi.buildPromoGenerationPrompt('{}','SYNTHETIC frozen skill',guide);assert.ok(prompt.includes('快手最多4个有效相关话题'));assert.ok(prompt.includes('其他平台分别遵循本平台策略，不套用快手数量上限'));assert.ok(prompt.includes('不输出超量后交给发布器截断'));
});

test('queued requests freeze exact policy content/hash and one request cannot start two model claims',async t=>{
 const f=fixture(t),p=await f.queue(),snapshot=JSON.parse(p.input_snapshot),policy=snapshot.publishing_policy;assert.equal(policy.version,guide.strategy_version);assert.deepEqual(policy.content,guide);assert.equal(policy.content_sha256,sha(contentApi.canonicalPromoPolicy(guide)));assert.deepEqual(snapshot.source,{facts:['SYNTHETIC official simulation only']});const original=p.input_snapshot;assert.equal((await api.requestPromo(JOB,OWNER,'SYNTHETIC-request')).replayed,true);const claim=await api.claimPromo(p.id,'SYNTHETIC-invocation');assert.equal(claim.package.input_snapshot,original);assert.ok(claim.lease_token);await assert.rejects(()=>api.claimPromo(p.id,'SYNTHETIC-duplicate'),/禁止重复/);
});

test('legacy or tampered policy snapshots cannot claim or complete new AI generations',async t=>{
 for(const kind of ['missing','hash','content']){const f=fixture(t),p=await f.queue(),input=JSON.parse(p.input_snapshot);if(kind==='missing')delete input.publishing_policy;else if(kind==='hash')input.publishing_policy.content_sha256='0'.repeat(64);else input.publishing_policy.content.strategy_version='SYNTHETIC-tampered';f.sql.prepare('UPDATE production_promo_packages SET input_snapshot=? WHERE id=?').run(JSON.stringify(input),p.id);await assert.rejects(()=>api.claimPromo(p.id,'SYNTHETIC-no-call'),/旧式|策略/);assert.equal(f.row(p.id).status,'queued');}
 const f=fixture(t),p=await f.queue(),claim=await api.claimPromo(p.id,'SYNTHETIC-claimed'),receipt=f.receipt(p,sample()),snapshot=JSON.parse(p.input_snapshot);snapshot.publishing_policy.version='SYNTHETIC-drift-after-claim';f.sql.prepare('UPDATE production_promo_packages SET input_snapshot=? WHERE id=?').run(JSON.stringify(snapshot),p.id);await assert.rejects(()=>api.completePromo(p.id,claim.lease_token,sample(),receipt),/旧式|策略/);assert.equal(f.row(p.id).status,'running');assert.equal(f.row(p.id).content,null);
});

test('new AI completion requires all platform copy and a matching policy/parser receipt without changing the original job',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT * FROM production_jobs').all(),p=await f.queue(),claim=await api.claimPromo(p.id,'SYNTHETIC-invocation'),c=sample(),receipt=f.receipt(p,c);await assert.rejects(()=>api.completePromo(p.id,claim.lease_token,legacy(),receipt),/专稿不完整/);
 for(const key of ['publishing_policy_version','publishing_policy_sha256','copy_format','copy_parser_version']){const bad={...receipt};delete bad[key];await assert.rejects(()=>api.completePromo(p.id,claim.lease_token,c,bad),/五平台策略/);assert.equal(f.row(p.id).status,'running');}
 const done=await api.completePromo(p.id,claim.lease_token,c,receipt);assert.equal(done.package.status,'ready');assert.equal(JSON.parse(done.package.receipt).copy_format,'five-platform-specific-v1');assert.equal((await api.completePromo(p.id,claim.lease_token,c,receipt)).replayed,true);assert.deepEqual(f.sql.prepare('SELECT * FROM production_jobs').all(),before);
});

test('the completion boundary rejects five Kuaishou topics and can accept four under the same valid generation claim',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT * FROM production_jobs').all(),p=await f.queue(),claim=await api.claimPromo(p.id,'SYNTHETIC-limit-claim'),four=['AI工具','AI兴趣卡','日语学习','实用知识'],tooMany=platformTags(sample(),'快手',[...four,'产品解读']);
 await assert.rejects(()=>api.completePromo(p.id,claim.lease_token,tooMany,f.receipt(p,tooMany)),/快手新生成宣发最多4个/);assert.equal(f.row(p.id).status,'running');assert.equal(f.row(p.id).content,null);const current=platformTags(sample(),'快手',four),done=await api.completePromo(p.id,claim.lease_token,current,f.receipt(p,current));assert.equal(done.package.status,'ready');assert.deepEqual(JSON.parse(done.package.content),current);assert.deepEqual(f.sql.prepare('SELECT * FROM production_jobs').all(),before);
});

test('an expired generation lease returns 409 and leaves its exact stored request unchanged',async t=>{
 const f=fixture(t),p=await f.queue(),claim=await api.claimPromo(p.id,'SYNTHETIC-expired-claim'),content=sample(),receipt=f.receipt(p,content);f.sql.prepare('UPDATE production_promo_packages SET lease_until=? WHERE id=?').run(Date.now()-1,p.id);const before=f.row(p.id);
 await assert.rejects(()=>api.completePromo(p.id,claim.lease_token,content,receipt),error=>error.status===409&&/宣发租约失效/u.test(error.message));assert.deepEqual(f.row(p.id),before);assert.equal(f.row(p.id).status,'running');assert.equal(f.row(p.id).content,null);
});

test('legacy imports and edits remain readable, explicitly legacy, and never become new AI completion',async t=>{
 const f=fixture(t),binding=(await api.listPromos(JOB,OWNER)).current_binding,c=legacy(),p=(await api.importPromo(JOB,'SYNTHETIC-import',c,binding,{library_file_id:'SYNTHETIC-library',file_id:'SYNTHETIC-file',library_version:1,sha256:'a'.repeat(64)})).package;assert.equal(JSON.parse(p.receipt).copy_format,'legacy');const edit=(await api.editPromo(JOB,OWNER,p.id,p.content_hash,'SYNTHETIC-edit',{...c,pinned_comment:'SYNTHETIC updated human comment'})).package;assert.equal(JSON.parse(edit.receipt).copy_format,'legacy');const list=await api.listPromos(JOB,OWNER);assert.ok(list.packages.every(row=>row.copy_format==='legacy'));assert.equal((await api.downloadPromo(JOB,OWNER,edit.id)).package.content_hash,edit.content_hash);await assert.rejects(()=>api.claimPromo(edit.id,'SYNTHETIC-not-a-new-generation'),/禁止重复/);
});
