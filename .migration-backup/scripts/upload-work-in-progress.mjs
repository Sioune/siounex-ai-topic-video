// Upload one already-produced intermediate MP4 and its real gap report to the
// original task. This does not claim/approve a video or call a media provider.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {uploadWorkInProgress} from './work-in-progress-upload.mjs';
const ROOT=process.env.SIOUNEX_RUNTIME_ROOT || process.cwd(), [videoFile,gapFile]=process.argv.slice(2);if(!videoFile||!gapFile||process.argv.length!==4)throw Error('Usage: node upload-work-in-progress.mjs VIDEO.mp4 gaps.json');
const gap=JSON.parse(fs.readFileSync(gapFile,'utf8'));if(!/^job_[a-f0-9-]{36}$/.test(gap.job_id||'')||!Number.isSafeInteger(gap.revision))throw Error('Invalid original task binding');
const {createNativeProductionTransport}=await import(pathToFileURL(path.join(ROOT,'scripts/native-production-transport.mjs')).href),transport=createNativeProductionTransport({cwd:ROOT});const call=async body=>{const r=await transport.call(body);if(r.status!==200)throw Error('Preview request failed: HTTP '+r.status);return r.body};
try{const result=await uploadWorkInProgress({call,videoFile,gapFile,jobId:gap.job_id,revision:gap.revision});process.stdout.write(JSON.stringify(result)+'\n');}finally{await transport.close();}
