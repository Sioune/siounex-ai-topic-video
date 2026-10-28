import {identity,json} from '@/lib/api';
import {readSeries,saveSeries,saveTemplate,rebindSeries} from '@/lib/series';
import {ProductionError,text} from '@/lib/production-contract';
export async function GET(req:Request){const owner=await identity(req);if(!owner)return json({error:'请登录查看系列资产'},401);try{return json(await readSeries(text(new URL(req.url).searchParams.get('id'),100),owner));}catch(e){return fail(e);}}
export async function POST(req:Request){const owner=await identity(req,true);if(!owner)return json({error:'登录或请求来源无效'},403);try{const raw=await req.text();if(raw.length>12000)throw new ProductionError('请求太大',400);const b=JSON.parse(raw),id=text(b.id,100);if(b.action==='select')return json(await saveSeries(id,owner,b));if(b.action==='rebind')return json(await rebindSeries(id,owner,b));if(b.action==='template_save')return json(await saveTemplate(id,owner,b));throw new ProductionError('系列操作无效',400);}catch(e){return fail(e);}}
function fail(e:unknown){return json({error:e instanceof ProductionError?e.message:'系列记录未保存，请重新读取后核对'},e instanceof ProductionError?e.status:503);}
