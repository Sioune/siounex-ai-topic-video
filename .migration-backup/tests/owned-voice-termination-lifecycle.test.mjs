import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {terminateOwned} from '../scripts/heygen-studio-app-server-child.mjs';
import {stopOwned} from '../scripts/native-speech-read-direct.mjs';
import {terminateOwned as terminateCredentialOwned} from '../scripts/native-credential-direct.mjs';

const helpers=[['Studio owner shutdown','terminateOwned','../scripts/heygen-studio-app-server-child.mjs',terminateOwned],['native voice catalog shutdown','stopOwned','../scripts/native-speech-read-direct.mjs',stopOwned],['credential-only shutdown','terminateOwned','../scripts/native-credential-direct.mjs',terminateCredentialOwned,true]];
for(const[label,name,module,helper,bounded]of helpers){
 test(label+' retains the terminating helper through its timeout and writes the final receipt before an isolated Node exits',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-termination-await-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const receipt=path.join(dir,'finally-receipt.json');
  // Exercise the actual exported helper with its production timeout/options.
  // Only spawnTerminator is substituted: it launches one inert, self-owned
  // Node process instead of taskkill. No production PID is ever passed to OS.
  const script=`import assert from 'node:assert/strict';import{spawn}from'node:child_process';import fs from'node:fs';const [url,name,receipt]=process.argv.slice(1),module=await import(url);let substituted=false;const options={platform:'win32',spawnTerminator:(command,args,options)=>{assert.equal(command,'taskkill');assert.deepEqual(args,['/PID','2147483000','/T','/F']);assert.deepEqual(options,{windowsHide:true,stdio:'ignore',timeout:1500});substituted=true;return spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],options);}};await module[name]({pid:2147483000,kill(){throw Error('Unexpected fallback');}},${bounded?'1500,':''}options);fs.writeFileSync(receipt,JSON.stringify({termination_settled:true,substituted_inert_owned_helper:substituted}),{flag:'wx'});`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script,new URL(module,import.meta.url).href,name,receipt],{windowsHide:true,encoding:'utf8',timeout:7000,maxBuffer:65536});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stderr,/unsettled top-level await/i);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),{termination_settled:true,substituted_inert_owned_helper:true});
 });
 test(label+' falls back to only its owned child when the terminating helper cannot start',async()=>{let killed=0;const child={pid:2147483000,kill(){killed++;}},options={platform:'win32',spawnTerminator(){const stub=new EventEmitter();queueMicrotask(()=>stub.emit('error',Error('SYNTHETIC spawn unavailable')));return stub;}};await(bounded?helper(child,1500,options):helper(child,options));assert.equal(killed,1);});
 test(label+' preserves the non-Windows owned-child path without spawning a terminator',async()=>{let killed=0;const child={pid:2147483000,kill(){killed++;}},options={platform:'linux',spawnTerminator(){throw Error('A terminator must not be spawned');}};await(bounded?helper(child,1500,options):helper(child,options));assert.equal(killed,1);});
}
test('credential finite fallback timer alone keeps its awaited completion and final receipt live',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'credential-termination-timer-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const receipt=path.join(dir,'finally-receipt.json'),module=new URL('../scripts/native-credential-direct.mjs',import.meta.url).href;
 const script=`import{EventEmitter}from'node:events';import fs from'node:fs';const[url,file]=process.argv.slice(1),{terminateOwned}=await import(url);await terminateOwned({pid:2147483000,kill(){throw Error('Unexpected fallback');}},100,{platform:'win32',spawnTerminator(){return new EventEmitter();}});fs.writeFileSync(file,JSON.stringify({bounded_timer_settled:true}),{flag:'wx'});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script,module,receipt],{windowsHide:true,encoding:'utf8',timeout:3000,maxBuffer:65536});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),{bounded_timer_settled:true});
});
