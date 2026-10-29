import {ProductionError,type ProductionJob} from './production-contract.ts';
import {privateVideoScopeAuthorized} from './private-video-scope.mts';
export {privateVideoScopeAuthorized};
export type MediaScopeBinding={revision:number;script_hash:string;mode_epoch:number;contract_hash:string};
export type MediaScope={schema:'owner-media-scope-v1';id:string;binding:MediaScopeBinding;scope:'preparation'|'private-video';confirmed_at:string;authorization_source?:'included-free-preparation'|'owner-private-video';owner_confirmed?:boolean;new_paid_authorization:false;publication_authorization:false;quality_approved:false};
export type LicenseRecord={schema:'owner-media-license-v1';library_file_id:string;sha256:string;status:'pending'|'denied'|'owner-documented';evidence:string;rightsholder:string;uses:string[];independently_verified:false};
export const MEDIA_USES=['source_playback','crop','voice_overlay','private_composition'] as const;
export function scopeBinding(j:Pick<ProductionJob,'revision'|'approved_hash'|'mode_epoch'|'contract_hash'>):MediaScopeBinding{return {revision:j.revision,script_hash:j.approved_hash||'',mode_epoch:j.mode_epoch,contract_hash:j.contract_hash};}
export function bindingMatches(j:Pick<ProductionJob,'revision'|'approved_hash'|'approved_revision'|'mode_epoch'|'contract_hash'|'status'>,b:MediaScopeBinding){return j.status==='approved'&&j.approved_revision===j.revision&&b.revision===j.revision&&b.script_hash===j.approved_hash&&b.mode_epoch===j.mode_epoch&&b.contract_hash===j.contract_hash;}
export type ScopeJob=Pick<ProductionJob,'id'|'is_test'|'intake'|'revision'|'approved_revision'|'approved_hash'|'mode_epoch'|'contract_hash'|'status'|'review_mode'>;
export function assertScope(j:ScopeJob,scope:MediaScope|null,node:string,licenses:LicenseRecord[]=[]){if(!j.intake&&!scope)return;if(!scope||!bindingMatches(j,scope.binding)||!privateVideoScopeAuthorized(scope,j.review_mode))throw new ProductionError('当前稿仅有文字或准备权限，需本人确认私有视频范围',409);if(['cover','video','delivery'].includes(node)){for(const m of j.intake?.proposal.media||[]){const license=licenses.find(l=>l.library_file_id===m.library_file_id&&l.sha256===m.sha256);if(license?.status==='denied')throw new ProductionError('所有者已明确登记此原片不允许使用，须先解决该具体限制',409);}}// This authorizes only the owner-confirmed private review. Pending rights are retained;
 // it never grants public sharing, commercial exploitation or a rights-cleared state.
}
