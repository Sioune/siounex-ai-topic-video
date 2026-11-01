import {identity,json} from '@/lib/api';
import {db} from '@/lib/store';
import {readOwnerFeedback} from '@/lib/owner-feedback-records.mts';

export async function GET(req:Request){
 const owner=await identity(req);
 if(!owner)return json({error:'请登录本人工作区'},401);
 return json({records:await readOwnerFeedback(db(),owner)});
}
