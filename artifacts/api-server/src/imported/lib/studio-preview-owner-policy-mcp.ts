import {ProductionError} from './production-contract';
import {studioPreviewOwnerPolicyRequest} from './studio-preview-owner-policy';

export const STUDIO_PREVIEW_OWNER_POLICY_MCP_NAME='studio_preview_owner_policy_request';
const MAX_REQUEST_JSON=16000;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));

export const studioPreviewOwnerPolicyMcpTools=[{
 name:STUDIO_PREVIEW_OWNER_POLICY_MCP_NAME,
 description:'本人规则登记/读取入口。request_json仅read或register，绑定现有同一换声request、批准全文、私人Siounex声与原普通版；按当前用户明确指令记录缓存优先、必要时重新生成试听后读取、零新增付费及单编辑窗口原则。不执行媒体、不新建换声请求、不清Play或未知历史、不代人工二审。MCP记录来源为当前用户消息，不表示本人点击站内按钮；登记不执行试听；本次是否实际取音或回站，须读取原队列的真实回执。',
 inputSchema:{type:'object',properties:{request_json:{type:'string',minLength:2,maxLength:MAX_REQUEST_JSON}},required:['request_json'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
}];

export async function callStudioPreviewOwnerPolicyMcp(owner:string,name:string,args:Record<string,unknown>){
 if(name!==STUDIO_PREVIEW_OWNER_POLICY_MCP_NAME)throw new ProductionError('本人试听规则工具不存在',400);
 if(typeof owner!=='string'||!owner.trim())throw new ProductionError('须当前真实本人身份登记或读取试听规则',403);
 if(!record(args)||!exact(args,['request_json'])||typeof args.request_json!=='string'||args.request_json.length<2||args.request_json.length>MAX_REQUEST_JSON)throw new ProductionError('本人试听规则工具只接受request_json，不能指定身份或额外操作',400);
 let body:unknown;
 try{body=JSON.parse(args.request_json);}catch{throw new ProductionError('本人试听规则请求须为JSON对象',400);}
 if(!record(body)||!['read','register'].includes(String(body.action)))throw new ProductionError('本人试听规则仅允许read或register',400);
 const fields=['action','job_id','request_id'];
 if(body.action==='read'){
  if(!exact(body,fields))throw new ProductionError('读取本人试听规则不接受额外字段',400);
 }else{
  if(!exact(body,[...fields,'confirmed','request_version','instruction'])||!record(body.instruction)||!exact(body.instruction,['instruction_id','source_reference','source_chat_id','instruction_text','instruction_text_sha256','observed_at'],['source_turn_id']))throw new ProductionError('登记须原请求及当前用户指令，不能伪造来源、按钮或身份',400);
 }
 // Sites supplies owner after its audience/identity check. The caller cannot
 // select this channel or claim a web button event through JSON arguments.
 return studioPreviewOwnerPolicyRequest(owner,{request_json:args.request_json},{channel:'mcp'});
}
