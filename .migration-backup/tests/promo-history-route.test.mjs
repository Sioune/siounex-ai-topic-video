import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const built=await build({entryPoints:['app/api/promotion/route.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'promotion-route-fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/(?:api|promo-packages|production-contract)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/api')?`export async function identity(req){return req.headers.get('x-owner')} export const json=(v,s=200)=>Response.json(v,{status:s});`:args.path.endsWith('/production-contract')?`export class ProductionError extends Error { constructor(message,status=400){super(message);this.status=status} } export const text=(v)=>String(v||'');`:`export async function listPromos(id,owner,options){globalThis.__promoRoute.push({id,owner,options});if(owner!=='owner')throw Error('not owner');return {packages:[],automatic_trigger:false}} export async function downloadPromo(){throw Error('unused')} export async function requestPromo(){} export async function editPromo(){} export async function cancelPromo(){}` }));
}}]});
const route=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
test('history endpoint is opt-in, owner scoped, and legacy reads remain unchanged',async()=>{
 globalThis.__promoRoute=[];try{const req=(url,owner)=>new Request('https://synthetic.test'+url,{headers:owner?{'x-owner':owner}:{}});
 const unauthorized=await route.GET(req('/api/promotion?id=job&view=history'));assert.equal(unauthorized.status,401);assert.equal(globalThis.__promoRoute.length,0);
 const other=await route.GET(req('/api/promotion?id=job&view=history','other'));assert.equal(other.ok,false);
 const history=await route.GET(req('/api/promotion?id=job&view=history','owner'));assert.equal(history.status,200);assert.deepEqual(globalThis.__promoRoute.at(-1),{id:'job',owner:'owner',options:{historySummary:true}});
 const legacy=await route.GET(req('/api/promotion?id=job','owner'));assert.equal(legacy.status,200);assert.equal(globalThis.__promoRoute.at(-1).options,undefined);
 }finally{delete globalThis.__promoRoute;}
});
