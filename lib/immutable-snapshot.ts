import {createHash} from 'node:crypto';
import {db} from './store';
import {ProductionError} from './production-contract';

export type SnapshotEvidence={key:string;value?:string;raw?:string;value_ref?:string};
const refFor=(key:string,value:string)=>'immutable_snapshot_v1:'+createHash('sha256').update(key+'\n'+value).digest('hex');
const validRef=(v:unknown)=>typeof v==='string'&&/^immutable_snapshot_v1:[a-f0-9]{64}$/.test(v);
/** Server-only append. No public action can supply or replace these expected bytes. */
export async function freezeAppStateEvidence(key:string,value:string,write=true):Promise<SnapshotEvidence>{
 const reference=refFor(key,value),found=await db().prepare('SELECT value=? AS exact FROM app_state WHERE key=?').bind(value,reference).first<{exact:number}>();
 if(found){if(found.exact!==1)throw new ProductionError('不可变快照身份与原始字节冲突');return{key,value_ref:reference};}
 if(!write)return{key,value};
 // The large string crosses D1 RPC only once, rather than once per comparison.
 await db().prepare('WITH input AS (SELECT ? AS target_key,? AS expected,? AS snapshot_key) INSERT INTO app_state(key,value) SELECT input.snapshot_key,input.expected FROM input JOIN app_state actual ON actual.key=input.target_key WHERE actual.value=input.expected ON CONFLICT(key) DO NOTHING').bind(key,value,reference).run();
 const saved=await db().prepare('SELECT snapshot.value=actual.value AS exact FROM app_state snapshot JOIN app_state actual ON actual.key=? WHERE snapshot.key=?').bind(key,reference).first<{exact:number}>();if(saved?.exact!==1)throw new ProductionError('冻结快照时原记录已经变化；未放宽版本核验');return{key,value_ref:reference};
}
/** Exact equality stays inside D1; the digest is an identity, never a self-report. */
export function snapshotEvidenceGuard(e:SnapshotEvidence,alias='evidence'):{sql:string;args:unknown[]}{
 if(validRef(e.value_ref))return{sql:`EXISTS(SELECT 1 FROM app_state ${alias} JOIN app_state frozen ON frozen.key=? WHERE ${alias}.key=? AND ${alias}.value=frozen.value)`,args:[e.value_ref,e.key]};
 const value=e.value??e.raw;if(typeof value!=='string')return{sql:'0',args:[]};return{sql:`EXISTS(SELECT 1 FROM app_state ${alias} WHERE ${alias}.key=? AND ${alias}.value=?)`,args:[e.key,value]};
}
