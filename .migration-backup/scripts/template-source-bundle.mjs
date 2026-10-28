import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyTemplateSourceBundle(template,{root=fileURLToPath(new URL('..',import.meta.url))}={}){
 if(!template?.source_bundle)return null;
 const base=fs.realpathSync(root),relative=name=>typeof name==='string'&&!path.isAbsolute(name)&&!path.win32.isAbsolute(name)&&!name.includes('\\')&&!name.split('/').some(p=>!p||p==='.'||p==='..');
 const read=name=>{if(!relative(name))throw Error('TEMPLATE_SOURCE_SCOPE');const file=fs.realpathSync(path.join(base,name));if(!file.startsWith(base+path.sep)||!fs.statSync(file).isFile())throw Error('TEMPLATE_SOURCE_SCOPE');return fs.readFileSync(file);};
 const ref=template.source_bundle,bytes=read(ref.manifest_path);if(sha(bytes)!==ref.sha256)throw Error('TEMPLATE_SOURCE_MANIFEST_CHANGED');
 const manifest=JSON.parse(bytes);if(manifest.schema!=='owner-approved-stage-template-source-v1'||manifest.template_id!==template.id||manifest.template_version!==template.version||manifest.runtime!==template.runtime||manifest.layout_profile!==template.layout_profile||manifest.time_slot!==template.time_slot||manifest.body_tone!==template.tone||manifest.outro?.variant!==template.outro_variant||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('TEMPLATE_SOURCE_BINDING_CHANGED');
 const seen=new Set();for(const f of manifest.files){const actual=read(f.path);if(seen.has(f.path)||actual.length!==f.size_bytes||sha(actual)!==f.sha256)throw Error('TEMPLATE_SOURCE_BYTES_CHANGED');seen.add(f.path);}
 return manifest;
}
