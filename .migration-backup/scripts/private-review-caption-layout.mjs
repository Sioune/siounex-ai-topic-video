// Display-only wrapping. This module never changes cue text, clocks, or font size.
export const CAPTION_LAYOUT_VERSION='natural-word-balanced-paginated-captions-v3-paragraph-display';
const length=text=>Array.from(text).length;
// Paragraph separators belong to the approved script and audio evidence, not
// additional visible subtitle rows. Normalize only the display copy; cues keep
// every source character and their measured outer clocks unchanged.
const displayCopy=text=>text.replace(/[\r\n]+/gu,' ').trim();
const wordTokens=text=>text.match(/[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}._+'’/-]*|\s+|[^\s]/gu)||[];
const closing=/^[，。！？；：、,.!?;:…）〉》」』】”’]/u;
const opening=/[（〈《「『【“‘]$/u;
const meaningful=text=>length(text.replace(/[\p{P}\p{Z}\s]/gu,''));
const legalBreak=(left,right)=>!opening.test(left.trimEnd())&&!closing.test(right.trimStart());

function greedy(tokens,width){
 const lines=[];let line='';
 for(const token of tokens){if(line&&length(line+token)>width){lines.push(line);line='';}line+=token;}
 if(line)lines.push(line);return lines;
}

export function captionLayout(text,width=12){
 if(typeof text!=='string'||!Number.isSafeInteger(width)||width<1)throw new TypeError('PRIVATE_CAPTION_LAYOUT_INPUT_INVALID');
 text=displayCopy(text);
 const tokens=wordTokens(text),fallback=greedy(tokens,width),boundaries=new Set();
 if(typeof Intl.Segmenter==='function')for(const part of new Intl.Segmenter('zh',{granularity:'word'}).segment(text))boundaries.add(part.index);
 let display_lines=fallback,reason=null;
 const singleLine=length(text)<=width&&!/[\r\n]/u.test(text);
 if(singleLine)display_lines=text?[text]:[];
 else if(length(text)<=width*2&&!/[\r\n]/u.test(text)){
  const candidates=[];let offset=0;
  for(let i=1;i<tokens.length;i++){
   offset+=tokens[i-1].length;const left=tokens.slice(0,i).join(''),right=tokens.slice(i).join('');
   if(!left.trim()||!right.trim()||length(left)>width||length(right)>width||!legalBreak(left,right))continue;
   candidates.push({lines:[left,right],natural:boundaries.has(offset),orphan:meaningful(left)<2||meaningful(right)<2,balance:Math.abs(length(left)-length(right))});
  }
  if(candidates.length){
   const withoutOrphans=candidates.filter(row=>!row.orphan),available=withoutOrphans.length?withoutOrphans:candidates;
   available.sort((a,b)=>Number(b.natural)-Number(a.natural)||a.balance-b.balance||length(b.lines[0])-length(a.lines[0]));
   display_lines=available[0].lines;
  }else reason='no-safe-word-boundary-within-two-lines';
 }
 if(!text.trim())reason='empty-caption';
 else if(display_lines.length>2)reason='caption-exceeds-two-lines';
 else if(display_lines.some(line=>length(line)>width))reason='indivisible-word-exceeds-line-width';
 const within_safe_layout=!reason&&display_lines.length>0&&display_lines.length<=2&&display_lines.every(line=>length(line)<=width);
 return {display_text:display_lines.join('\n'),display_lines,lines:display_lines.length,max_characters_per_line:width,max_lines:2,normal_size:76,within_safe_layout,reason,layout_version:CAPTION_LAYOUT_VERSION};
}

// Long or punctuation-constrained legacy pages are an automatic pagination
// problem. Keep their exact text and outer clocks; only the internal page
// boundaries are estimates, never claimed as measured word timestamps.
export function paginateCaptionCues(cues,width=12){
 if(!Array.isArray(cues))throw new TypeError('PRIVATE_CAPTION_PAGINATION_INPUT_INVALID');
 return cues.flatMap((cue,cueIndex)=>{
  if(typeof cue?.text!=='string'||!cue.text.trim()||!Number.isFinite(cue.start_seconds)||!Number.isFinite(cue.end_seconds)||cue.end_seconds<=cue.start_seconds)throw new TypeError('PRIVATE_CAPTION_PAGINATION_INPUT_INVALID');
  const layout=captionLayout(cue.text,width);if(layout.within_safe_layout)return [{...cue,layout}];
  const tokens=wordTokens(cue.text),offsets=[0],natural=new Set([0,cue.text.length]);for(const token of tokens)offsets.push(offsets.at(-1)+token.length);
  if(typeof Intl.Segmenter==='function')for(const part of new Intl.Segmenter('zh',{granularity:'word'}).segment(cue.text))natural.add(part.index);
  const cache=new Map();function solve(start){if(start===tokens.length)return {pages:[],unnatural:0,balance:0};if(cache.has(start))return cache.get(start);let best=null;
   for(let end=start+1;end<=tokens.length;end++){
    const text=tokens.slice(start,end).join('');if(length(displayCopy(text))>width*2)break;
    const right=tokens.slice(end).join('');if(right&&!legalBreak(text,right))continue;
    const page=captionLayout(text,width);if(!page.within_safe_layout)continue;
    const tail=solve(end);if(!tail)continue;
    const candidate={pages:[text,...tail.pages],unnatural:tail.unnatural+Number(end<tokens.length&&!natural.has(offsets[end])),balance:tail.balance+meaningful(text)**2};
    if(!best||candidate.pages.length<best.pages.length||candidate.pages.length===best.pages.length&&(candidate.unnatural<best.unnatural||candidate.unnatural===best.unnatural&&candidate.balance<best.balance))best=candidate;
   }cache.set(start,best);return best;
  }
  const solution=solve(0);if(!solution||solution.pages.join('')!==cue.text)throw Object.assign(Error('PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD'),{code:'PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD'});
  const weights=solution.pages.map(text=>Math.max(1,meaningful(text))),total=weights.reduce((a,b)=>a+b,0),duration=cue.end_seconds-cue.start_seconds;let consumed=0;
  return solution.pages.map((text,index)=>{const start=cue.start_seconds+duration*consumed/total;consumed+=weights[index];return {...cue,text,start_seconds:start,end_seconds:index===solution.pages.length-1?cue.end_seconds:cue.start_seconds+duration*consumed/total,alignment:'estimated-page-timing',word_alignment_verified:false,layout:captionLayout(text,width),pagination:{schema:'preserved-cue-natural-pagination-v1',source_cue_index:cueIndex,source_start_seconds:cue.start_seconds,source_end_seconds:cue.end_seconds,page_index:index,page_count:solution.pages.length,internal_timing:'estimated-text-weight'}};});
 });
}
