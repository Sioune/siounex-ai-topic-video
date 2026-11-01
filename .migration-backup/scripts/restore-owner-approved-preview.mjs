import {createNativeProductionTransport} from './native-production-transport.mjs';
import {restoreOwnerApprovedPreview} from './private-review-continuation.mjs';
const id=process.argv[2];if(!/^job_[a-f0-9-]{36}$/.test(id||''))throw Error('Exact existing job ID required');
const transport=createNativeProductionTransport({cwd:process.cwd()});
try{const call=async body=>{const r=await transport.call(body);if(r.status!==200)throw Object.assign(Error('Private production action failed: '+body.action),{status:r.status});return r.body};const r=await restoreOwnerApprovedPreview(id,{call,root:process.cwd()});console.log(JSON.stringify({status:r.status,local_draft_id:r.local_draft_id||null,reused:r.reused===true,new_paid_calls:0,publication_authorized:false}));}
finally{await transport.close()}
