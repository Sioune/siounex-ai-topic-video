// A technical font-fit overlay for a newly prepared runtime. The approved
// template manifests and saved selection remain the original immutable bytes.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const TITLE_RUNTIME_FIX_MANIFEST_SHA256='a8b5e6447f6041e665326c91e4e0b0931a2d1f2d1c7cbe8b7de8f7085708c1a7';
const defaultRoot=fileURLToPath(new URL('..',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
export function currentTitleRuntimeFix({root=defaultRoot}={}){
 const base=fs.realpathSync(root),read=name=>{if(typeof name!=='string'||path.isAbsolute(name)||path.win32.isAbsolute(name)||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('TITLE_RUNTIME_FIX_SCOPE');let at=base;for(const p of name.split('/')){at=path.join(at,p);if(fs.lstatSync(at).isSymbolicLink())throw Error('TITLE_RUNTIME_FIX_SCOPE');}if(!fs.statSync(at).isFile())throw Error('TITLE_RUNTIME_FIX_SCOPE');return fs.readFileSync(at);};
 const bytes=read('production/title-runtime-fix-v3.json');if(sha(bytes)!==TITLE_RUNTIME_FIX_MANIFEST_SHA256)throw Error('TITLE_RUNTIME_FIX_MANIFEST_CHANGED');const m=JSON.parse(bytes);
 if(m.schema!=='private-title-runtime-fix-v3'||m.scope!=='new-unfrozen-private-render-only'||m.approved_text_unchanged!==true||m.geometry_unchanged!==true||m.existing_template_lock_preserved!==true||m.frozen_runtime_modified!==false)throw Error('TITLE_RUNTIME_FIX_POLICY_CHANGED');
 const groups=[['baseline_source_files',['production/unified-runtime/title-layout.mjs','production/unified-runtime/render-v9.mjs']],['template_manifests',['production/template-assets/morning-light-v1/manifest.json','production/template-assets/evening-dark-v2/manifest.json']],['replacement_source_files',['production/unified-runtime/title-layout-v3.mjs','production/unified-runtime/render-v10.mjs']]];
 for(const[key,names]of groups){if(!Array.isArray(m[key])||m[key].length!==names.length)throw Error('TITLE_RUNTIME_FIX_FILES_CHANGED');for(const[i,r]of m[key].entries()){if(r.path!==names[i]||!/^[a-f0-9]{64}$/.test(r.sha256||'')||!Number.isSafeInteger(r.size_bytes))throw Error('TITLE_RUNTIME_FIX_FILES_CHANGED');const actual=read(r.path);if(actual.length!==r.size_bytes||sha(actual)!==r.sha256)throw Error('TITLE_RUNTIME_FIX_BYTES_CHANGED');}}
 return{title:path.join(base,m.replacement_source_files[0].path),renderer:path.join(base,m.replacement_source_files[1].path),manifest_sha256:TITLE_RUNTIME_FIX_MANIFEST_SHA256,identity:{schema:m.schema,manifest_sha256:TITLE_RUNTIME_FIX_MANIFEST_SHA256,title_sha256:m.replacement_source_files[0].sha256,renderer_sha256:m.replacement_source_files[1].sha256,approved_text_unchanged:true,geometry_unchanged:true,existing_template_lock_preserved:true,frozen_runtime_modified:false}};
}
export function privateTitleRuntimeSources({base,frozenRuntime=null,root=defaultRoot}={}){
 // Never consult or apply a new overlay to a frozen first-review runtime.
 if(frozenRuntime)return{title:path.join(base,'title-layout.mjs'),renderer:path.join(base,frozenRuntime.prepared?'render-project.mjs':'render-v9.mjs'),fix:null};
 const fix=currentTitleRuntimeFix({root});return{title:fix.title,renderer:fix.renderer,fix:fix.identity};
}
