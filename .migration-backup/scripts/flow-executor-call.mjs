import {executorFetch as fetch,holdNativeProductionTransport} from './native-production-transport.mjs';
import {readNativeSiteCredential} from './native-credential-direct.mjs';
import {executorResponse,executorTimeoutMs} from './executor-response.mjs';
// Credentials stay in this closure. Only a definitive authentication rejection
// can refresh and resubmit the exact body; lost responses are never retried.
export function createFlowExecutor({token,project_id,cwd=process.cwd(),requestTimeout}={}, {request=fetch,readCredential=readNativeSiteCredential,now=Date.now}={}){
 if(typeof token!=='string'||!token||typeof project_id!=='string'||!project_id)throw Error('CREDENTIAL_INVALID_READ_SCOPE');
 let current=token,renewing=null,closed=false;const releaseTransport=holdNativeProductionTransport();
 const refresh=async stale=>{
  if(closed)throw Error('CREDENTIAL_FLOW_CLOSED');if(current!==stale)return;
  if(!renewing)renewing=(async()=>{const r=await readCredential(project_id,{cwd,deadline:now()+120000});if(closed||r?.diagnostic?.code!=='CREDENTIAL_READ_SUCCEEDED'||typeof r.token!=='string'||!r.token)throw Error('CREDENTIAL_FLOW_REFRESH_FAILED');current=r.token;r.token=null;})().finally(()=>{renewing=null;});
  await renewing;
 };
 const call=async body=>{
  if(closed)throw Error('CREDENTIAL_FLOW_CLOSED');const serialized=JSON.stringify(body),before=current;
  const send=value=>request('https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+value},body:serialized,redirect:'error',signal:AbortSignal.timeout(requestTimeout?requestTimeout(body.action):executorTimeoutMs(body.action))});
  let response=await send(before);
  if(response.status===401){await response.text();await refresh(before);response=await send(current);}
  return executorResponse(response);
 };
 return{call,close(){closed=true;current='';return releaseTransport();}};
}
