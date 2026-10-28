import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({stdin:{contents:"export {GET} from './app/api/publishing/route'",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/(api|production-contract|publishing-controller)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('/api')?`export const identity=()=>globalThis.__owner;export const json=(value,status=200)=>Response.json(value,{status});`:a.path.endsWith('production-contract')?`export class ProductionError extends Error {constructor(message,status){super(message);this.status=status}}`:`export const publishingDashboard=(...args)=>globalThis.__dashboard(...args);export const publishingAction=()=>({});`}));
}}]});
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('one owner-authenticated request streams early core and later full dashboard',async()=>{
 globalThis.__owner='owner';let finish,ready,calls=0;globalThis.__dashboard=(owner,onCore,onOperational)=>{calls++;assert.equal(owner,'owner');onCore({plan:{enabled:true},connections:[],summary:{ready:1}});ready=onOperational;return new Promise(resolve=>finish=resolve)};
 const response=await GET(new Request('https://synthetic.test/api/publishing?view=stream'));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/x-ndjson/);const reader=response.body.getReader(),decode=new TextDecoder();const first=JSON.parse(decode.decode((await reader.read()).value).trim());assert.equal(first.type,'core');assert.equal(first.dashboard.summary.ready,1);assert.equal(calls,1);
 ready({plan:{enabled:true},connections:[],preparation:{preparation:null},readiness:{},native_receipts:[],engagement:[]});const middle=JSON.parse(decode.decode((await reader.read()).value).trim());assert.equal(middle.type,'operational');
 finish({plan:{enabled:true},connections:[],summary:{ready:1},extra:'complete'});const second=JSON.parse(decode.decode((await reader.read()).value).trim());assert.equal(second.type,'complete');assert.equal(second.dashboard.extra,'complete');assert.equal((await reader.read()).done,true);
});
test('unauthenticated stream request returns no dashboard',async()=>{globalThis.__owner=null;globalThis.__dashboard=()=>{throw Error('must not be called')};const response=await GET(new Request('https://synthetic.test/api/publishing?view=stream'));assert.equal(response.status,401);});
test('a later read failure arrives explicitly after core without pretending completion',async()=>{globalThis.__owner='owner';globalThis.__dashboard=(_owner,onCore)=>{onCore({plan:{enabled:true},connections:[]});return Promise.reject(Error('synthetic failure'))};const response=await GET(new Request('https://synthetic.test/api/publishing?view=stream'));const lines=(await response.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(lines.map(x=>x.type),['core','error']);assert.doesNotMatch(lines[1].error,/synthetic failure/);});
