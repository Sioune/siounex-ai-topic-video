// Capture the files that actually ran for a private first-review video. Never
// reconstruct an approved renderer from the currently installed template.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const modules=['render-project.mjs','time-format.mjs','stage-themes.mjs','concat-video.mjs','title-layout.mjs','node-stage-layout.mjs'];
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(code){throw Object.assign(Error(code),{code});}
function relative(value){if(typeof value!=='string'||!value||path.isAbsolute(value)||path.win32.isAbsolute(value)||value.includes('\\')||value.includes(':')||value.split('/').some(p=>!p||p==='.'||p==='..'))fail('PRIVATE_RENDER_RUNTIME_SCOPE');return value;}
function scoped(root,name){relative(name);const file=path.join(root,name);let cursor=root;for(const part of name.split('/')){cursor=path.join(cursor,part);if(!fs.existsSync(cursor))fail('PRIVATE_RENDER_RUNTIME_MISSING');if(fs.lstatSync(cursor).isSymbolicLink())fail('PRIVATE_RENDER_RUNTIME_SCOPE');}if(!fs.statSync(file).isFile())fail('PRIVATE_RENDER_RUNTIME_MISSING');return file;}
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function ref(root,name,expected){const file=scoped(root,name),bytes=fs.readFileSync(file),hash=sha(bytes);if(expected!==undefined&&(!digest(expected)||expected!==hash))fail('PRIVATE_RENDER_RUNTIME_BYTES_CHANGED');return{path:name,sha256:hash,size_bytes:bytes.length};}
function fontRefs(profile){const values=new Map();for(const font of Object.values(profile)){if(!font||typeof font.path!=='string'||!path.isAbsolute(font.path)||!digest(font.sha256)||!fs.existsSync(font.path)||!fs.statSync(font.path).isFile())fail('PRIVATE_RENDER_RUNTIME_FONT_MISSING');const bytes=fs.readFileSync(font.path);if(sha(bytes)!==font.sha256||font.bytes!==undefined&&font.bytes!==bytes.length)fail('PRIVATE_RENDER_RUNTIME_FONT_CHANGED');values.set(font.path,{path:font.path,sha256:font.sha256,size_bytes:bytes.length});}if(!values.size)fail('PRIVATE_RENDER_RUNTIME_FONT_MISSING');return [...values.values()].sort((a,b)=>a.path.localeCompare(b.path));}

export function capturePrivateRenderRuntime(preparedDir,{projectRoot=path.dirname(preparedDir)}={}){
 const base=fs.realpathSync(preparedDir),parent=fs.realpathSync(projectRoot),root=relative(path.relative(parent,base).split(path.sep).join('/'));
 const configName='project-render.json',config=json(scoped(base,configName));if(config.schema!=='siounex-unified-case-v1'||!Array.isArray(config.history?.episodes))fail('PRIVATE_RENDER_RUNTIME_CONFIG_INVALID');
 const mechanism=relative(config.mechanism),fontProfile=relative(config.font_profile),style=json(scoped(base,mechanism));if(style.schema!=='siounex-unified-mechanism-v1'||!digest(style.background_sha256))fail('PRIVATE_RENDER_RUNTIME_CONFIG_INVALID');
 const files=new Map(),add=(name,hash)=>{const r=ref(base,relative(name),hash),old=files.get(name);if(old&&old.sha256!==r.sha256)fail('PRIVATE_RENDER_RUNTIME_BYTES_CHANGED');files.set(name,r);};
 for(const name of [configName,mechanism,fontProfile,...modules,'assets/unified-background.svg'])add(name);
 for(const name of ['node-stage-profiles.mjs','node-stage-layout-v2.json'])if(fs.existsSync(path.join(base,name)))add(name);
 // Include actual local module/JSON imports as well. New optional profile files
 // cannot disappear from an archive while their importing renderer stays valid.
 for(const name of files.keys())if(name.endsWith('.mjs')){const source=fs.readFileSync(scoped(base,name),'utf8');for(const match of source.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))add(path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1])));}
 add(style.background,style.background_sha256);
 for(const input of [config.body?.source,config.audio_master,config.outro,config.captions,...config.history.episodes.map(e=>e.cover)]){if(!input||!digest(input.sha256))fail('PRIVATE_RENDER_RUNTIME_INPUT_HASH_REQUIRED');add(input.path,input.sha256);}
 return{schema:'private-render-runtime-v1',root,config:configName,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),external_fonts:fontRefs(json(scoped(base,fontProfile)))};
}

function bindConfig(project,config,base){
 const binding=project.binding||{},b=config.binding||{},expectedTitle=project.stage_display_title||project.title;
 // Prepared case files historically have no binding field; the complete source
 // project and all material hashes still have to match the approved project.
 if(config.body?.frames!==project.body_frames||config.outro?.sha256!==project.outro?.sha256||config.outro?.frames!==(project.outro_frames??project.outro?.frames)||config.captions?.sha256!==project.captions?.sha256||config.title!==expectedTitle||project.layout_profile!==undefined&&config.layout_profile!==project.layout_profile||canonical(config.series_selection)!==canonical(project.series_selection)||b.script_hash!==undefined&&b.script_hash!==binding.script_hash||b.script_revision!==undefined&&b.script_revision!==binding.revision||b.mode_epoch!==undefined&&b.mode_epoch!==binding.mode_epoch)fail('PRIVATE_RENDER_RUNTIME_PROJECT_CHANGED');
 const episodes=config.history.episodes;if(episodes.length!==project.history?.length||episodes.some((e,i)=>e.id!==project.history[i].id||e.cover.sha256!==project.history[i].cover.sha256))fail('PRIVATE_RENDER_RUNTIME_PROJECT_CHANGED');
 const layout=(project.layout_profile||config.layout_profile)==='approved-node-stage-v2'?'node-stage-layout-v2.json':'node-stage-layout.mjs';
 const identity=project.render_identity||{};for(const [key,name] of [['title_layout_sha256','title-layout.mjs'],['lower_slot_layout_sha256',layout]]){if(identity[key]!==undefined&&(!digest(identity[key])||ref(base,name).sha256!==identity[key]))fail('PRIVATE_RENDER_RUNTIME_IDENTITY_CHANGED');}
}

export function validatePrivateRenderRuntime(project,projectDir,{legacyProjectSha256}={}){
 const parent=fs.realpathSync(projectDir),manifest=project.render_runtime;
 if(!manifest){
  // A complete retained first-review directory is a legacy source of truth. Its
  // original project SHA is checked before capturing its actual prepared files.
  // Missing files are never filled from production/unified-runtime.
  if(!digest(legacyProjectSha256)||sha(fs.readFileSync(scoped(parent,'editable-project.json')))!==legacyProjectSha256)fail('PRIVATE_RENDER_RUNTIME_APPROVAL_ANCHOR_REQUIRED');
  const prepared=path.join(parent,'unified-render');if(!fs.existsSync(prepared))fail('PRIVATE_RENDER_RUNTIME_MISSING');
  const captured=capturePrivateRenderRuntime(prepared,{projectRoot:parent}),config=json(scoped(prepared,captured.config));bindConfig(project,config,prepared);
  return{root:prepared,files:captured.files,prepared:true,config,source:'first-approved-legacy-prepared-runtime',manifest:captured,legacy_project_sha256:legacyProjectSha256};
 }
 if(manifest.schema!=='private-render-runtime-v1'||manifest.config!=='project-render.json'||!Array.isArray(manifest.files)||!manifest.files.length)fail('PRIVATE_RENDER_RUNTIME_MANIFEST_INVALID');
 const root=relative(manifest.root),base=path.join(parent,root);if(!fs.existsSync(base))fail('PRIVATE_RENDER_RUNTIME_MISSING');
 // Reject linked parent directories as well as linked entries inside the bundle.
 let cursor=parent;for(const part of root.split('/')){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())fail('PRIVATE_RENDER_RUNTIME_SCOPE');}
 const seen=new Set();for(const expected of manifest.files){const name=relative(expected.path);if(seen.has(name.toLowerCase())||!digest(expected.sha256)||!Number.isSafeInteger(expected.size_bytes)||expected.size_bytes<0)fail('PRIVATE_RENDER_RUNTIME_MANIFEST_INVALID');seen.add(name.toLowerCase());}
 const measured=capturePrivateRenderRuntime(base,{projectRoot:parent});if(canonical(measured)!==canonical(manifest))fail('PRIVATE_RENDER_RUNTIME_MANIFEST_CHANGED');
 const config=json(scoped(base,manifest.config));bindConfig(project,config,base);return{root:base,files:manifest.files,prepared:true,config,source:'first-approved-prepared-runtime',manifest};
}

export function restorePrivateRenderRuntime(project,projectDir,destination,options={}){
 const verified=validatePrivateRenderRuntime(project,projectDir,options),dest=path.resolve(destination);
 fs.mkdirSync(dest,{recursive:true});if(fs.lstatSync(dest).isSymbolicLink())fail('PRIVATE_RENDER_RUNTIME_SCOPE');
 for(const entry of verified.files){const bytes=fs.readFileSync(scoped(verified.root,entry.path));if(sha(bytes)!==entry.sha256)fail('PRIVATE_RENDER_RUNTIME_BYTES_CHANGED');const target=path.join(dest,entry.path);let cursor=dest;for(const part of entry.path.split('/')){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())fail('PRIVATE_RENDER_RUNTIME_SCOPE');}fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target)){if(sha(fs.readFileSync(target))!==entry.sha256)fail('PRIVATE_RENDER_RUNTIME_OUTPUT_CHANGED');}else fs.writeFileSync(target,bytes,{flag:'wx'});}
 return{...verified,root:dest};
}
