import {requireChatGPTUser} from '@/app/chatgpt-auth';
import MobileDataUpload from '@/components/mobile-data-upload';

export const dynamic='force-dynamic';
export default async function DataUploadPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const values=await searchParams,collection=typeof values.collection==='string'?values.collection.slice(0,200):'',query=new URLSearchParams();if(collection)query.set('collection',collection);await requireChatGPTUser('/data/upload'+(query.size?'?'+query.toString():''));return <MobileDataUpload collectionId={collection}/>;}
