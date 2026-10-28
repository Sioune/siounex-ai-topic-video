import {json} from '@/lib/api';import {readIntake} from '@/lib/production-intake';
// Non-personal research proposal only, behind the same private Site boundary.
// GET grants no execution authority. Mutations use owner production or executor routes.
export async function GET(req:Request){const id=new URL(req.url).searchParams.get('topic_id');if(!id)return json({error:'缺少选题ID'},400);return json({proposal:await readIntake(id)});}
