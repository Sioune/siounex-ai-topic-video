import {requireChatGPTUser} from '@/app/chatgpt-auth';
import ResearchDesk from '@/components/research-desk';

export const dynamic='force-dynamic';
export default async function ResearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const values=await searchParams,query=new URLSearchParams();
 for(const key of ['id','version']){const value=values?.[key];if(typeof value==='string'&&value.length<=200)query.set(key,value)}
 await requireChatGPTUser('/research'+(query.size?'?'+query.toString():''));
 return <ResearchDesk/>;
}
