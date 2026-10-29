// Pure extraction tests. Archived text fixtures are real public sections with internal facts sanitized.
// Synthetic platform-specific examples do not represent approved copy or an actual platform publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PUBLISHING_COPY_PARSER_VERSION,resolvePublishingCopy} from '../lib/publishing-copy.mts';
test('numbered body list remains intact and explicit duplicates remain blocked',()=>{
 const text='## 小红书\n标题：合成示例\n简介：列表：\n1. 标题\n2. 时间\n3. 地点\n标签：#示例';
 const result=resolvePublishingCopy(text,'xiaohongshu');
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.title,'合成示例');
 assert.equal(result.description,'列表：\n1. 标题\n2. 时间\n3. 地点');
 const ambiguous='## 小红书\n标题：示例\n简介：正文\n1. 标题：另一标题\n2. 简介：另一个正文\n标签：#示例';
 assert.equal(resolvePublishingCopy(ambiguous,'xiaohongshu').ok,false);
});


const fixture=name=>readFileSync(new URL('./fixtures/publishing-copy/'+name,import.meta.url),'utf8');
const examples={refund:fixture('refund-promotion.md'),glm:fixture('glm-promotion.md'),japanese:fixture('japanese-promotion.txt')};
const platforms={douyin:'抖音',bilibili:'哔哩哔哩',kuaishou:'快手',wechat_channels:'微信视频号',xiaohongshu:'小红书'};
const section=(platform,{title='本平台独立标题',description='保留官方演示解读，不冒充本人实测。',tags='#明确话题 #官方演示'}={})=>`## ${platforms[platform]}\n\n标题：${title}\n\n简介：${description}\n\n标签：${tags}\n`;
test('explicit JSON string-array topics preserve their exact semantic tags rather than bracket or quote characters',()=>{const raw=section('wechat_channels',{tags:'["WorkBuddy", "AI教育", "互动课件", "教师备课"]'}),r=resolvePublishingCopy(raw,'wechat_channels');assert.equal(r.ok,true);assert.deepEqual(r.tags,['WorkBuddy','AI教育','互动课件','教师备课']);assert.ok(r.sources.tags[0].raw_text.includes('["WorkBuddy"'));for(const tags of ['["one",]','["one", 2]','[["one"]]','["one"] extra','["one","one"]','["one,two"]'])assert.equal(resolvePublishingCopy(section('wechat_channels',{tags}),'wechat_channels').ok,false,tags);});
function resolved(text,platform){const result=resolvePublishingCopy(text,platform);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.parser_version,PUBLISHING_COPY_PARSER_VERSION);assert.equal(result.selection,'platform-specific');return result;}
function blocked(text,platform,code){const result=resolvePublishingCopy(text,platform);assert.equal(result.ok,false,JSON.stringify(result));if(code)assert.ok(result.blockers.some(item=>item.code===code),JSON.stringify(result));return result;}
function assertExactSources(text,result){const lines=text.split(/\r\n|\r|\n/u);for(const source of [result.sources.title,result.sources.description,...result.sources.tags]){assert.equal(source.raw_text.replace(/\r\n?/gu,'\n'),lines.slice(source.start_line-1,source.end_line).join('\n'));assert.equal(source.kind,'platform-section');assert.ok(source.section_path.length>=2);assert.ok(!source.raw_text.includes('SYNTHETIC INTERNAL FACTS'));}}

test('fixture provenance fixes the actual archive digests and sanitized fixture bytes',()=>{
 const provenance=JSON.parse(fixture('provenance.json'));
 assert.deepEqual(provenance.fixtures.map(item=>item.original_sha256),['893525cf3f98ba056c3990c0ca664933e4f6873752dace5ff3f18e9f79079314','c688a7356b079ab5ac22c48911a0b053577dd831cc3528e7705698916ecdff6f','256e0bae30761d22d948c4aa3a3d345ddb3e06c8f210b5e8502f5c11ad48b6cd']);
 for(const item of provenance.fixtures)assert.equal(createHash('sha256').update(fixture(item.fixture)).digest('hex'),item.fixture_sha256);
});

test('real refund Bilibili section preserves its title, qualification and exact tags',()=>{
 const result=resolved(examples.refund,'bilibili');
 assert.equal(result.title,'让AI全权追退款，会发生什么？六款智能体模拟测试里的越界动作');
 assert.equal(result.description,'研究者给六款智能体设置了虚构客户的过期火车票退款任务。有的连续催促，有的把私人邮箱中的病情告诉外部机构，但六款最终都未追回退款。外发邮件和表单内容在模拟环境中被拦截，本视频解读的是这次实验暴露的授权边界，不能视为现实客服成功率或模型能力排行榜。');
 assert.deepEqual(result.tags,['AI智能体','人工智能','隐私保护','模拟实验','怎么用好AI']);
 assertExactSources(examples.refund,result);assert.ok(result.sources.title.section_path.includes('哔哩哔哩'));
});

test('real GLM Bilibili section preserves official-demo and 19.2% limitations without backstage notes',()=>{
 const result=resolved(examples.glm,'bilibili');
 assert.equal(result.title,'AI审合同能落到哪条原文？GLM-Legal官方案例的修改建议与限制');
 assert.equal(result.description,'本条解读智谱GLM-Legal的官方演示及配套案例：从通知期、终止条件、交接支持的具体修改，到多份材料之间的进度矛盾。相关画面来自官方演示/静态案例，不是本人操作录屏；19.2%的严格任务全条件通过率说明它仍有明显限制，不能把演示包装成可靠律师或真实客户效果保证。');
 assert.deepEqual(result.tags,['GLM-Legal','合同审查','法律AI','官方演示','怎么用好AI']);assertExactSources(examples.glm,result);
 for(const text of [result.title,result.description,...result.tags])assert.ok(!/后台|私有待审|SYNTHETIC INTERNAL|封面辅助/u.test(text));
});

test('real historical copy cannot silently borrow a global title or invent a Kuaishou adaptation',()=>{
 for(const source of [examples.refund,examples.glm]){
  blocked(source,'douyin','missing-title');
  blocked(source,'kuaishou','missing-platform-section');
  // Bilibili's explicitly approved labels are present, but cannot fill Kuaishou's missing labels.
  assert.equal(resolvePublishingCopy(source,'bilibili').ok,true);
 }
});

test('real unsectioned Japanese promotion stays legacy-generic and cannot become any platform-ready copy',()=>{
 for(const platform of Object.keys(platforms)){const result=blocked(examples.japanese,platform,'legacy-generic-copy');assert.equal(result.selection,'legacy-generic');assert.ok(!('title'in result));}
});

test('five distinct explicit platform sections select only their own title, paragraphs and topics',()=>{
 const input='# SYNTHETIC independent copy examples\n\n'+Object.keys(platforms).map((platform,index)=>section(platform,{title:'独立标题'+index,description:'独立正文'+index+'。\n\n第二段保留实际限定，不增删。',tags:'#话题'+index+' #专属'+index})).join('\n');
 for(const [index,platform] of Object.keys(platforms).entries()){const result=resolved(input,platform);assert.equal(result.title,'独立标题'+index);assert.equal(result.description,'独立正文'+index+'。\n\n第二段保留实际限定，不增删。');assert.deepEqual(result.tags,['话题'+index,'专属'+index]);assertExactSources(input,result);}
});

test('serialized promotion envelope keeps global footer tags outside the last platform without rewriting its bytes',()=>{
 const copies=Object.keys(platforms).map((platform,index)=>section(platform,{title:'独立标题'+index,description:'独立正文'+index+'。',tags:'#本段'+index})).join('\n');
 const input='推荐标题\n全局标题\n\n备选标题\n另一标题\n\n视频号简介\n总简介\n\n跨平台长版正文\n'+copies+'\n相关话题\n#全局话题\n\n置顶评论\n全局互动\n\n封面标题\n封面文字\n\n封面辅助小字\n品牌\n\n朋友圈分享\n分享文字\n';
 const original=createHash('sha256').update(input).digest('hex');
 for(const [index,platform] of Object.keys(platforms).entries()){const result=resolved(input,platform);assert.equal(result.title,'独立标题'+index);assert.equal(result.description,'独立正文'+index+'。');assert.deepEqual(result.tags,['本段'+index]);assertExactSources(input,result);assert.ok(!JSON.stringify(result).includes('全局话题'));}
 assert.equal(createHash('sha256').update(input).digest('hex'),original);
 // A duplicate inside the actual platform section remains ambiguous, including
 // when a correctly serialized outer footer is also present.
 blocked(input.replace('标签：#本段4','标签：#本段4\n标签：#重复'),'xiaohongshu','ambiguous-tags');
 blocked(section('xiaohongshu')+'\n相关话题\n#另一个集合\n','xiaohongshu','ambiguous-tags');
});

test('editorial approach, alternative titles, comments and backstage facts never enter public fields or sources',()=>{
 const input=section('douyin')+'\n### 编辑依据\nSYNTHETIC INTERNAL APPROACH\n\n### 备选标题\nSYNTHETIC ALTERNATIVE\n\n### 引导评论\nSYNTHETIC COMMENT\n\n### 后台事实与素材说明\nSYNTHETIC BACKSTAGE\n';
 const result=resolved(input,'douyin');assert.equal(result.description,'保留官方演示解读，不冒充本人实测。');assert.deepEqual(result.tags,['明确话题','官方演示']);
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));assertExactSources(input,result);
 const english=resolved(section('kuaishou')+'\napproach: SYNTHETIC INTERNAL APPROACH\n','kuaishou');assert.ok(!JSON.stringify(english).includes('SYNTHETIC'));
});

test('Markdown field headings and CRLF source line ranges are deterministic',()=>{
 const input='\uFEFF# SYNTHETIC\r\n\r\n## B站\r\n### 标题\r\n明确的独立标题\r\n\r\n### 简介\r\n第一段。\r\n\r\n第二段，保留19.2%。\r\n\r\n### 标签\r\nAI工具、官方演示\r\n';
 const result=resolved(input,'bilibili');assert.equal(result.description,'第一段。\n\n第二段，保留19.2%。');assert.deepEqual(result.tags,['AI工具','官方演示']);assertExactSources(input,result);assert.ok(result.sources.description.raw_text.includes('\r\n'));
});

test('standalone hashtag lines are explicit tags; arbitrary hashtags inside prose are never used as tags',()=>{
 const input='## 抖音\n标题：明确标题\n\n正文：例子中的 #样例 是正文语义，不能乱删。\n\n#独立话题 #官方演示\n';
 const result=resolved(input,'douyin');assert.equal(result.description,'例子中的 #样例 是正文语义，不能乱删。');assert.deepEqual(result.tags,['独立话题','官方演示']);
 blocked('## 抖音\n标题：明确标题\n简介：只在正文提到了 #样例，并无话题字段。\n','douyin','missing-tags');
});
test('strict JSON topic arrays preserve explicit product names with spaces without guessing unstructured tag boundaries',()=>{const input=section('bilibili',{tags:'["Lovart 2.0","Arti","AI设计工具"]'}),result=resolved(input,'bilibili');assert.deepEqual(result.tags,['Lovart 2.0','Arti','AI设计工具']);assertExactSources(input,result);blocked(section('bilibili',{tags:'Lovart 2.0 Arti'}),'bilibili','invalid-tags');blocked(section('bilibili',{tags:'["Lovart\\n2.0"]'}),'bilibili','invalid-tags');});

test('missing, empty and ambiguous fields block instead of selecting or truncating',()=>{
 blocked('## 抖音\n简介：仅有正文\n标签：#实际话题\n','douyin','missing-title');
 blocked(section('douyin',{tags:''}),'douyin','empty-tags');
 blocked(section('douyin')+'\n标题：第二个标题\n','douyin','ambiguous-title');
 blocked(section('douyin',{title:'第一候选\n第二候选'}),'douyin','multiline-title');
 blocked(section('douyin')+section('douyin',{title:'另一专段'}),'douyin','ambiguous-platform-section');
 blocked('## 抖音/快手\n标题：共用\n简介：共用\n标签：#共用\n','kuaishou','ambiguous-platform-section');
});

test('another platform title or topics and a generic sharing section cannot repair missing platform fields',()=>{
 const input='## 推荐发布标题\n通用标题\n\n## 通用分享短文\n通用分享正文\n\n## 话题\n#通用话题\n\n'+section('bilibili')+'\n## 快手\n简介：快手自己的正文\n';
 const result=blocked(input,'kuaishou','missing-title');assert.ok(result.blockers.some(item=>item.code==='missing-tags'));assert.ok(!('tags'in result));
});

test('unsafe internal copy, unknown nested sections and tag ambiguity require a revised explicit field',()=>{
 blocked(section('douyin',{description:'状态：私有待审。不可公开。'}),'douyin','internal-or-unsupported-description');
 blocked(section('douyin')+'\n### 未定义的新小节\n无法判断是否应接入公开正文\n','douyin','unsupported-field-section');
 blocked(section('bilibili',{tags:'AI工具 人工智能'}),'bilibili','invalid-tags');
 blocked(section('bilibili',{tags:'#AI #AI'}),'bilibili','invalid-tags');
 blocked(section('bilibili',{tags:'AI工具、这是一段正文。'}),'bilibili','invalid-tags');
 blocked('## 抖音\n标题：A\n### 快手\n标题：B\n简介：B\n标签：#B\n','douyin','nested-platform-section');
});

test('fenced platform lookalikes, unsupported platforms and oversized sources do not gain readiness',()=>{
 const fenced='```markdown\n'+section('kuaishou')+'```\n';blocked(fenced,'kuaishou','missing-platform-section');
 blocked(section('douyin'),'unknown','unsupported-platform');blocked('', 'douyin','empty-source');blocked(null,'douyin','empty-source');blocked('x'.repeat(100001),'douyin','source-too-large');
});

test('the extraction is deterministic, pure, and does not rewrite punctuation or shorten long approved fields',()=>{
 const description='限定：这是官方演示解读。'+('具体事实，不改写；'.repeat(500)),input=section('douyin',{description}),a=resolved(input,'douyin'),b=resolved(input,'douyin');
 assert.equal(a.description,description);assert.deepEqual(a,b);assert.equal(a.title,'本平台独立标题');
});
