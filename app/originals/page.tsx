import {requireChatGPTUser} from '@/app/chatgpt-auth';
import OriginalDesk from '@/components/original-desk';

export const dynamic='force-dynamic';
export default async function OriginalsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const values=await searchParams,query=new URLSearchParams();
 for(const key of ['id','version']){const value=values?.[key];if(typeof value==='string'&&value.length<=200)query.set(key,value)}
 await requireChatGPTUser('/originals'+(query.size?'?'+query.toString():''));
 return <OriginalDesk/>;
}
