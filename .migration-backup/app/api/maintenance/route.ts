import {identity,json} from '@/lib/api';import {recoveryExport} from '@/lib/maintenance';
// This route reads only. Hosted access remains the existing owner-only Sites policy.
export async function POST(req:Request){
 if(req.headers.has('origin')){if(!await identity(req,true))return json({error:'身份或来源无效'},403)}else if(req.headers.has('sec-fetch-site')||!req.headers.get('content-type')?.includes('application/json'))return json({error:'服务请求来源无效'},403);
 try{const raw=await req.text();if(raw.length>100||JSON.parse(raw).action!=='recovery_export')return json({error:'仅支持只读恢复备份'},400);return json(await recoveryExport());}catch{return json({error:'完整只读备份未完成；不要应用迁移'},503)}
}
