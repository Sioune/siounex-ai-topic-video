import {requireChatGPTUser} from '@/app/chatgpt-auth';
import ProductionDesk from '@/components/production-desk';
export const dynamic='force-dynamic';
export default async function ProductionPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const values=await searchParams,query=new URLSearchParams();for(const key of ['topic','job']){const value=values?.[key];if(typeof value==='string'&&value.length<=100)query.set(key,value)}await requireChatGPTUser('/production'+(query.size?'?'+query.toString():''));return <ProductionDesk/>}
