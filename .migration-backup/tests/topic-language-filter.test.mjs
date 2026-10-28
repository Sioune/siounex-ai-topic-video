// SYNTHETIC multilingual library state. No network, personal writes or production tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTopics} from '../lib/feed.ts';
import {defaultView,viewFromUrl,navigationUrl} from '../lib/topic-navigation.ts';

const NOW=Date.parse('2026-10-16T00:00:00Z');
const row=(id,language,extra={})=>({id,url:'https://example.org/'+id,source_id:'fixture',source:'SYNTHETIC source',title:'AI demo '+id,original_title:'AI original '+id,summary:'Original source summary',published_at:'2026-10-15T00:00:00Z',collected_at:'2026-10-16T00:00:00Z',category:'视觉影像',score:50,material:'有演示线索',highlight:'Fixture',angle:'Fixture',materials:'Fixture',risk:'Fixture only',curated:0,content_lang:language,disposition:'pending',favorite:0,...extra});
const rows=[row('zh','zh'),row('en','en',{favorite:1}),row('legacy','legacy'),row('rejected-en','en',{disposition:'rejected',favorite:1}),row('produced-en','en',{disposition:'produced'}),row('rejected-zh','zh',{disposition:'rejected'})];
const ids=result=>result.map(r=>r.id);

test('default pending pool includes Chinese, English and retained history without reviving personal exclusions',()=>{
 const before=structuredClone(rows);
 assert.deepEqual(ids(filterTopics(rows,defaultView,NOW)),['zh','en','legacy']);
 assert.deepEqual(rows,before);
});

test('saved, rejected and produced views preserve the existing personal-state rules across languages',()=>{
 assert.deepEqual(ids(filterTopics(rows,{...defaultView,tab:'saved'},NOW)),['en','rejected-en']);
 assert.deepEqual(ids(filterTopics(rows,{...defaultView,tab:'rejected'},NOW)),['rejected-en','rejected-zh']);
 assert.deepEqual(ids(filterTopics(rows,{...defaultView,tab:'produced'},NOW)),['produced-en']);
});

test('old legacy URLs remain foreign/history filters with their prior personal-state visibility',()=>{
 const view=viewFromUrl(new URL('https://topic.test/?tab=legacy&external=keep'));
 assert.equal(view.tab,'legacy');
 assert.deepEqual(ids(filterTopics(rows,view,NOW)),['en','legacy','rejected-en','produced-en']);
 const id='t_'+'a'.repeat(24),url=navigationUrl('https://topic.test/?tab=legacy&external=keep#notes',view,id);
 assert.equal(new URL(url,'https://topic.test').searchParams.get('tab'),'legacy');
 assert.equal(new URL(url,'https://topic.test').searchParams.get('external'),'keep');
 assert.equal(new URL(url,'https://topic.test').hash,'#notes');
});

test('English original-title search composes with category, age, material and date ordering',()=>{
 const topics=[row('older','en',{original_title:'Audio Tool',published_at:'2026-10-10T00:00:00Z'}),row('newer','en',{original_title:'AUDIO TOOL',published_at:'2026-10-15T00:00:00Z'}),row('wrong-category','en',{original_title:'Audio Tool',category:'行业动态'}),row('wrong-material','en',{original_title:'Audio Tool',material:'待核实'}),row('old','en',{original_title:'Audio Tool',published_at:'2026-08-01T00:00:00Z'})];
 assert.deepEqual(ids(filterTopics(topics,{...defaultView,q:'audio tool',category:'视觉影像',time:'7',material:'有演示线索',sort:'date'},NOW)),['newer','older']);
});
