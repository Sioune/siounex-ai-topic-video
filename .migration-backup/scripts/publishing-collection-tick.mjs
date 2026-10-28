// Preserve the official hidden-stdin client while aggregating its framed output
// in pipes. This avoids ConPTY dropping fragments from a large dashboard reply.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const client=fileURLToPath(new URL('./publishing-service-client.mjs',import.meta.url));
function hiddenInput(){return new Promise((resolve,reject)=>{
 let buffer='';const tty=!!process.stdin.isTTY;
 if(tty)process.stdin.setRawMode(true);
 process.stdin.setEncoding('utf8');process.stdin.resume();
 const cleanup=()=>{process.stdin.off('data',receive);if(tty)process.stdin.setRawMode(false);process.stdin.pause();};
 const receive=chunk=>{if(chunk.includes('\u0003')){cleanup();reject(Error('Cancelled'));return;}buffer+=chunk;
 if(buffer.length>100000){cleanup();reject(Error('Input exceeds limit'));return;}
 const at=buffer.search(/[\r\n]/);if(at<0)return;cleanup();
 try{resolve(JSON.parse(buffer.slice(0,at)));}catch{reject(Error('Invalid private input'));}
 };
 process.stdin.on('data',receive);process.stdout.write('Ready for private collection JSON on stdin (input is hidden).\n');
});}
try{
 const payload=await hiddenInput();
 if(typeof payload?.site_token!=='string'||!payload.site_token||payload.operation||JSON.stringify(payload.body)!==JSON.stringify({action:'run_collection_tick'}))throw Error('Only the real-time collection tick is allowed');
 const child=spawn(process.execPath,[client],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let out='',err='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',s=>{out+=s;if(out.length>4000000)child.kill();});child.stderr.on('data',s=>{err+=s;});
 const completed=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('Official client could not start')));child.once('close',resolve);});
 child.stdin.end(JSON.stringify(payload)+'\n');
 const code=await completed;
 const parts=out.split(/\r?\n/).filter(s=>s.startsWith('V2_JSON_PART:')).map(s=>JSON.parse(s.slice('V2_JSON_PART:'.length)));
 if(!out.includes('V2_JSON_END'))throw Error('Official client response did not finish');
 const response=JSON.parse(parts.join('')),d=response.result;
 const counts=xs=>(xs||[]).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
 const next=(d?.collections||[]).filter(x=>x.status==='scheduled').map(x=>x.due_at).sort()[0]||null;
 console.log(JSON.stringify({http_status:response.http_status,client_exit_code:code,error_code:d?.error_code||null,last_run_at:d?.scheduler?.last_run_at||null,collection_counts:counts(d?.collections),native_issue_count:d?.native_receipt_issues?.length||0,next_due_at:next}));
 process.exitCode=code||response.http_status!==200?1:0;
}catch(e){process.stderr.write(e instanceof Error?e.message+'\n':'Private collection transport failed\n');process.exitCode=1;}
