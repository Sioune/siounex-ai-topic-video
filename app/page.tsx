import {requireChatGPTUser} from './chatgpt-auth';import Workspace from './workspace';
import {Suspense} from 'react';import WorkspaceLoading from '@/components/workspace-loading';
export const dynamic='force-dynamic';
// Render the navigation and workspace shell without waiting for the whole
// library to be serialized into the server-rendered page. The authenticated
// library endpoint loads the same complete data after the shell hydrates.
async function SignedInWorkspace({returnTo}:{returnTo:string}){await requireChatGPTUser(returnTo);return <Workspace initial={null} deferInitialLoad/>;}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const values=await searchParams;const query=new URLSearchParams();for(const key of ['topic','q','category','time','material','sort','tab']){const value=values?.[key];if(typeof value==='string')query.set(key,value.slice(0,200))}return <Suspense fallback={<WorkspaceLoading/>}><SignedInWorkspace returnTo={query.size?'/?'+query.toString():'/'}/></Suspense>;}
