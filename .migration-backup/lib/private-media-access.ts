import {identity} from './api';
import {db} from './store';
import {ProductionError} from './production-contract';

// Service access does not establish a visitor or a job owner.
export async function requirePrivateMediaIdentity(req:Request){
 const owner=await identity(req);
 if(!owner)throw new ProductionError('请登录本人私有站',401);
 return owner;
}
export async function requirePrivateMediaOwner(id:string,owner:string){
 if(!await db().prepare('SELECT id FROM production_jobs WHERE id=? AND owner_id=?').bind(id,owner).first())
  throw new ProductionError('私有文件所有者不匹配',403);
}
