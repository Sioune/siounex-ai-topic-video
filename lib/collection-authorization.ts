import {db} from './store';

export type CollectionAuthorization={authorization_id:string;active_since:string};
/** A collection pass keeps the same current owner grant through every await. */
export async function collectionAuthorization(owner:string,at:string):Promise<CollectionAuthorization|null>{
 const row=await db().prepare('SELECT p.authorization_id,p.active_since FROM publishing_plans p JOIN publishing_authorizations a ON a.id=p.authorization_id AND a.owner_id=p.owner_id WHERE p.owner_id=? AND p.enabled=1').bind(owner).first<CollectionAuthorization>();
 return row&&!!row.active_since&&Number.isFinite(Date.parse(row.active_since))&&Date.parse(row.active_since)<=Date.parse(at)?row:null;
}
export function sameCollectionAuthorization(a:CollectionAuthorization|null,b:CollectionAuthorization|null){return !!a&&!!b&&a.authorization_id===b.authorization_id&&a.active_since===b.active_since;}
export const collectionAuthorizationSql='EXISTS(SELECT 1 FROM publishing_plans cp JOIN publishing_authorizations ca ON ca.id=cp.authorization_id AND ca.owner_id=cp.owner_id WHERE cp.owner_id=? AND cp.enabled=1 AND cp.authorization_id=? AND cp.active_since=?)';
export const collectionAuthorizationArgs=(owner:string,grant:CollectionAuthorization)=>[owner,grant.authorization_id,grant.active_since];
