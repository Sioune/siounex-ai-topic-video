import {requireChatGPTUser} from '@/app/chatgpt-auth';
import PublishingCenter from '@/components/publishing-center';

export const dynamic='force-dynamic';

export default async function Page(){
 await requireChatGPTUser('/publishing');
 return <PublishingCenter/>;
}
