import {createHash} from 'node:crypto';
type Row=Record<string,any>;
export const AUTHORITATIVE_NARRATION_VERSION='approved-chinese-speech-separators-v1';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const canonical=(v:any)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=():never=>{throw Object.assign(Error('PRIVATE_STORYBOARD_SCRIPT_MISMATCH'),{code:'PRIVATE_STORYBOARD_SCRIPT_MISMATCH'});};
const separator=(c:string)=>/[，。！？；：、—]/u.test(c),han=(c:string)=>/\p{Script=Han}/u.test(c);
// Only Chinese prose separators between Han characters (or an outer edge) may
// be mechanically replaced. ASCII punctuation, numeric ranges, code and names
// remain substantive tokens: never erase punctuation globally.
function tokens(text:string){
 const chars=Array.from(text),offsets:number[]=[];let position=0;for(const c of chars){offsets.push(position);position+=c.length;}
 const result:{text:string;start:number}[]=[];
 for(let i=0;i<chars.length;i++){const c=chars[i];if(/\s/u.test(c))continue;
  if(separator(c)){let a=i-1,b=i+1;while(a>=0&&(/\s/u.test(chars[a])||separator(chars[a])))a--;while(b<chars.length&&(/\s/u.test(chars[b])||separator(chars[b])))b++;
   const left=a<0?'':chars[a],right=b>=chars.length?'':chars[b];if((!left||han(left))&&(!right||han(right))&&(left||right))continue;
  }
  result.push({text:c,start:offsets[i]});
 }
 return result;
}
export function deriveAuthoritativeNarration<T extends Row>(script:string,storyboard:T[]):{storyboard:T[];proof:any|null}{
 if(typeof script!=='string'||!script.trim()||!Array.isArray(storyboard)||!storyboard.length||storyboard.some(s=>typeof(s?.narration??'')!=='string'))fail();
 const joined=storyboard.map(s=>s.narration||'').join('');
 // Preserve all existing inputs/hashes/audio when the historical exact check
// already passed, including approved paragraph whitespace differences.
 if(joined.replace(/\s/gu,'')===script.replace(/\s/gu,''))return{storyboard,proof:null};
 const source=tokens(joined),target=tokens(script);if(!target.length||source.length!==target.length||source.some((t,i)=>t.text!==target[i].text))fail();
 let originalOffset=0,tokenCount=0,cursor=0;const ranges:{index:number;start:number;end:number;narration_sha256:string}[]=[];
 const rows=storyboard.map((row,index)=>{const text=row.narration||'',endOffset=originalOffset+text.length;while(tokenCount<source.length&&source[tokenCount].start<endOffset)tokenCount++;originalOffset=endOffset;
  const end=index===storyboard.length-1?script.length:target[tokenCount]?.start??script.length,narration=text?script.slice(cursor,end):'';if(!text&&end!==cursor||text&&!narration.trim())fail();ranges.push({index,start:cursor,end:cursor+narration.length,narration_sha256:sha(narration)});cursor+=narration.length;return{...row,narration};
 });
 if(cursor!==script.length||rows.map(s=>s.narration).join('')!==script)fail();
 return{storyboard:rows,proof:{schema:'authoritative-narration-allocation-v1',version:AUTHORITATIVE_NARRATION_VERSION,script_text_sha256:sha(script),original_storyboard_sha256:sha(canonical(storyboard)),effective_storyboard_sha256:sha(canonical(rows)),ranges,script_changed:false,quality_approved:false}};
}
