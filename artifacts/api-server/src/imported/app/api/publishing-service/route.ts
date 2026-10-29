import {json} from '@/lib/api';
import {publishingAction,publishingDashboard,publishingServiceOwner} from '@/lib/publishing-controller';
import {ProductionError} from '@/lib/production-contract';
// This route is reachable only through the owner-private Sites dispatch boundary.
// No visitor identity, token, owner, SQL or browser cookie is accepted in arguments.
// Approved external MV intake stores owner-local media references; it does not read server paths.
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(req.headers.has('origin')||req.headers.has('sec-fetch-site')||!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||'')||req.headers.get('x-publishing-service')!=='owner-private')return json({error:'仅支持本人私有站点的服务请求'},403);
 try{const raw=await req.text();if(raw.length>40000)throw new ProductionError('请求过大',400);const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b)||'owner_id' in b||'owner' in b)throw new ProductionError('服务不接受请求提供所有者',403);if(b.action==='read_dashboard'&&Object.keys(b).some(k=>k!=='action'))throw new ProductionError('读取发布概况不接受其他参数',400);const owner=await publishingServiceOwner();return json(b.action==='read_dashboard'?await publishingDashboard(owner):await publishingAction(owner,b,'automation'));}catch(e){return json({error:e instanceof ProductionError?e.message:'私有发布服务暂不可用，请保留原有回执后重读。'},e instanceof ProductionError?e.status:503);}
}
