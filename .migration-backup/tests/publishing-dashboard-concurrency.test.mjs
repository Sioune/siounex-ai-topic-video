// Synthetic controller tests: only injected read fixtures are used, no platform actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(root+'lib/publishing-controller.ts','utf8');
const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)].map(m=>[m[2],m[1].split(',').map(s=>s.trim())]));
const bundled=await build({stdin:{contents:"export {publishingDashboard} from './lib/publishing-controller'",resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-reads',setup(b){
 b.onResolve({filter:/^\.\//},args=>args.importer.endsWith('publishing-controller.ts')&&imports.has(args.path)?{path:args.path,namespace:'fixture'}:undefined);
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:imports.get(args.path).map(name=>name==='ProductionError'?'export class ProductionError extends Error {}':name==='browserPublishingAdapter'?'export const browserPublishingAdapter={};':name==='PUBLISHING_BACKGROUND_ACTIONS'?'export const PUBLISHING_BACKGROUND_ACTIONS=[];':`export const ${name}=(...a)=>globalThis.__dashboardFixture.${name}(...a);`).join('\n')}));
}}]});
const {publishingDashboard}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture(){
 const calls=[];const dashboard={reserve_queue:[{status:'ready',binding:{id:'one'},title:'one'},{status:'reserved',binding:{id:'two'},title:'two'},{status:'published',binding:{id:'skip'},title:'skip'}],publications:[],marker:'news'};
 const f={calls,dashboard,readPublishingDashboard:async owner=>{calls.push('news:'+owner);return dashboard},externalMvDashboard:async owner=>{calls.push('mv:'+owner);return [{id:'mv'}]},readBrowserAccounts:async()=>[{account_label:'account'}],db:()=>({prepare:()=>({bind:()=>({first:async()=>null})})}),readExistingPlatformDashboard:async()=>({candidates:[{id:'existing'}]}),readPublishingPreparation:async()=>({preparation:null}),readPublishingEngagement:async()=>({engagement:[]}),readPublishingReadiness:async()=>({ready:true}),readNativePublishingReceipts:async()=>({native_receipts:[{id:'native'}]}),currentPlatformCopyReview:async(_owner,binding)=>binding.id==='one'?{id:'review'}:null};
 globalThis.__dashboardFixture=f;return f;
}
test('independent reads start together and output retains all fields and order',async()=>{
 const f=fixture(),news=deferred(),mv=deferred(),native=deferred(),copy=deferred();
 f.readPublishingDashboard=owner=>{f.calls.push('news:'+owner);return news.promise};f.externalMvDashboard=owner=>{f.calls.push('mv:'+owner);return mv.promise};
 f.readNativePublishingReceipts=()=>{f.calls.push('native');return native.promise};f.currentPlatformCopyReview=(_o,b)=>{f.calls.push('copy:'+b.id);return b.id==='one'?copy.promise:Promise.resolve(null)};
 const result=publishingDashboard('owner');assert.deepEqual(f.calls.sort(),['mv:owner','news:owner']);news.resolve(f.dashboard);
 await new Promise(resolve=>setImmediate(resolve));assert.ok(f.calls.includes('native'));assert.ok(f.calls.includes('copy:one'));assert.ok(f.calls.includes('copy:two'));assert.ok(!f.calls.includes('copy:skip'));
 native.resolve({native_receipts:[{id:'native'}]});copy.resolve({id:'review'});mv.resolve([{id:'mv'}]);const value=await result;
 assert.equal(value.marker,'news');assert.deepEqual(value.external_mv_packages,[{id:'mv'}]);assert.equal(value.external_mv_error,null);assert.deepEqual(value.native_receipts,[{id:'native'}]);assert.deepEqual(value.copy_reviews,[{id:'review'}]);assert.deepEqual(value.existing_candidates,[{id:'existing'}]);assert.equal(value.accounts[0].account_name,'account');assert.equal(value.scheduler.enabled,false);
});
test('MV read failure preserves the news result and fallback; news failure propagates',async()=>{
 const f=fixture(),old=console.error;console.error=()=>{};try{f.externalMvDashboard=async()=>{throw Error('mv failed')};let value=await publishingDashboard('owner');assert.equal(value.marker,'news');assert.deepEqual(value.external_mv_packages,[]);assert.equal(value.external_mv_error,'已审成品进度读取暂未完成；原新闻发布信息保留。');f.readPublishingDashboard=async()=>{throw Error('news failed')};await assert.rejects(publishingDashboard('owner'),/news failed/);}finally{console.error=old;delete globalThis.__dashboardFixture;}
});
test('native failure keeps precedence when both dependent reads fail',async()=>{
 const f=fixture();f.readNativePublishingReceipts=async()=>{await new Promise(resolve=>setImmediate(resolve));throw Error('native failed')};f.currentPlatformCopyReview=async()=>{throw Error('copy failed')};await assert.rejects(publishingDashboard('owner'),/native failed/);delete globalThis.__dashboardFixture;
});
test('core plan and reserve are delivered before independent slow details without repeating reads',async()=>{
 const f=fixture(),slow=deferred(),delivered=[],ready=[];let baseReads=0;f.readPublishingDashboard=async()=>{baseReads++;return f.dashboard};f.readExistingPlatformDashboard=()=>slow.promise;
 const result=publishingDashboard('owner',core=>delivered.push(core),value=>ready.push(value));await new Promise(resolve=>setImmediate(resolve));assert.equal(baseReads,1);assert.equal(delivered.length,1);assert.equal(delivered[0].marker,'news');assert.equal(delivered[0].accounts[0].account_name,'account');assert.equal(ready.length,1);assert.deepEqual(ready[0].native_receipts,[{id:'native'}]);assert.equal(ready[0].readiness.ready,true);
 slow.resolve({candidates:[{id:'existing'}]});const full=await result;assert.equal(full.marker,'news');assert.deepEqual(full.existing_candidates,[{id:'existing'}]);assert.equal(baseReads,1);
});
