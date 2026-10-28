// Keep only the system awake while the existing publisher waits for a real slot.
// No display request, global power setting, creator action or scheduled task.
import path from 'node:path';import {holdProductionAwake} from './production-power-lease.mjs';
const args=process.argv.slice(2),selfTest=args.includes('--self-test'),until=selfTest?Date.now()+2000:Date.parse(args[args.indexOf('--until')+1]||'');
if(!Number.isFinite(until)||until<=Date.now()||until-Date.now()>90*60000)throw Error('Publishing standby needs a real end within90minutes');
const lease=await holdProductionAwake({metadataDir:path.resolve('.publishing-standby')});process.stdout.write(JSON.stringify({status:lease.status,until:new Date(until).toISOString(),publication_started:false})+'\n');
try{if(lease.status!=='held')throw Error('System power request unavailable');let released=false;process.stdin.setEncoding('utf8');process.stdin.on('data',v=>{if(v.includes('release'))released=true;});while(!released&&Date.now()<until)await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));}finally{await lease.release();process.stdin.pause();process.stdout.write('{"status":"released","publication_started":false}\n');}
