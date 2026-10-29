import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function identity(req:Request,write=false){const user=await getChatGPTUser();if(!user)return null;if(write){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)return null;if(!req.headers.get('content-type')?.includes('application/json'))return null;}return user.userId;}
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
