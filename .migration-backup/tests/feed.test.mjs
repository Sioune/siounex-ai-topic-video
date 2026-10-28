import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseFeed,normalizeUrl,validDate,plainText,suggest,filterTopics,fetchSource} from '../lib/feed.ts';
const sources=JSON.parse(readFileSync(new URL('../lib/sources.json',import.meta.url)));
let count=0;
for(const s of sources){const fixture='/workspace/shared/ai-topics-research/'+s.id+'.xml';if(!existsSync(fixture))continue;const xml=readFileSync(fixture,'utf8');const rows=parseFeed(xml,s);assert(rows.length>0,s.id+' should parse');assert.equal(new Set(rows.map(r=>r.url)).size,rows.length);console.log(s.id,rows.length,rows[0].published);count+=rows.length;}
assert.equal(normalizeUrl('https://example.com/item/?utm_source=x#fragment'),'https://example.com/item');
for(const s of ['javascript:alert(1)','https://127.0.0.1/path','http://example.com','https://u:p@example.com','https://[::1]/','file:///etc/passwd'])assert.equal(normalizeUrl(s),null);
assert.equal(validDate('no date'),null);assert.equal(validDate('2050-01-01'),null);
assert.equal(plainText('<script>alert(1)</script>&lt;b&gt;hello&lt;/b&gt;'),'hello');
assert(suggest('AI video game demo','watch the animated world').score>suggest('Enterprise funding valuation benchmark','parameters').score);
let calls=0;await assert.rejects(()=>fetchSource({id:'evil',name:'evil',url:'http://127.0.0.1',hosts:['127.0.0.1']},()=>{calls++;throw Error('must not fetch')}));assert.equal(calls,0);
const src=sources[0];assert.throws(()=>parseFeed('<!DOCTYPE a><rss></rss>',src));
const sample=[{title:'声音演示',original_title:'Audio',summary:'test',angle:'test',source:'Google',category:'声音音乐',material:'已找到素材',published_at:'2026-10-01T00:00:00Z',favorite:1,score:90},{title:'其他',original_title:'other',summary:'',source:'MIT',category:'视觉影像',material:'待核实',published_at:'2020-01-01T00:00:00Z',favorite:0,score:20}];
assert.equal(filterTopics(sample,{q:'声音',category:'声音音乐',time:'7',material:'已找到素材',tab:'saved',sort:'score'},Date.parse('2026-10-07')).length,1);
assert.equal(filterTopics(sample,{q:'',category:'all',time:'longtail',material:'all',tab:'all',sort:'date'},Date.parse('2026-10-07')).length,1);
console.log('PASS: sources, dedupe, dates, filtering combinations, SSRF guard, text sanitizing, ranking; parsed',count,'feed records');

const fixture='<rss><channel><item><title>Video demo</title><link>https://www.qbitai.com/test/?utm_source=x</link><pubDate>2026-09-30</pubDate></item><item><title>Duplicate</title><link>https://www.qbitai.com/test</link></item><item><title>Missing date</title><link>https://www.qbitai.com/nodate</link></item></channel></rss>';const normalized=parseFeed(fixture,src,Date.parse('2026-10-07'));assert.equal(normalized.length,2);assert.equal(normalized[1].published,null);
