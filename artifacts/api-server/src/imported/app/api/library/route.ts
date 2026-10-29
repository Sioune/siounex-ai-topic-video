import {identity,json} from '@/lib/api';import {library} from '@/lib/store';
export async function GET(req:Request){const id=await identity(req);if(!id)return json({error:'请重新登录后查看选题。'},401);try{return json(await library(id))}catch(e){console.error('library',e);return json({error:'选题库暂时无法读取，请重试。'},503)}}
