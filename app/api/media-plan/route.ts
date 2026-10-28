import {identity,json} from '@/lib/api';
import {readMediaPlan,saveMediaPlan} from '@/lib/media-plans';
import {ProductionError,text} from '@/lib/production-contract';
export async function GET(req:Request){const owner=await identity(req);if(!owner)return json({error:'请登录后读取素材方案'},401);try{return json(await readMediaPlan(text(new URL(req.url).searchParams.get('id'),100),owner))}catch(e){return error(e)}}
export async function POST(req:Request){const owner=await identity(req,true);if(!owner)return json({error:'登录身份或请求来源无效'},403);try{const raw=await req.text();if(raw.length>100000)throw new ProductionError('请求过长',400);const b=JSON.parse(raw);return json(await saveMediaPlan(text(b.id,100),owner,b))}catch(e){return error(e)}}
function error(e:unknown){return json({error:e instanceof Error?e.message:'方案保存失败'},e instanceof ProductionError?e.status:400)}
