// Shared worker/browser/native-Node policy. No server or framework imports.
export type PrivateVideoScopeFact={scope:string;owner_confirmed?:boolean;authorization_source?:string;new_paid_authorization:boolean;publication_authorization:boolean;quality_approved:boolean};
export function privateVideoScopeAuthorized(scope:PrivateVideoScopeFact|null|undefined,mode:string){return !!scope&&scope.scope==='private-video'&&scope.owner_confirmed!==false&&scope.new_paid_authorization===false&&scope.publication_authorization===false&&scope.quality_approved===false&&(mode!=='auto'||scope.owner_confirmed===true&&scope.authorization_source==='owner-private-video');}
// Scheduling a saved node-mode task requires explicit current owner authority;
// merely finding a legacy private/preparation label cannot start new work.
export function currentOwnerPrivateVideoScope(job:any){const s=job?.media_continuation?.scope,b=s?.binding;return !!s&&s.schema==='owner-media-scope-v1'&&s.id===job.media_continuation.current_id&&privateVideoScopeAuthorized(s,'auto')&&!!b&&b.revision===job.revision&&b.script_hash===job.approved_hash&&b.mode_epoch===job.mode_epoch&&b.contract_hash===job.contract_hash;}
