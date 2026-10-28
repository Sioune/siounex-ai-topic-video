import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const checkout=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv.indexOf('--root');
const destination=requested>=0?path.resolve(process.argv[requested+1]):checkout;
const manifest=JSON.parse(readFileSync(path.join(checkout,'.snapshot-assets/manifest.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inside(root,relative){
  const file=path.resolve(root,relative);
  const check=path.relative(root,file);
  if(check.startsWith('..')||path.isAbsolute(check))throw new Error('Unsafe snapshot path');
  return file;
}
for(const asset of manifest.assets){
  const buffers=asset.chunks.map(chunk=>{
    const bytes=readFileSync(inside(checkout,chunk.path));
    if(bytes.length!==chunk.bytes||sha(bytes)!==chunk.sha256)throw new Error('Chunk integrity failed: '+chunk.path);
    return bytes;
  });
  const bytes=Buffer.concat(buffers);
  if(bytes.length!==asset.bytes||sha(bytes)!==asset.sha256)throw new Error('Asset integrity failed: '+asset.path);
  const target=inside(destination,asset.path);
  if(existsSync(target)){
    if(sha(readFileSync(target))!==asset.sha256)throw new Error('Existing file differs; no overwrite: '+asset.path);
    console.log('Verified existing '+asset.path);continue;
  }
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,bytes,{flag:'wx'});
  if(sha(readFileSync(target))!==asset.sha256)throw new Error('Restored asset verification failed');
  console.log('Restored '+asset.path+' ('+bytes.length+' bytes)');
}
console.log('All 3 original outro assets verified. No production or publishing actions were run.');
