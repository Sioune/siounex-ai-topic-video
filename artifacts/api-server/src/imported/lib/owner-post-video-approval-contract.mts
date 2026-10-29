import {candidateReviewBinding} from './native-candidate-feedback-contract.mts';
import {currentCandidateVoiceProvenance} from './native-candidate-voice-contract.mts';
import {currentEditorialDelivery} from './owner-editorial-delivery-contract.mts';
// This owner acceptance is intentionally limited to the three reviewed filesets.
// The frozen identity table is filled from the saved, verified v108 readbacks.
export const OWNER_POST_VIDEO_REFERENCE='call_c02d0ac6a9d54353a8019ee296bf3cca';
export const OWNER_POST_VIDEO_QUOTE='三组封面和宣发稿全部通过';
export const OWNER_POST_VIDEO_QUESTION='请审核本次退款实验、DeepSeek 小游戏、GLM-Legal三组材料：每条的3:4与4:3封面及完整宣发稿。请回复“全部通过”，或按项目写修改意见。通过后继续网站正式归档和完整交付包；本次不包含对外发布。';
export type PostVideoFileReference={site_archive_id:string;sha256:string;size_bytes:number;file_name:string};
export type OwnerPostVideoTarget={
 binding:{revision:number;script_hash:string;mode_epoch:number;contract_hash:string;candidate_id:string;candidate_sha256:string;project_id:string;timeline_id:string};
 source_snapshot_sha256:string;skill_snapshot_sha256:string;checkpoint_version:number;checkpoint_sha256:string;counts:{attempt:number;reworks:number;ai_calls:number};
 scope_id:string;scope_hash:string;voice_provenance_id:string;
 video:{id:string;artifact_version:number;artifact_hash:string;site_archive_id:string;sha256:string;size_bytes:number;owner_review_id:string};
 cover:{id:string;artifact_version:number;artifact_hash:string};
 materials:{cover_3_4:PostVideoFileReference;cover_4_3:PostVideoFileReference;promotion:PostVideoFileReference};
};
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
// FROZEN_TARGETS
export const OWNER_POST_VIDEO_TARGETS:Readonly<Record<string,OwnerPostVideoTarget>>=freeze({
 "job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0": {
  "binding": {
   "candidate_id": "native_video_d75decc1e9fbecd69ed2a2e8369ca10a6b91321b87896e221f2283dd6dcc2b7d",
   "candidate_sha256": "bac8c263831e524c22cb2a52645c3dc8fdb7aae2201618c2c1aa011f7f6abbbb",
   "contract_hash": "9d2868f931b066b12f8d7d0a7cabdd9306a76c39ba3e3d86ab3b03db25dbdc27",
   "mode_epoch": 0,
   "project_id": "ddf5260a-e844-4b49-af66-f50ad6268d3b",
   "revision": 1,
   "script_hash": "c1eb8ebb836302272fabc9b31f9db756ec076f2387bdb0b2ca13fbcf3a8ec5ab",
   "timeline_id": "db46dc0d-993f-4b47-a20a-d015d9b0b4ef"
  },
  "source_snapshot_sha256": "05f8958919ea5afad9035479bd6cf43bea20195b762a9e9d597757d0a2710224",
  "skill_snapshot_sha256": "c70b286c102ca71480a51c595e530804d0a44506ede668e8a59e28d1173603ef",
  "checkpoint_version": 2,
  "checkpoint_sha256": "eae21b4bae255205a4442d177572b3ee2bb3e4fc56c58b606ae92d5013278db8",
  "counts": {
   "attempt": 1,
   "reworks": 0,
   "ai_calls": 0
  },
  "scope_id": "media_scope_3ee64c609ef1a69a0cf409d85b22d7303064b12b4938f8fa0172f750aed0d43b",
  "scope_hash": "b3643b6bb85c57508a369e4128f8d58890c6adce94ecea7f55bc2286d9328ec8",
  "voice_provenance_id": "candidate_voice_4b25d21845873adc37971331f5fdd1a979632c00d8e9f1fbb42639f77f1bf731",
  "video": {
   "id": "native_draft_0d880132e0a6f6d51b0ac445589587d37cf88f7bc8ed9016985f4165ae215d74",
   "artifact_version": 2,
   "artifact_hash": "dac9ad73b94047a1a0c9c1637a01ff59c0b12aa829821e8d5a628e4d3fbb15a1",
   "site_archive_id": "sitefile_c583e90b3265ac38f8deb7578f5dbb264bd065ac2f90c81cd1362bb6d9de03de",
   "sha256": "bac8c263831e524c22cb2a52645c3dc8fdb7aae2201618c2c1aa011f7f6abbbb",
   "size_bytes": 12427930,
   "owner_review_id": "owner_native_revision_approval_d54786d8f23fcff8947d987b2e034dbc636fc637ea1fc7bbbbd168a106e7a74c"
  },
  "cover": {
   "id": "artifact_002d34b9b162839fdf294fcc8a0f878a3c81c4f34b952f7bab2faa01611d9148",
   "artifact_version": 1,
   "artifact_hash": "c7b8f86f3e3db48b877160bceaf712c461459796147501533ae1d4c3a523647b"
  },
  "materials": {
   "cover_3_4": {
    "site_archive_id": "sitefile_8fb7176e1e06228453357ffead6962899e9308cd060e5a4a394c6eda516ae6b2",
    "sha256": "5202b3164c8a6abf53749e889d36c6609dc3de302028ee669e6e5b23a5f19dec",
    "size_bytes": 2134905,
    "file_name": "refund-cover-3x4.png"
   },
   "cover_4_3": {
    "site_archive_id": "sitefile_7a9cf10854c46b49e365091f6a0e42af8d64496b720786ca4d1de03a1b902ba6",
    "sha256": "10e48ffcdfff76ed33b6fa43b6e61375049ada11012262c452374092fa37911e",
    "size_bytes": 1959288,
    "file_name": "refund-cover-4x3.png"
   },
   "promotion": {
    "site_archive_id": "sitefile_423804869889d1c81dd1d6f6b80591d591d3ee12f550e2959322cf0cc3d3274e",
    "sha256": "893525cf3f98ba056c3990c0ca664933e4f6873752dace5ff3f18e9f79079314",
    "size_bytes": 4662,
    "file_name": "refund-promotion.md"
   }
  }
 },
 "job_ed3c8123-59ed-4948-9d99-fdb7067ee522": {
  "binding": {
   "candidate_id": "native_video_a1e389c55f03e01b3b5cf82408b7e7a0d217bfc734485bc95d46679969f29131",
   "candidate_sha256": "edad4666ab46211d7d640b68ed2e92b58c5563613dbaee66574a55c090b0b5e6",
   "contract_hash": "e8bc99b09a4df6745474336f3c5ab195d014f275ceabffd7158f29bb945059fd",
   "mode_epoch": 0,
   "project_id": "572a8ac4-4945-4367-b378-e3d679be535a",
   "revision": 1,
   "script_hash": "18050f4876ebf14998b69e2b9e183ab4b1332d6f0d4fae6e8030f27ee7e694d3",
   "timeline_id": "54f55fda-4672-4c3f-8c2f-414304a8949c"
  },
  "source_snapshot_sha256": "e49f9fa9ab1e2ba09682268bb9cfa548fa3e70ef7d68d072efac2763420cbdc2",
  "skill_snapshot_sha256": "c70b286c102ca71480a51c595e530804d0a44506ede668e8a59e28d1173603ef",
  "checkpoint_version": 2,
  "checkpoint_sha256": "9c062c068480c5a3d26d7daa5ff922ef8670d64415b0b718c1a4c059200ab29b",
  "counts": {
   "attempt": 1,
   "reworks": 0,
   "ai_calls": 0
  },
  "scope_id": "media_scope_4eed968b3ecec1b70b1fba41da36aaabaec4a8533ad670a40645da737c69616f",
  "scope_hash": "43a14e468c1e93f964a096d13351f00521ab63f5e0c6b1634b76df1b0f519eab",
  "voice_provenance_id": "candidate_voice_e31d68db475b7758b013d79d7af1607f2afe1cab9d214f3d5e7b1eec89eab266",
  "video": {
   "id": "native_draft_a5378b353ce1bce814c2f49d45d25a1705f3451b880924800d29bae95b8e4ffe",
   "artifact_version": 2,
   "artifact_hash": "5c2781510598ca8d5ec163d2e99e104899b90db9980e014523d6d98693fcdc09",
   "site_archive_id": "sitefile_95f5a67f0fa9215fb76be472b181d28039103e3dd7796099e095c8fd386e2bb4",
   "sha256": "edad4666ab46211d7d640b68ed2e92b58c5563613dbaee66574a55c090b0b5e6",
   "size_bytes": 30809570,
   "owner_review_id": "owner_native_revision_approval_79864a3453ced8510683212d3de58d076d90290216e4ceacac1e2506a4654bde"
  },
  "cover": {
   "id": "artifact_abbf023a4b4000c1cc1e722befabd1048f659e85ce540bb3fc230bc2a6b1d28c",
   "artifact_version": 1,
   "artifact_hash": "bbb80883cd7df4d754230944fdf7fc0ae72fcc421c5aa6289132471aca778d73"
  },
  "materials": {
   "cover_3_4": {
    "site_archive_id": "sitefile_94039401003d0869687eb976a90ce9a7694a14f2624adc3e7e1bdf5892ef9fdf",
    "sha256": "93eec9ba917422c77f175faf07192cae79e64937302af85af55329943542c9ae",
    "size_bytes": 2237262,
    "file_name": "deepseek-cover-3x4.png"
   },
   "cover_4_3": {
    "site_archive_id": "sitefile_29b5d6ebf60299adbca30191bc8e16d5faf936dd8d86f8ee0fcdd9f6b0c079af",
    "sha256": "ddd7e75f6fe5372913234ea7d35e03abbf74299b92c5d6f33b332b1f32bdcbe3",
    "size_bytes": 2270607,
    "file_name": "deepseek-cover-4x3.png"
   },
   "promotion": {
    "site_archive_id": "sitefile_c8ced29c3877c3d7d90f34613246cd94c66c7f405905b9bec2abe13591d8f9c3",
    "sha256": "279d522447809bc252738d5455735977bcbaedc591fe0e33c63a4c5d241c8625",
    "size_bytes": 4993,
    "file_name": "deepseek-promotion.md"
   }
  }
 },
 "job_b7dcd6bf-682d-429f-9016-7c9f3df41c16": {
  "binding": {
   "candidate_id": "native_video_779b166e9372b779857fbf29a4a595871379debc31c8b7eea330f14152fdfe3b",
   "candidate_sha256": "11b78d228391cd08ff723eb61aa9abb0d3291387a7b3aaa507a7178e9d1f97dd",
   "contract_hash": "670a348cda9d5941d4a7ac66ba00f1c0ce6388cb0d80fc6bdd595da7315bba6f",
   "mode_epoch": 0,
   "project_id": "91c1db19-3356-4d96-8e6f-475e1a21f68e",
   "revision": 1,
   "script_hash": "8580f6bbad4bdca0c07af05915e61ed734b3fd6c8d492e5c9a21ef92937594fa",
   "timeline_id": "4d0d2cf3-08a5-449b-a71f-bcc9ee25c0f0"
  },
  "source_snapshot_sha256": "2a0dae081626c9b95822effd82391d57d311472205f77981047fe27b504cc249",
  "skill_snapshot_sha256": "c70b286c102ca71480a51c595e530804d0a44506ede668e8a59e28d1173603ef",
  "checkpoint_version": 2,
  "checkpoint_sha256": "53b4a2dc0aadf279087bd37e06bba0819cc21179052e1b8bb1a05c2e73fd89ab",
  "counts": {
   "attempt": 1,
   "reworks": 0,
   "ai_calls": 0
  },
  "scope_id": "media_scope_93308a3c4d5893605c3ff0d313ddaa713303d296c6fdf93753432e50c7cbdf54",
  "scope_hash": "6b07b6dbdb8d46dadb2efe1f3a7e6a086c86f2842dc80cdb30502aaa6a1c58bb",
  "voice_provenance_id": "candidate_voice_41c59d399fbdffabb72e89e18aa59a1922c9fb926d96c65cd958e0a794f07263",
  "video": {
   "id": "native_draft_41174bfef5ac150061f538c6010b65c66aa9c07b61c55f228f2fe6d83f26d9de",
   "artifact_version": 1,
   "artifact_hash": "4e2e95c034fd0380daf2f8a735dd152980ac8dd41731d50468f6814ebbc2441d",
   "site_archive_id": "sitefile_fa7359c91b4035d1be4cda40edc47c0202f72c78fdb8157b55d0ec3b73287e8c",
   "sha256": "11b78d228391cd08ff723eb61aa9abb0d3291387a7b3aaa507a7178e9d1f97dd",
   "size_bytes": 17867352,
   "owner_review_id": "owner_native_formal_e45448c9ceb828149e5c832418b5b017e4114fd64e92aba8b058b261acc05d01"
  },
  "cover": {
   "id": "artifact_50101f698facbea115b7d0e392138c1fb9aca4344be697b9086316d91f11865b",
   "artifact_version": 1,
   "artifact_hash": "6d627296617af1a18d5142bad795273db9bdbd217cafe5451042052f20335718"
  },
  "materials": {
   "cover_3_4": {
    "site_archive_id": "sitefile_66faac15267ac540b8d8f651a954f1da6724a5a86f98dbba93a4712857960965",
    "sha256": "6305d49e17ef2830b7c93a87e63c82f9fc63ef4b497d794554cff43e0d44d04f",
    "size_bytes": 2150560,
    "file_name": "glm-cover-3x4.png"
   },
   "cover_4_3": {
    "site_archive_id": "sitefile_e03c2c77eb587439631dba6c285a539c232780b797aa9fbca1d728f083e21609",
    "sha256": "ad0f31ab1c7cf7b67b33ee42434d3ccce6f4f12ad4acdf8d68b719c6bf8aaede",
    "size_bytes": 2134785,
    "file_name": "glm-cover-4x3.png"
   },
   "promotion": {
    "site_archive_id": "sitefile_48defab9fdf1b88adc15710f801ee6973273fcfc27626f5b7bc5cc3b6792edbb",
    "sha256": "c688a7356b079ab5ac22c48911a0b053577dd831cc3528e7705698916ecdff6f",
    "size_bytes": 5598,
    "file_name": "glm-promotion.md"
   }
  }
 }
});
export function ownerPostVideoTarget(id:unknown):OwnerPostVideoTarget|null{return typeof id==='string'&&Object.hasOwn(OWNER_POST_VIDEO_TARGETS,id)?OWNER_POST_VIDEO_TARGETS[id]:null;}
export function postVideoApprovalEvidence(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('须明确本人原话');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='owner_message_sent_at,quote,reference,source,website_button_clicked'||v.source!=='owner-oral-report'||v.reference!==OWNER_POST_VIDEO_REFERENCE||v.quote!==OWNER_POST_VIDEO_QUOTE||v.owner_message_sent_at!==null||v.website_button_clicked!==false)throw Error('本次认可只接准确原话，不冒充网页点击或用户发送时间');
 return{source:'owner-oral-report' as const,reference:OWNER_POST_VIDEO_REFERENCE,question:OWNER_POST_VIDEO_QUESTION,quote:OWNER_POST_VIDEO_QUOTE,owner_message_sent_at:null,website_button_clicked:false as const};
}
export function postVideoTechnicalVerification(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('缺少完整包技术核验');const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='crc_verified,human_zip_inspected,member_count,member_sha256_verified,package_manifest_sha256,schema,secondary_download_verified,verification_report_sha256'||v.schema!=='private-delivery-package-verification-v1'||!Number.isSafeInteger(v.member_count)||Number(v.member_count)<1||Number(v.member_count)>2000||v.crc_verified!==true||v.member_sha256_verified!==true||v.secondary_download_verified!==true||v.human_zip_inspected!==false||typeof v.package_manifest_sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.package_manifest_sha256)||typeof v.verification_report_sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.verification_report_sha256))throw Error('须准确包清单、CRC和逐文件核验回执；不能声称用户另审ZIP');
 return v;
}

// Preserve only the exact already-reviewed Markdown bytes for these three jobs.
// Generic milestone text continues to use its original trimmed normalization.
export async function exactOwnerPromotionText(job:{id:string;revision:number;approved_hash:string|null;mode_epoch:number;contract_hash:string},value:Record<string,unknown>):Promise<string|null>{
 const t=ownerPostVideoTarget(job.id);if(!t||job.revision!==t.binding.revision||job.approved_hash!==t.binding.script_hash||job.mode_epoch!==t.binding.mode_epoch||job.contract_hash!==t.binding.contract_hash||typeof value.text!=='string'||!value.text.trim()||value.text.length>16000||typeof value.limits!=='string')return null;
 let limits:Record<string,unknown>;try{limits=JSON.parse(value.limits);}catch{return null;}
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).sort().join(',')!=='schema,sha256,site_archive_id'||limits.schema!=='site-promotion-file-v1'||limits.site_archive_id!==t.materials.promotion.site_archive_id||limits.sha256!==t.materials.promotion.sha256)return null;
 const bytes=new TextEncoder().encode(value.text);if(bytes.byteLength!==t.materials.promotion.size_bytes)return null;
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');return sha===t.materials.promotion.sha256?value.text:null;
}

const contractObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const contractCanonical=(v:unknown):string=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(contractCanonical(x))):Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,JSON.parse(contractCanonical(x))])):v);
const contractSame=(a:unknown,b:unknown)=>contractCanonical(a)===contractCanonical(b);
async function contractHash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');}
// Classifies an already owner-validated formal report. This never substitutes
// for the caller's current-node, artifact-byte and real owner audit checks.
export function postVideoMaterialApprovalKind(value:unknown,b:{owner:string;revision:number;artifact_hash:string;mode_epoch:number}):'owner-oral-report'|'owner-node-approval'|null{
 if(!contractObject(value))return null;const r=value;
 if(typeof b.owner!=='string'||!b.owner||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.mode_epoch)||b.mode_epoch<0||!/^[a-f0-9]{64}$/.test(b.artifact_hash)||r.decision!=='approve'||r.actor!==b.owner||r.revision!==b.revision||r.artifact_hash!==b.artifact_hash||r.mode_epoch!==b.mode_epoch)return null;
 if(r.source==='owner-oral-report'){
  const evidence=postVideoApprovalEvidence({source:'owner-oral-report',reference:OWNER_POST_VIDEO_REFERENCE,quote:OWNER_POST_VIDEO_QUOTE,owner_message_sent_at:null,website_button_clicked:false});
  return contractSame(r.approval_evidence,evidence)&&r.website_button_clicked===false&&r.owner_message_sent_at===null&&r.publication_authorized===false&&r.new_paid_calls===0&&r.quality_approved===false?'owner-oral-report':null;
 }
 // Ordinary decideMilestone owner approval has exactly these native fields.
 // Its original report and audit stay intact; no chat or button claim is added.
 return Object.keys(r).sort().join(',')==='actor,artifact_hash,decision,mode_epoch,operation_id,reason,revision'&&r.reason===''&&typeof r.operation_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.operation_id)?'owner-node-approval':null;
}
// Read-only identity proof for the existing retention planner. This is not a
// replacement for its live scope, authorization, storage or cleanup CAS guards.
export async function completedOwnerPostVideoDelivery(value:unknown,owner:string){
 try{
  if(!contractObject(value))return null;const j=value,t=ownerPostVideoTarget(j.id);
  if(!t||!owner||j.is_test!==0||j.status!=='completed'||j.review_mode!=='node'||j.revision!==t.binding.revision||j.approved_revision!==t.binding.revision||j.approved_hash!==t.binding.script_hash||j.mode_epoch!==t.binding.mode_epoch||j.contract_hash!==t.binding.contract_hash||j.checkpoint_version!==t.checkpoint_version||!Array.isArray(j.publication_reports)||j.publication_reports.length||!Array.isArray(j.milestones)||!Array.isArray(j.reviews)||Object.entries(t.counts).some(([k,v])=>j[k]!==v))return null;
  for(const [key,sha] of [['source_snapshot',t.source_snapshot_sha256],['skill_snapshot',t.skill_snapshot_sha256],['checkpoint',t.checkpoint_sha256]])if(typeof j[key]!=='string'||await contractHash(j[key] as string)!==sha)return null;
  const ms=j.milestones.filter(contractObject),reviews=j.reviews.filter(contractObject),evidence=postVideoApprovalEvidence({source:'owner-oral-report',reference:OWNER_POST_VIDEO_REFERENCE,quote:OWNER_POST_VIDEO_QUOTE,owner_message_sent_at:null,website_button_clicked:false});
  const current=(node:string)=>ms.filter(m=>m.node===node&&m.revision===j.revision).sort((a,b)=>Number(b.artifact_version)-Number(a.artifact_version))[0];
  const continuation=contractObject(j.media_continuation)?j.media_continuation:null,scope=continuation&&contractObject(continuation.scope)?continuation.scope:null;
  if(!scope||continuation!.current_id!==t.scope_id||scope.id!==t.scope_id||scope.owner_confirmed===false||await contractHash(contractCanonical(scope))!==t.scope_hash)return null;
  const scopeReview=reviews.find(r=>r.id===t.scope_id&&r.decision==='media_scope'&&r.reviewer===owner&&r.revision===j.revision&&r.content_hash===j.approved_hash&&typeof r.note==='string'&&contractSame(JSON.parse(r.note),scope));if(!scopeReview)return null;
  const voiceJob={...j,id:String(j.id),revision:Number(j.revision),approved_revision:Number(j.approved_revision),approved_hash:String(j.approved_hash),mode_epoch:Number(j.mode_epoch),contract_hash:String(j.contract_hash),review_mode:String(j.review_mode),is_test:Number(j.is_test),source_snapshot:String(j.source_snapshot),owner_id:owner,reviews,media_continuation:{current_id:String(continuation!.current_id),scope}};
  const candidateRow=reviews.find(r=>r.id===t.binding.candidate_id&&r.decision==='native_video_candidate'),candidate=candidateRow&&typeof candidateRow.note==='string'?{id:String(candidateRow.id),value:JSON.parse(candidateRow.note)}:null;
  if(!candidate||!contractSame(candidateReviewBinding(voiceJob,candidate),t.binding))return null;const voice=currentCandidateVoiceProvenance(voiceJob,candidate);if(!voice||voice.id!==t.voice_provenance_id||voice.scope_id!==t.scope_id)return null;
  const editorial=j.id==='job_b7dcd6bf-682d-429f-9016-7c9f3df41c16'?currentEditorialDelivery(voiceJob,t.video.sha256):null;if(j.id==='job_b7dcd6bf-682d-429f-9016-7c9f3df41c16'&&!editorial)return null;
  if(['source','script'].some(node=>current(node)?.status!=='approved'||current(node)?.mode_epoch!==j.mode_epoch)||current('script')?.artifact_hash!==j.approved_hash)return null;

  const parsed:Record<string,{milestone:Record<string,unknown>;artifact:Record<string,unknown>;report:Record<string,unknown>;review:Record<string,unknown>} >={};
  for(const node of ['video','cover','promotion','delivery']){
   const m=current(node);if(!m||m.status!=='approved'||m.mode_epoch!==j.mode_epoch||typeof m.artifact!=='string'||await contractHash(m.artifact)!==m.artifact_hash||typeof m.report!=='string')return null;
   const a=JSON.parse(m.artifact),r=JSON.parse(m.report);if(!contractObject(a)||!contractObject(r)||r.decision!=='approve'||r.actor!==owner||r.revision!==j.revision||r.artifact_hash!==m.artifact_hash||r.mode_epoch!==j.mode_epoch)return null;
   const review=reviews.find(x=>x.decision==='approve'&&x.reviewer===owner&&x.revision===j.revision&&x.content_hash===m.artifact_hash&&x.note===m.report);if(!review)return null;
   if(node==='delivery'&&(r.source!=='owner-authorized-technical-delivery'||!contractSame(r.approval_evidence,evidence)||r.website_button_clicked!==false||r.owner_message_sent_at!==null||r.publication_authorized!==false||r.new_paid_calls!==0||!contractSame(r.binding,t.binding)))return null;
   if(['cover','promotion'].includes(node)){const kind=postVideoMaterialApprovalKind(r,{owner,revision:Number(j.revision),artifact_hash:String(m.artifact_hash),mode_epoch:Number(j.mode_epoch)});if(!kind||kind==='owner-oral-report'&&!contractSame(r.binding,t.binding))return null;}
   parsed[node]={milestone:m,artifact:a,report:r,review};
  }
  const v=parsed.video,c=parsed.cover,p=parsed.promotion,d=parsed.delivery,ref=(x:typeof v)=>({id:x.milestone.id,artifact_version:x.milestone.artifact_version,artifact_hash:x.milestone.artifact_hash});
  if(!contractSame(ref(v),{id:t.video.id,artifact_version:t.video.artifact_version,artifact_hash:t.video.artifact_hash})||v.review.id!==t.video.owner_review_id||v.artifact.sha256!==t.video.sha256||!contractObject(v.artifact.qa)||v.artifact.qa.site_archive_id!==t.video.site_archive_id||v.artifact.qa.voice_provenance_id!==t.voice_provenance_id||v.artifact.qa.voice_kind!=='owner-cloned'||!contractSame(ref(c),t.cover)||!contractObject(c.artifact.qa)||!contractSame(c.artifact.qa.site_archive_ids,{cover_3_4:t.materials.cover_3_4.site_archive_id,cover_4_3:t.materials.cover_4_3.site_archive_id})||c.artifact.qa.promotion_site_archive_id!==t.materials.promotion.site_archive_id||c.artifact.qa.post_video_delivery_id!==t.video.id||c.artifact.sha256!==t.materials.cover_3_4.sha256)return null;
  if(typeof p.artifact.text!=='string'||await contractHash(p.artifact.text)!==t.materials.promotion.sha256||typeof p.artifact.limits!=='string'||!contractSame(JSON.parse(p.artifact.limits),{schema:'site-promotion-file-v1',site_archive_id:t.materials.promotion.site_archive_id,sha256:t.materials.promotion.sha256})||typeof d.artifact.limits!=='string')return null;
  const l=JSON.parse(d.artifact.limits);if(!contractObject(l)||l.schema!=='site-private-delivery-v1'||!contractObject(l.complete_bundle)||!/^sitefile_[a-f0-9]{64}$/.test(String(l.complete_bundle.site_archive_id))||!/^[a-f0-9]{64}$/.test(String(l.complete_bundle.sha256))||!Number.isSafeInteger(l.complete_bundle.size_bytes)||Number(l.complete_bundle.size_bytes)<1||l.project_id!==t.binding.project_id||l.timeline_id!==t.binding.timeline_id||l.secondary_download_verified!==true||l.external_publication!==false||l.new_paid_calls!==0||d.report.completion_authorized!==true||d.report.human_zip_inspected!==false||!contractObject(d.report.technical_verification))return null;
  const technical=d.report.technical_verification,technicalInput=Object.fromEntries(['schema','package_manifest_sha256','verification_report_sha256','member_count','crc_verified','member_sha256_verified','secondary_download_verified','human_zip_inspected'].map(k=>[k,technical[k]]));postVideoTechnicalVerification(technicalInput);
  if(technical.verification_source!=='owner-service-technical-report'||l.package_manifest_sha256!==technical.package_manifest_sha256||l.package_verification_report_sha256!==technical.verification_report_sha256||l.package_member_count!==technical.member_count)return null;
  const tuple=(f:Pick<PostVideoFileReference,'site_archive_id'|'sha256'|'size_bytes'>)=>({site_archive_id:f.site_archive_id,sha256:f.sha256,size_bytes:f.size_bytes}),archives={video:tuple(t.video),cover_3_4:tuple(t.materials.cover_3_4),cover_4_3:tuple(t.materials.cover_4_3),promotion:tuple(t.materials.promotion)},approvals=Object.fromEntries(['video','cover','promotion'].map(node=>{const x=parsed[node];return[node,{milestone_id:x.milestone.id,artifact_hash:x.milestone.artifact_hash,review_id:x.review.id,reviewed_at:x.review.created_at}];}));
  const streamed=technical.server_streamed_files;if(!contractSame(l.archives,archives)||!contractSame(l.approvals,approvals)||!Array.isArray(streamed)||streamed.length!==5||![...Object.values(archives),l.complete_bundle].every(f=>streamed.some((x:unknown)=>contractObject(x)&&x.server_full_stream_sha256_verified===true&&contractSame({site_archive_id:x.site_archive_id,sha256:x.sha256,size_bytes:x.size_bytes},f))))return null;
  const oralAudits:Record<string,unknown>[]=[];for(const node of ['cover','promotion']){const x=parsed[node];if(postVideoMaterialApprovalKind(x.report,{owner,revision:Number(j.revision),artifact_hash:String(x.milestone.artifact_hash),mode_epoch:Number(j.mode_epoch)})==='owner-node-approval')continue;const a=reviews.find(r=>r.decision==='owner_post_video_approval_v1'&&r.reviewer===owner&&r.revision===j.revision&&r.content_hash===x.milestone.artifact_hash&&typeof r.note==='string'&&(()=>{const n=JSON.parse(r.note as string);return n.review_id===x.review.id&&contractSame(n.milestone,ref(x))&&contractSame(n.approval_evidence,evidence)&&contractSame(n.binding,t.binding)&&n.voice_provenance_id===t.voice_provenance_id&&n.scope_id===t.scope_id&&n.scope_hash===t.scope_hash&&n.website_button_clicked===false;})());if(!a||JSON.parse(a.note as string).formal_report_sha256!==await contractHash(x.milestone.report as string))return null;oralAudits.push(a);}
  const audit=reviews.find(r=>r.decision==='owner_post_video_delivery_complete_v1'&&r.reviewer===owner&&r.revision===j.revision&&r.content_hash===d.milestone.artifact_hash&&typeof r.note==='string'&&(()=>{const n=JSON.parse(r.note as string);return n.review_id===d.review.id&&n.formal_report_sha256&&n.milestone?.id===d.milestone.id&&n.milestone?.artifact_hash===d.milestone.artifact_hash&&contractSame(n.approval_evidence,evidence)&&contractSame(n.binding,t.binding)&&n.voice_provenance_id===t.voice_provenance_id&&n.scope_id===t.scope_id&&n.scope_hash===t.scope_hash&&n.website_button_clicked===false&&n.human_zip_inspected===false&&contractSame(n.technical_verification,technical);})());
  if(!audit||JSON.parse(audit.note as string).formal_report_sha256!==await contractHash(d.milestone.report as string))return null;
  return{target:t,binding:t.binding,video:v.milestone,cover:c.milestone,promotion:p.milestone,delivery:d.milestone,complete_bundle:l.complete_bundle,approvals,technical_verification:technical,audit_id:String(audit.id),review_rows:[...Object.values(parsed).map(x=>x.review),...oralAudits,audit,scopeReview,candidateRow!,...reviews.filter(r=>r.id===voice.id||r.id===voice.audio_intake_id||editorial&&r.id===editorial.id)],source_snapshot:j.source_snapshot,skill_snapshot:j.skill_snapshot,checkpoint:j.checkpoint,...(editorial?{editorial}:{})};
 }catch{return null;}
}
