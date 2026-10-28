import {identity,json} from '@/lib/api';
import {evidenceSameOrigin,readEvidenceUpload,saveEvidenceBytes} from '@/lib/data-evidence';
import {ProductionError} from '@/lib/production-contract';

export async function POST(req:Request){
 const owner=await identity(req);if(!owner||!evidenceSameOrigin(req,true))return json({error:'请登录并从本站上传截图'},403);
 try{return json(await saveEvidenceBytes(owner,await readEvidenceUpload(req)));}
 catch(e){return json({error:e instanceof Error?e.message:'截图上传未完成'},e instanceof ProductionError?e.status:503);}
}
