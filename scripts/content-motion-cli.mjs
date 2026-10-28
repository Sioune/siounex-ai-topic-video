import path from 'node:path';
import {boundedCodexCli,textCliArgs} from './bounded-codex-cli.mjs';
// Visual reasoning only. Source text and frames are data, never instructions.
export async function motionVisionCall({schemaPath,output,images,prompt,metadataDir},runCli=boundedCodexCli){
 const cli=path.join(process.env.APPDATA||'','npm/node_modules/@openai/codex/bin/codex.js');
 const args=textCliArgs({cli,schemaPath,output,images});
 args.splice(args.length-1,0,'--config','web_search="disabled"','--config','features.shell_tool=false','--config','features.apps=false','--config','features.multi_agent=false','--config','features.hooks=false','--config','features.remote_plugin=false','--config','features.plugins=false');
 const environment={...process.env};for(const k of Object.keys(environment))if(/SIOUNEX.*TOKEN|SITE.*TOKEN|OAI.*AUTHORIZATION|OPENAI_API_KEY/i.test(k))delete environment[k];
 return runCli({cli,schemaPath,output,images,prompt,args,environment,metadataDir,completionPolicy:'natural'});
}
