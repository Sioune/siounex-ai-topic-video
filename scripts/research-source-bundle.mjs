import fs from 'node:fs';
import path from 'node:path';
import {researchDigest} from './research-web.mjs';

function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function immutable(file,content){if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==content)throw Error('Frozen research note cache changed');}else fs.writeFileSync(file,content,{flag:'wx'});}

// Evidence SHA values here identify the exact immutable SOURCE NOTE supplied to
// the script model. Raw external response hashes remain in retrieval receipts.
export function researchSourceBundle(job,directory,existingFile){
  const snapshot=JSON.parse(job.source_snapshot),research=snapshot.research;
  if(!research)return null;
  if(snapshot.source_id!=='research-synthesis'||research.schema!=='frozen-research-source-v1'||researchDigest(research.result.article)!==research.article_sha256||researchDigest(canonical(research.result.sources))!==research.source_manifest_sha256)throw Error('Frozen research packet does not match selected version');
  const dir=path.resolve(directory);fs.mkdirSync(dir,{recursive:true});
  const base=existingFile?JSON.parse(fs.readFileSync(existingFile,'utf8')):{evidence:[],images:[]};
  const notes=research.result.sources.map(source=>{
    const note=research.source_notes.find(note=>note.id===source.id&&note.url===source.url),content=canonical(source);
    if(note?.kind!=='research-source-note'||researchDigest(content)!==note.note_sha256)throw Error('Frozen per-source research note hash mismatch');
    const file=path.join(dir,source.id+'-note.json');immutable(file,content);
    return {id:source.id,file,url:source.url,title:source.title,published_at:source.published_at,retrieved_at:source.retrieved_at,sha256:note.note_sha256,kind:'research-source-note',facts:[source.summary],materials:['本人选用资料稿的逐源研究笔记；本笔记不包含已验看的图片、音频或视频。'],limits:['SHA256绑定此资料笔记，不是外站原网页字节；原站响应哈希仅见研究抓取回执。',source.access==='opened'?'研究执行器读取过有界网页文字；本脚本阶段没有独立重读全文或观看视频。':'仅有搜索摘要，不能冒充已核读原文。']};
  });
  const evidence=[...notes,...(base.evidence||[]).filter(existing=>!notes.some(note=>note.url===existing.url&&note.sha256===existing.sha256))];
  if(evidence.length>9)throw Error('Research and supplied evidence exceed the nine-note bound; reconcile the selected material bundle');
  const bundle={...base,evidence,images:base.images||[],user_requirements:{...base.user_requirements,goal:base.user_requirements?.goal||research.input.direction||research.input.keywords,scope:'Frozen owner-selected research text; not media or publication authorization'},research_binding:{id:research.id,version:research.version,article_sha256:research.article_sha256,source_manifest_sha256:research.source_manifest_sha256,video_clue_watched:false}};
  const file=path.join(dir,'research-brief.json');immutable(file,JSON.stringify(bundle,null,2));return file;
}
