import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
export async function holdProductionAwake({metadataDir,platform=process.platform,spawnChild=spawn,ownerPid=process.pid}={}){
 if(platform!=='win32')return{status:'not-required',release:async()=>{}};
 // Use the installed Codex PowerShell host with its existing policy. Never
 // change execution policy or pass an execution-policy override.
 const bundled=path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'),shell=fs.existsSync(bundled)?bundled:'powershell.exe';
 const script=fileURLToPath(new URL('./production-awake.ps1',import.meta.url)),child=spawnChild(shell,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',script,'-OwnerProcessId',String(ownerPid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let closed=false,buffer='',held=false,finished;const ended=new Promise(resolve=>{finished=resolve});
 const record=value=>{if(metadataDir){fs.mkdirSync(metadataDir,{recursive:true});fs.writeFileSync(path.join(metadataDir,'power-lease.json'),JSON.stringify({...value,owner_pid:ownerPid,helper_pid:child.pid,observed_at:new Date().toISOString()},null,2));}};
 const status=await new Promise(resolve=>{let settled=false;const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};const timer=setTimeout(()=>done('unavailable'),10000);
  child.stdout.on('data',chunk=>{buffer+=chunk.toString('utf8');let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const v=JSON.parse(line);record(v);if(v.status==='held'){held=true;done('held')}}catch{}}});
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});child.once('error',()=>{closed=true;done('unavailable');finished()});child.once('close',()=>{closed=true;done('unavailable');finished()});
 });
 if(!held){record({status:'unavailable',system_required:false,global_settings_changed:false});child.stdin.end();}
 let release;return{status,helper_pid:child.pid,release:()=>release??=(async()=>{if(!closed)child.stdin.end();let timer;try{await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(resolve,10000)})]);}finally{clearTimeout(timer)}if(!closed)child.kill();})()};
}
