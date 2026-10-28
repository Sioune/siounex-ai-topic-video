export const SOURCE_INPUT_REQUIRED='来源正文或原文配图尚未取得完整可用输入；请补充完整原文，或重新尝试读取。尚未领取任务或调用模型。';
export const SOURCE_DIAGNOSTIC_CODES={
 text:['source-http','source-network','source-empty','source-too-large','source-format','source-host','source-unavailable'],
 images:['image-http','image-network','image-too-large','image-format','image-host','image-limit','image-decode','image-cache','image-unavailable'],
} as const;
export type SourceDiagnostic={stage:'text'|'images';code:string;status?:number;host?:string;retryable:boolean};
// Only this small schema crosses the worker/API boundary. Never persist exception
// messages, source bytes, request headers, credentials or arbitrary provider data.
export function sourceDiagnostic(value:unknown):SourceDiagnostic|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>,stage=v.stage;
 if((stage!=='text'&&stage!=='images')||typeof v.code!=='string'||!(SOURCE_DIAGNOSTIC_CODES[stage] as readonly string[]).includes(v.code)||typeof v.retryable!=='boolean')return null;
 const result:SourceDiagnostic={stage,code:v.code,retryable:v.retryable};
 if(v.status!==undefined){if(!Number.isInteger(v.status)||Number(v.status)<100||Number(v.status)>599)return null;result.status=Number(v.status);}
 if(v.host!==undefined){if(typeof v.host!=='string'||v.host.length>253||!/[a-z]/i.test(v.host)||!v.host.includes('.')||!v.host.split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(p)))return null;result.host=v.host.toLowerCase();}
 return result;
}
export type SourceInputBinding={revision:number;mode_epoch:number;contract_hash:string;source_snapshot_hash?:string|null};
export function sourceReviewNote(row:Record<string,unknown>,current:SourceInputBinding,exactRevision=true):Record<string,unknown>|null{
 try{const note=JSON.parse(String(row.note)),b=note.binding;if(!b||b.contract_hash!==current.contract_hash||exactRevision&&(b.revision!==current.revision||b.mode_epoch!==current.mode_epoch)||current.source_snapshot_hash&&b.source_snapshot_hash!==current.source_snapshot_hash)return null;return note;}catch{return null;}
}
export function latestSourceBlock(reviews:Record<string,unknown>[],current:SourceInputBinding){
 for(const row of reviews){if(row.decision!=='source_input_block')continue;const note=sourceReviewNote(row,current);if(note&&(note.schema==='source-input-block-v1'||note.schema==='source-input-block-v2'))return {id:String(row.id),diagnostic:sourceDiagnostic(note.diagnostic)};}
 return null;
}
export function sourceDiagnosticCopy(d:SourceDiagnostic|null){
 if(!d)return {title:'来源准备暂未完成',detail:'旧记录未保存具体原因，重试后会显示具体读取结果',remedy:'重新准备来源',canProvideText:true};
 const text:Record<string,string>={'source-http':'来源网站未正常返回正文','source-network':'来源网站连接超时或暂时不可达','source-empty':'读取结果缺少可用正文','source-too-large':'来源页面超过完整读取范围','source-format':'来源页面未能识别为可用正文','source-host':'该来源域名尚未接入正文读取','source-unavailable':'来源正文暂时不可读取','image-http':'原文配图服务器未正常返回图片','image-network':'原文配图连接超时或暂时不可达','image-too-large':'原文配图超过读取范围','image-format':'原文配图格式暂不支持','image-host':'原文配图地址未通过读取检查','image-limit':'原文配图数量超出本次准备范围','image-decode':'原文配图未能完成解码','image-cache':'原文配图准备记录需要重新建立','image-unavailable':'原文配图准备暂未完成'};
 return {title:d.stage==='images'?'正文已取得，配图准备待处理':'来源正文准备待处理',detail:text[d.code]||'来源准备暂未完成',remedy:d.stage==='images'?'重新准备原文配图':d.retryable?'重新尝试读取正文':'重新检查来源',canProvideText:d.stage==='text'};
}
