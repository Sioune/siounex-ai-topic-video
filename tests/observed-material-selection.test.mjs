import test from 'node:test';
import assert from 'node:assert/strict';
import {selectObservedMaterials} from '../scripts/automatic-material-plan.mjs';

const picture=(asset_id,hash,text,extra={})=>({asset_id,kind:'image',sha256:hash.repeat(64),visible_observations:[text],...extra});
const row=(narration,extra={})=>({asset_id:'pending_demo',narration,visual:'待补对应画面',start:0,end:12,...extra});
const select=(media,storyboard,source={title:'当前选题'})=>selectObservedMaterials({media,draft:{storyboard},source});
const history=picture('history','a','腾讯SSV官方图中蔡玉娟老师的远古时期的人类活动课件首页，完整课件页面；静态截图');
const consoleView=picture('console','b','腾讯SSV官方图中朱维维老师的班级喊话筒手机通知与电脑显示页面；静态截图');
const event=picture('event','c','1386×924的静态会场照片。主屏标题为“AI赋能历史教学”，副题可见“WorkBuddy 如何助力个性化教学”，左侧有讲者，前景为听众。');
const posters=picture('posters','d','832×404横向展区静态图。现场展板排列多张作品海报，左侧写有大会主题，右侧屏幕区域出现“阅文集团AI漫剧作者”等文字；画面带媒体水印。');
const animation=picture('animation','e','830×314横向大会现场静态图。大屏中央可见“首批AI精品动画”，两侧排列项目竖版海报，左侧有讲台人物。');
const rights=picture('rights','f','830×314横向大会现场静态图。大屏标题为“开放版权 让好故事走向更多舞台”，下方可见6000+、300+、100+、100W+元等数据卡片，舞台中央有人物。');
const tool=picture('tool','1','830×314横向大会现场静态图。大屏展示DramaBuddy及“漫剧助手从制作工具到链接创作者生态”等内容，右侧可见《The Duke’s Masked Wife》示例，舞台左侧有人物。');

test('a history brief mentioning the class chooses the actual ancient-history lesson before a notification console',()=>{
 const wrongVisual=consoleView.visible_observations[0]+'；'+event.visible_observations[0];
 const r=select([event,consoleView,history],[row('老师说清教学目标和班级情况，AI先搭结构，再做交互和情境题。发布材料称，成品里有3D遗址地图、考古档案卡和8道闯关题。',{visual:wrongVisual,asset_id:'console,event'})],{title:'历史课变成可操作的考古展厅：老师怎样用WorkBuddy改课件？'});
 assert.equal(r.segments[0].asset_ids[0],'history');assert.ok(!r.segments[0].asset_ids.includes('console'));assert.match(r.segments[0].visible_content,/远古时期/);assert.match(r.segments[0].reason,/不声称/);
});

test('classroom notices and ledgers use the actual console rather than the history course',()=>{
 const r=select([history,event,consoleView],[row('另一个案例里，班主任把通知和班级台账放进同一个轻量网页。',{asset_id:'history',visual:'老师在完整课件页面上组织课堂'})],{title:'历史教师的备课和班级管理'});
 assert.equal(r.segments[0].asset_ids[0],'console');assert.ok(!r.segments[0].asset_ids.includes('history'));
});

test('a fictional character action is illustrated with current works, never the presenter on tool or copyright slides',()=>{
 const duplicateTool={...tool,asset_id:'downloaded_tool'};
 const r=select([tool,rights,posters,animation,duplicateTool],[row('一位参与改编的创作者举了个很小的例子：角色拿水杯，自不自然、像不像这个人，都会决定镜头留不留下。',{asset_id:'tool,downloaded_tool',visual:'人物与创作者的镜头展示'})],{title:'阅文AI动画人物动作和故事创作'});
 assert.ok(r.segments[0].asset_ids.length>0);assert.ok(r.segments[0].asset_ids.every(id=>['posters','animation'].includes(id)));assert.match(r.segments[0].reason,/不声称.*动作/);assert.ok(!r.segments[0].visible_content.includes('DramaBuddy'));
});

test('tool and copyright views remain available for their own specific segments',()=>{
 const r=select([posters,rights,tool],[row('开放版权让更多IP获得授权，公布的数据卡片交代了版权规模。',{asset_id:'rights',visual:rights.visible_observations[0],end:6}),row('漫剧助手DramaBuddy从制作工具连接创作者工作流。',{asset_id:'tool',visual:tool.visible_observations[0],start:6,end:12})],{title:'AI动画创作大会'});
 assert.deepEqual(r.segments.map(s=>s.asset_ids),[['rights'],['tool']]);
});

test('same SHA and equivalent crop under different asset ids are one picture, including long pinned segments',()=>{
 const original=picture('original','2','当前作品的角色海报，展示主角造型。',{display_crop:{x:0,y:0,width:.5,height:1}}),alias={...original,asset_id:'downloaded_alias',display_crop:{height:1,width:.5,y:0,x:0}};
 const r=select([original,alias],[row('这部动画的角色造型在海报里很醒目。',{asset_id:'original,downloaded_alias',end:18})],{title:'这部动画的角色设计'});
 assert.deepEqual(r.segments[0].asset_ids,['original']);assert.equal(r.segments[0].visible_content.split('展示主角造型').length-1,1);
});

test('different real crops can provide distinct views while duplicate full images cannot',()=>{
 const image=picture('whole','3','动画角色和主角的真实海报。'),alias={...image,asset_id:'whole_alias'},crop={...image,asset_id:'character_crop',display_crop:{x:.1,y:.1,width:.6,height:.7},visible_observations:['同一动画海报中主角的造型局部，原图裁剪。']};
 const r=select([image,alias,crop],[row('这部动画的主角和角色造型如何？',{end:18})],{title:'动画角色'});
 assert.equal(r.segments[0].asset_ids.length,2);assert.ok(r.segments[0].asset_ids.includes('character_crop'));assert.ok(!r.segments[0].asset_ids.includes('whole_alias'));
});

test('an already specifically matched source view survives alternatives and usage penalties',()=>{
 const r=select([animation,posters,tool],[row('四个动画项目亮相，海报呈现不同画风。',{asset_id:'posters',visual:posters.visible_observations[0],end:5}),row('这些动画作品的海报展示不同创作方向。',{asset_id:'posters',visual:posters.visible_observations[0],start:5,end:9})],{title:'首批AI动画作品'});
 assert.deepEqual(r.segments.map(s=>s.asset_ids),[['posters'],['posters']]);
});

test('a specifically matched opening quotation can return as the closing viewpoint without becoming a tool slide',()=>{
 const quote=picture('quote','4','大屏以大字显示“文学的改编可以用AI，但文学本身不能是AI”，背景为室内人物剪影，左侧讲台有人物。');
 const r=select([quote,posters,tool],[row('文学的改编可以用AI，但文学本身不能是AI。',{asset_id:'quote',visual:quote.visible_observations[0],end:3}),row('而是人物能不能被记住，故事值不值得追下去。',{asset_id:'quote',visual:quote.visible_observations[0],start:3,end:8})],{title:'AI动画作品中的人物和故事'});
 assert.deepEqual(r.segments.map(s=>s.asset_ids),[['quote'],['quote']]);
});

test('a generic history-event pin does not displace an available view of the actual lesson',()=>{
 const r=select([event,history,consoleView],[row('发布材料中的3D遗址地图、考古档案卡让远古历史知识变得直观。',{asset_id:'event',visual:event.visible_observations[0],end:8})],{title:'远古历史课件案例'});
 assert.deepEqual(r.segments[0].asset_ids,['history']);
});

test('a vague reflection still advances with the current topic works as explicit background, without inventing a recorded action',()=>{
 const r=select([rights,tool,posters],[row('他要表达的东西，最终能不能打动人？',{visual:'需要另找对应采访',end:7})],{title:'阅文AI动画作品和角色创作'});
 assert.deepEqual(r.segments[0].asset_ids,['posters']);assert.match(r.segments[0].reason,/背景说明/);assert.match(r.segments[0].reason,/不声称/);
});
