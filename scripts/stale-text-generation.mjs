import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function sameProcessStillAlive(pid,finishedAt,{probe=(p)=>process.kill(p,0),createdAt=(p)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${p} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true,timeout:5000}).trim(),platform=process.platform}={}){
 try{probe(pid)}catch(e){return e.code!=='ESRCH'}
 // A process created after the old receipt finished cannot be the old PID,
 // even when that receipt could not confirm termination. Unknown stays alive.
 if(platform==='win32'&&Number.isFinite(Date.parse(finishedAt)))try{const created=Date.parse(createdAt(pid));if(Number.isFinite(created)&&created>Date.parse(finishedAt))return false}catch{}
 return true;
}
const alive=(pid,finishedAt)=>sameProcessStillAlive(pid,finishedAt);
// A dead, read-only text child cannot submit to the site. Preserve every old
// marker/log and use a separate directory for the next attempt. Never replace
// an output that could be recovered or run concurrently with its owner.
export function inspectStaleTextAttempt({cacheDir,root=process.cwd(),isProcessAlive=alive}){
 const starts=[];
 function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Linked text state requires recovery');const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.name==='invocation-started.json')starts.push(f);}}
 walk(cacheDir);if(!starts.length)return {started:false};
 for(const file of starts){const dir=path.dirname(file),marker=JSON.parse(fs.readFileSync(file,'utf8'));if(fs.existsSync(path.join(dir,'cli-output.json'))&&!fs.existsSync(path.join(dir,'receipt.json')))throw Error('Prior text output exists; recover it before retry');if(!marker.metadata_dir)throw Error('Prior text process identity unavailable');const meta=path.resolve(root,marker.metadata_dir),base=path.resolve(root,'.sites-runtime','executions');if(!meta.startsWith(base+path.sep))throw Error('Prior text process identity outside execution root');const start=JSON.parse(fs.readFileSync(path.join(meta,'cli-process-started.json'),'utf8')),owned=JSON.parse(fs.readFileSync(path.join(meta,'cli-owned-child.json'),'utf8'));if(start.sandbox!=='read-only'||start.scope!=='owned-cli-child-tree'||owned.scope!==start.scope||owned.started_at!==start.started_at||!Number.isInteger(owned.pid)||owned.pid<=0)throw Error('Prior text process identity unavailable');let finishedAt=null;try{const exit=JSON.parse(fs.readFileSync(path.join(meta,'cli-process-exit.json'),'utf8'));if(exit.pid===owned.pid&&exit.started_at===owned.started_at)finishedAt=exit.finished_at}catch{}for(const pid of [owned.pid,owned.parent_pid])if(Number.isInteger(pid)&&pid>0&&isProcessAlive(pid,finishedAt))throw Error('Prior text process still running');}
 return {started:true};
}
