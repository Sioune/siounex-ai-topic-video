/** Pure extraction from already-approved copy. This module grants no approval or publication authority. */
export const PUBLISHING_COPY_PARSER_VERSION='approved-platform-copy-v1' as const;
export type PublishingCopyPlatform='douyin'|'bilibili'|'kuaishou'|'wechat_channels'|'xiaohongshu';
export type PublishingCopyField='platform'|'source'|'title'|'description'|'tags';
export type PublishingCopySource={section_path:string[];start_line:number;end_line:number;raw_text:string;kind:'platform-section'};
export type PublishingCopyBlocker={code:string;field:PublishingCopyField;message:string;source_sections:PublishingCopySource[]};
export type PublishingCopyResolved={ok:true;parser_version:typeof PUBLISHING_COPY_PARSER_VERSION;platform:PublishingCopyPlatform;title:string;description:string;tags:string[];selection:'platform-specific';sources:{title:PublishingCopySource;description:PublishingCopySource;tags:PublishingCopySource[]}};
export type PublishingCopyBlocked={ok:false;parser_version:typeof PUBLISHING_COPY_PARSER_VERSION;platform:string;selection:'blocked'|'legacy-generic';blockers:PublishingCopyBlocker[]};
export type PublishingCopyResolution=PublishingCopyResolved|PublishingCopyBlocked;

type Line={text:string;start:number;end:number};
type Heading={line:number;level:number;label:string;platforms:PublishingCopyPlatform[]};
type Marker={line:number;key:'title'|'description'|'tags'|'ignore'|'unsupported';label:string;inline:string;tag_line:boolean};
type Field={key:'title'|'description'|'tags';value:string;source:PublishingCopySource};
const platforms=['douyin','bilibili','kuaishou','wechat_channels','xiaohongshu'] as const;
const platformLabels:Record<PublishingCopyPlatform,string>={douyin:'抖音',bilibili:'哔哩哔哩',kuaishou:'快手',wechat_channels:'微信视频号',xiaohongshu:'小红书'};
const fieldLabels:Record<'title'|'description'|'tags',string>={title:'标题',description:'简介或正文',tags:'话题或标签'};
const internalHeading=/(?:后台|事实与素材|素材来源|素材说明|来源说明|编辑备注|编辑依据|审核|待审|备选|引导评论|置顶评论|封面|朋友圈|发布检查|版权说明|权利说明)/u;
const internalCopy=/(?:私有待审|待本人审核|本文件仅供(?:审核|审阅|归档)|不包含公开发布|本稿没有批准公开发布|本轮仅私有审阅)/u;

function linesOf(text:string):Line[]{
 const lines:Line[]=[];let start=0;
 for(let at=0;at<text.length;at++)if(text[at]==='\n'||text[at]==='\r'){lines.push({text:text.slice(start,at),start,end:at});if(text[at]==='\r'&&text[at+1]==='\n')at++;start=at+1;}
 lines.push({text:text.slice(start),start,end:text.length});return lines;
}
function label(value:string){return value.trim().replace(/^\*\*([^*]+)\*\*$/u,'$1').replace(/^[一二三四五六七八九十百\d]+[、.．)）]\s*/u,'').replace(/[:：]\s*$/u,'').trim();}
function onePlatform(value:string):PublishingCopyPlatform|null{
 const name=label(value).replace(/(?:平台)?(?:专版|宣发文案|发布文案|文案|宣发|版)$/u,'').trim();
 if(name==='抖音')return 'douyin';if(/^(?:哔哩哔哩|B站|bilibili)$/iu.test(name))return 'bilibili';if(name==='快手')return 'kuaishou';if(['微信视频号','视频号'].includes(name))return 'wechat_channels';if(name==='小红书')return 'xiaohongshu';return null;
}
function platformNames(value:string):PublishingCopyPlatform[]{
 if(internalHeading.test(value))return [];
 const direct=onePlatform(value);if(direct)return [direct];
 const parts=label(value).split(/\s*(?:[、/|&＋+]|和|及)\s*/u),parsed=parts.map(onePlatform);
 return parts.length>1&&parsed.every(Boolean)?[...new Set(parsed as PublishingCopyPlatform[])]:[];
}
// promoPublicText serializes its outer fields without Markdown. Recognize the
// complete ordered envelope, not an isolated second tags label in a platform.
function serializedPromoTailStart(lines:Line[]){
 const names=['推荐标题','备选标题','视频号简介','跨平台长版正文','相关话题','置顶评论','封面标题','封面辅助小字','朋友圈分享'];
 const positions=names.map(name=>lines.flatMap((line,index)=>line.text.trim()===name?[index]:[]));
 if(positions.some(found=>found.length!==1))return -1;
 const indexes=positions.map(found=>found[0]);
 return indexes.every((at,index)=>!index||at>indexes[index-1])?indexes[4]:-1;
}
function headingsOf(lines:Line[]){
 const headings:Heading[]=[],tail=serializedPromoTailStart(lines);let fence:string|null=null;
 for(let i=0;i<lines.length;i++){
  if(i===tail&&!fence){headings.push({line:i,level:1,label:'宣发包全局字段',platforms:[]});break;}
  const text=lines[i].text.replace(/^\uFEFF/u,'').trim(),edge=/^(`{3,}|~{3,})/u.exec(text);
  if(edge){if(!fence)fence=edge[1][0];else if(edge[1][0]===fence)fence=null;continue;}if(fence)continue;
  const markdown=/^(#{1,6})\s+(.+?)\s*#*$/u.exec(text),title=markdown?label(markdown[2]):label(text),names=platformNames(title);
  if(markdown||names.length)headings.push({line:i,level:markdown?markdown[1].length:2,label:title,platforms:names});
 }
 return headings;
}
function sourceAt(text:string,lines:Line[],start:number,end:number,path:string[]):PublishingCopySource{
 let stop=Math.max(start+1,end);while(stop>start+1&&!lines[stop-1].text.trim())stop--;
 return {section_path:path,start_line:start+1,end_line:stop,raw_text:text.slice(lines[start].start,lines[stop-1].end),kind:'platform-section'};
}
function keyOf(value:string):Marker['key']|null{
 const key=label(value);if(internalHeading.test(key)||key==='状态'||key.toLowerCase()==='approach')return 'ignore';
 if(['标题','发布标题','推荐标题','推荐发布标题','视频标题'].includes(key))return 'title';
 if(['简介','正文','发布正文','发布简介','视频简介','文案','发布文案'].includes(key))return 'description';
 if(['标签','话题','话题标签','相关话题','发布话题','推荐话题'].includes(key))return 'tags';return null;
}
function markerAt(line:Line,index:number):Marker|null{
 const text=line.text.trim();if(!text)return null;
 const markdown=/^#{1,6}\s+(.+?)\s*#*$/u.exec(text);let candidate=markdown?markdown[1]:text;
 const wrapped=/^\*\*([^*]+)\*\*\s*[:：]?\s*(.*)$/u.exec(candidate);
 if(wrapped){const key=keyOf(wrapped[1]);if(key)return {line:index,key,label:label(wrapped[1]),inline:wrapped[2],tag_line:false};}
 const inline=/^([^:：]{1,40})[:：]\s*(.*)$/u.exec(candidate);
 if(inline){const key=keyOf(inline[1]);if(key)return {line:index,key,label:label(inline[1]),inline:inline[2],tag_line:false};}
 candidate=label(candidate);const key=keyOf(candidate);
 if(key)return {line:index,key,label:candidate,inline:'',tag_line:false};
 if(markdown)return {line:index,key:'unsupported',label:candidate,inline:'',tag_line:false};
 if(/^[#＃][^\s#＃]+(?:\s+[#＃][^\s#＃]+)*$/u.test(text))return {line:index,key:'tags',label:'独立话题行',inline:text,tag_line:true};
 if(/^(?:状态[:：]|本文件仅供(?:审核|审阅|归档))/u.test(text))return {line:index,key:'ignore',label:'内部状态说明',inline:'',tag_line:false};
 return null;
}
function fieldsIn(text:string,lines:Line[],start:number,end:number,section:string){
 const markers:Marker[]=[];let fence:string|null=null;
 for(let i=start;i<end;i++){
  const edge=/^\s*(`{3,}|~{3,})/u.exec(lines[i].text);if(edge){if(!fence)fence=edge[1][0];else if(edge[1][0]===fence)fence=null;continue;}if(fence)continue;
  // A numbered list inside a description can contain a field label as text.
  const numbered=/^\s*(\d+)[.．、)）]\s+([^:：]+)\s*$/u.exec(lines[i].text);
  const nextNumbered=i+1<end?/^\s*(\d+)[.．、)）]\s+\S/u.exec(lines[i+1].text):null;
  if(markers.at(-1)?.key==='description'&&numbered&&nextNumbered&&Number(nextNumbered[1])===Number(numbered[1])+1&&!markerAt(lines[i+1],i+1))continue;
  const marker=markerAt(lines[i],i);if(!marker)continue;
  if(marker.tag_line&&markers.at(-1)?.key==='tags')continue;
  markers.push(marker);
 }
 const fields:Field[]=[],unsupported:PublishingCopySource[]=[];
 for(let i=0;i<markers.length;i++){
  const m=markers[i],stop=markers[i+1]?.line??end;
  if(m.key==='unsupported'){unsupported.push(sourceAt(text,lines,m.line,m.line+1,[section,m.label]));continue;}
  if(m.key==='ignore')continue;
  const value=[m.inline,...lines.slice(m.line+1,stop).map(line=>line.text)].join('\n').trim();
  fields.push({key:m.key,value,source:sourceAt(text,lines,m.line,stop,[section,m.label])});
 }
 return {fields,unsupported};
}
function parseTags(value:string):{tags:string[]}|{error:string}{
 if(!value.trim())return {error:'话题字段为空，不能静默漏填。'};
 if(/```|~~~|(?:^|\n)\s*#{1,6}\s/u.test(value)||internalCopy.test(value))return {error:'话题字段混入说明或未支持的格式，需明确独立话题。'};
 const raw=value.trim();let tokens:string[];
 if(raw.startsWith('[')){let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return{error:'JSON话题数组不完整，不能猜测修复或拆分。'};}if(!Array.isArray(parsed)||!parsed.length||parsed.some(v=>typeof v!=='string'))return{error:'JSON话题必须是非空纯字符串数组，不能包含对象、嵌套或非文字值。'};tokens=parsed;}
 else if(/^[#＃][^\s#＃]+(?:\s+[#＃][^\s#＃]+)*$/u.test(raw))tokens=raw.split(/\s+/u);
 else tokens=raw.split(/[、,，;；\r\n]+/u).map(part=>part.trim().replace(/^[-*+]\s+/u,'')).filter(Boolean);
 const tags=tokens.map(token=>token.replace(/^[#＃]/u,'').trim());
 // A strict JSON array already supplies the tag boundaries. Preserve a
 // product's interior ASCII spaces (e.g. Lovart 2.0) without splitting it.
 // Unstructured whitespace, line breaks and prose punctuation stay blocked.
 if(!tags.length||tags.some(tag=>!tag||/[#＃\r\n\[\]{}"，,;；]/u.test(tag)||(/\s/u.test(tag)&&(!raw.startsWith('[')||/[^\S ]/u.test(tag)))||/[。！？!?：:]/u.test(tag)))return {error:'话题字段包含歧义分隔、正文或多余标记，不能猜测拆分。'};
 if(new Set(tags).size!==tags.length)return {error:'话题重复，需明确发布时应保留的唯一标签。'};
 return {tags};
}
function blocked(platform:string,blockers:PublishingCopyBlocker[],legacy=false):PublishingCopyBlocked{return {ok:false,parser_version:PUBLISHING_COPY_PARSER_VERSION,platform,selection:legacy?'legacy-generic':'blocked',blockers};}

/** Requires each platform's own explicit title, description and tags. No cross-platform or generic fallback. */
export function resolvePublishingCopy(sourceText:unknown,platform:string):PublishingCopyResolution{
 if(!platforms.includes(platform as PublishingCopyPlatform))return blocked(platform,[{code:'unsupported-platform',field:'platform',message:'此解析器未支持该平台，不能借用其他平台文案。',source_sections:[]}]);
 if(typeof sourceText!=='string'||!sourceText.trim())return blocked(platform,[{code:'empty-source',field:'source',message:'缺少当前已审宣发正文。',source_sections:[]}]);
 if(sourceText.length>100000)return blocked(platform,[{code:'source-too-large',field:'source',message:'宣发正文超出解析范围，未截断或猜测。',source_sections:[]}]);
 const p=platform as PublishingCopyPlatform,lines=linesOf(sourceText),headings=headingsOf(lines),matching=headings.filter(heading=>heading.platforms.includes(p));
 const sectionSources=matching.map(heading=>sourceAt(sourceText,lines,heading.line,heading.line+1,[heading.label]));
 if(matching.length!==1||matching[0].platforms.length!==1){
  const legacy=!headings.some(h=>h.platforms.length)&&/(?:^|\r?\n)(?:#{1,6}\s+)?(?:推荐(?:发布)?标题|正文|通用分享短文)\s*(?:[:：]|\r?\n|$)/u.test(sourceText);
  return blocked(platform,[{code:matching.length?'ambiguous-platform-section':legacy?'legacy-generic-copy':'missing-platform-section',field:'platform',message:matching.length?'本平台宣发段不唯一或与其他平台共用，需独立明确后重新审核。':legacy?'当前仅有旧版通用稿；需本平台独立标题、简介和话题后重新审核。':'缺少'+platformLabels[p]+'专属宣发段，禁止通用文案或其他平台字段替代。',source_sections:sectionSources}],legacy);
 }
 const selected=matching[0],following=headings.find(h=>h.line>selected.line&&h.level<=selected.level),end=following?.line??lines.length;
 const nested=headings.filter(h=>h.line>selected.line&&h.line<end&&h.platforms.length);
 if(nested.length)return blocked(platform,[{code:'nested-platform-section',field:'platform',message:'本平台段内嵌其他平台段，无法证明字段归属，未跨平台取用。',source_sections:nested.map(h=>sourceAt(sourceText,lines,h.line,h.line+1,[selected.label,h.label]))}]);
 const {fields,unsupported}=fieldsIn(sourceText,lines,selected.line+1,end,selected.label),blockers:PublishingCopyBlocker[]=[];
 if(unsupported.length)blockers.push({code:'unsupported-field-section',field:'source',message:'平台专段含未明确用途的小节，未截断正文或猜测公开字段。',source_sections:unsupported});
 const chosen={} as Record<'title'|'description'|'tags',Field>;
 for(const field of ['title','description','tags'] as const){
  const found=fields.filter(item=>item.key===field);
  if(found.length!==1){blockers.push({code:found.length?'ambiguous-'+field:'missing-'+field,field,message:found.length?'本平台'+fieldLabels[field]+'字段不唯一，不能擅自选择。':'本平台段缺少显式'+fieldLabels[field]+'字段，不能从其他位置补用。',source_sections:found.map(item=>item.source)});continue;}
  chosen[field]=found[0];
  if(!found[0].value)blockers.push({code:'empty-'+field,field,message:'本平台'+fieldLabels[field]+'字段为空。',source_sections:[found[0].source]});
  else if(internalCopy.test(found[0].value)||/```|~~~/u.test(found[0].value))blockers.push({code:'internal-or-unsupported-'+field,field,message:'已选字段混入内部状态说明或未支持的格式，需明确公开文案后重新审核。',source_sections:[found[0].source]});
 }
 if(chosen.title&&chosen.title.value.includes('\n'))blockers.push({code:'multiline-title',field:'title',message:'本平台标题含多行，不能猜测哪一行应作为标题。',source_sections:[chosen.title.source]});
 let tags:string[]=[];
 if(chosen.tags?.value){const parsed=parseTags(chosen.tags.value);if('error'in parsed)blockers.push({code:'invalid-tags',field:'tags',message:parsed.error,source_sections:[chosen.tags.source]});else tags=parsed.tags;}
 if(blockers.length)return blocked(platform,blockers);
 return {ok:true,parser_version:PUBLISHING_COPY_PARSER_VERSION,platform:p,title:chosen.title.value,description:chosen.description.value,tags,selection:'platform-specific',sources:{title:chosen.title.source,description:chosen.description.source,tags:[chosen.tags.source]}};
}
