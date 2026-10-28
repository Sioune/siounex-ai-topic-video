import {identity,json} from '@/lib/api';import {refreshFeeds} from '@/lib/store';
// The shared feed updater is protected by the owner-private Sites access boundary.
// Browser calls also require identity + same-origin JSON. Dispatch-authenticated service
// calls have no visitor identity and may omit Origin; they cannot read/write favorites.
export async function POST(req:Request){
 if(req.headers.has('origin')){if(!await identity(req,true))return json({error:'登录已过期或请求来源无效，请刷新页面。'},403)}
 else if(req.headers.has('sec-fetch-site')||!req.headers.get('content-type')?.includes('application/json'))return json({error:'请求来源无效'},403);
 let b;try{b=await req.json()}catch{return json({error:'请求格式无效'},400)}if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)return json({error:'仅支持刷新固定白名单，不接受自定义网址。'},400);
 try{return json(await refreshFeeds())}catch(e){console.error('refresh',e);return json({error:'刷新暂时失败，已有选题与收藏仍保留。'},503)}
}
