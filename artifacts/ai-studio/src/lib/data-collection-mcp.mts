type Reminder = {upload_url:string};
type Dependencies = {
 readDue:(owner:string)=>Promise<{reminders:Reminder[]}>;
 markGenerated:(owner:string,args:{reminder_ids:unknown;request_id:unknown})=>Promise<unknown>;
 extraTools?:Record<string,unknown>[];
 callExtra?:(owner:string,name:string,args:Record<string,unknown>)=>Promise<unknown>;
};
const tools = [
 {name:'read_due_collection_reminders',description:'读取本人已登记发布作品当前到期且未生成提醒、未上传截图、未采样的24/48小时采集任务。没有到期任务时返回空列表。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'mark_collection_reminders_generated',description:'在实际整理出本次提醒内容后，记录这些提醒已生成，避免重复提醒。此记录不表示设备通知已经送达。仅接受当前到期且尚未上传或采样的本人提醒ID。',inputSchema:{type:'object',properties:{reminder_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:100},request_id:{type:'string',minLength:1,maxLength:120}},required:['reminder_ids','request_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
async function boundedJson(req:Request){
 if(Number(req.headers.get('content-length'))>1500000)throw new Error('请求过大');
 const reader=req.body?.getReader();if(!reader)throw new Error('请求为空');
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>1500000){await reader.cancel();throw new Error('请求过大');}chunks.push(item.value);}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 const value=JSON.parse(new TextDecoder().decode(bytes));
 // Existing small control requests keep their original bound. Only this
 // owner-authenticated, byte-pinned private-media staging tool accepts chunks.
 if(length>32768&&!(value?.method==='tools/call'&&['stage_v6_outro_parts','production_runtime_request'].includes(value?.params?.name)))throw new Error('请求过大');
 return value;
}
export async function handleCollectionMcp(req:Request,deps:Dependencies):Promise<Response>{
 const origin=req.headers.get('origin'),fetchSite=req.headers.get('sec-fetch-site');
 if((origin&&origin!==new URL(req.url).origin)||fetchSite==='cross-site')return response({jsonrpc:'2.0',id:null,error:{code:-32001,message:'不接受跨站请求'}},403);
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))return response({jsonrpc:'2.0',id:null,error:{code:-32600,message:'请使用JSON请求'}},415);
 let message:unknown;
 try{message=await boundedJson(req);}catch{return response({jsonrpc:'2.0',id:null,error:{code:-32700,message:'无法解析请求或请求过大'}},400);}
 if(!record(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||(message.id!==undefined&&message.id!==null&&typeof message.id!=='number'&&typeof message.id!=='string'))return response({jsonrpc:'2.0',id:null,error:{code:-32600,message:'无效的JSON-RPC请求'}},400);
 const id=message.id??null;
 const result=(value:unknown)=>response({jsonrpc:'2.0',id,result:value});
 const error=(code:number,description:string,status=200)=>response({jsonrpc:'2.0',id,error:{code,message:description}},status);
 if(message.method==='server/discover')return result({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(message.method==='initialize')return result({protocolVersion:'2026-07-28',serverInfo:{name:'topic-studio-collections',version:'1.0.0'},capabilities:{tools:{}}});
 if(message.method==='notifications/initialized')return new Response(null,{status:204});
 if(message.method==='ping')return result({});
 if(message.method==='tools/list')return result({tools:[...tools,...(deps.extraTools||[])]});
 if(message.method!=='tools/call')return error(-32601,'方法不存在');
 // Identity is forwarded by Sites after its audience access check, never supplied by tool arguments.
 const owner=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
 if(!owner||!email)return error(-32001,'请连接本人账号后读取私有采集任务',401);
 const params=message.params;
 if(!record(params)||typeof params.name!=='string')return error(-32602,'缺少工具名称');
 const args=params.arguments??{};
 if(!record(args))return error(-32602,'工具参数必须是对象');
 let output:unknown;
 try{
  if(params.name==='read_due_collection_reminders'){
   if(Object.keys(args).length)return error(-32602,'此工具不接受账号或其他参数');
   const due=await deps.readDue(owner),origin=new URL(req.url).origin;
   output={reminders:due.reminders.map(reminder=>({...reminder,upload_url:new URL(reminder.upload_url,origin).href})),notification_delivery:'not_asserted'};
  }else if(params.name==='mark_collection_reminders_generated'){
   if(Object.keys(args).some(key=>!['reminder_ids','request_id'].includes(key))||!Array.isArray(args.reminder_ids)||!args.reminder_ids.length||args.reminder_ids.length>100||args.reminder_ids.some(value=>typeof value!=='string'||!value.length||value.length>100)||typeof args.request_id!=='string'||!args.request_id.trim()||args.request_id.length>120)return error(-32602,'请提供实际到期提醒ID和唯一请求ID');
   output=await deps.markGenerated(owner,{reminder_ids:args.reminder_ids,request_id:args.request_id});
  }else if(deps.callExtra&&deps.extraTools?.some(tool=>tool.name===params.name)){
   output=await deps.callExtra(owner,params.name,args);
  }else return error(-32602,'工具不存在');
 }catch(e){
  const status=record(e)&&typeof e.status==='number'?e.status:500;
  return result({content:[{type:'text',text:status<500&&e instanceof Error?e.message:'读取或保存采集提醒失败，请稍后重试'}],isError:true});
 }
 return result({content:[{type:'text',text:JSON.stringify(output)}],isError:false});
}
