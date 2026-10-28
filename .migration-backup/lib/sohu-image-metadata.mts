export type SohuImageDeclaration={url:string;width:string|number;height:string|number};
export const SOHU_IMAGE_METADATA_NAME='siounex-sohu-image-declarations';
export function isSohuArticleUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&['www.sohu.com','sohu.com'].includes(url.hostname)&&!url.username&&!url.password&&!url.port;}catch{return false;}}
export function sohuPublicImageUrl(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw Error('image-url');
 const url=new URL(value);
 if(url.protocol!=='https:'||!/^q[0-9]\.itc\.cn$/.test(url.hostname)||url.username||url.password||url.port||url.hash||url.href!==value)throw Error('image-url');
 return url.href;
}
function jsonWithoutTrailingCommas(value:string){
 let result='',quoted=false,escaped=false;
 for(let i=0;i<value.length;i++){
  const character=value[i];
  if(quoted){result+=character;if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')quoted=false;continue;}
  if(character==='"')quoted=true;
  if(character===','){let next=i+1;while(next<value.length&&/\s/.test(value[next]))next++;if(value[next]===']'||value[next]==='}')continue;}
  result+=character;
 }
 return result;
}
function attribute(tag:string,name:string){const value=tag.match(new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'))?.slice(1).find(item=>item!==undefined)||'';return value.replace(/&(amp|quot|lt|gt|apos);/g,(_,key:string)=>({amp:'&',quot:'"',lt:'<',gt:'>',apos:"'"}[key]||''));}
type Token={value:string;start:number;end:number};
function dataTokens(code:string){
 const tokens:Token[]=[];let i=0;
 while(i<code.length){
  if(/\s/.test(code[i])){i++;continue;}
  if(code.startsWith('//',i)){i=code.indexOf('\n',i+2);if(i<0)break;continue;}
  if(code.startsWith('/*',i)){const end=code.indexOf('*/',i+2);if(end<0)throw Error('image-config');i=end+2;continue;}
  const start=i,quote=code[i];
  if(quote==='"'||quote==="'"||quote==='`'){
   i++;let closed=false;for(;i<code.length;i++){if(code[i]==='\\'){i++;continue;}if(code[i]===quote){i++;closed=true;break;}}
   if(!closed||quote==='`'&&code.slice(start,i).includes('${'))throw Error('image-config');tokens.push({value:code.slice(start,i),start,end:i});
  }else if(quote==='/'){
   // Regex literals are never interpreted as config. Treating an ambiguous
   // division as a regex can only hide a declaration and fail closed.
   i++;let escaped=false,characterClass=false;for(;i<code.length;i++){const c=code[i];if(c==='\n'||c==='\r')break;if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='[')characterClass=true;else if(c===']')characterClass=false;else if(c==='/'&&!characterClass){i++;while(/[a-z]/i.test(code[i]||'')&&i<code.length)i++;break;}}
   tokens.push({value:'<regex>',start,end:i});
  }else if(/[a-z_$]/i.test(quote)){
   i++;while(i<code.length&&/[\w$]/.test(code[i]))i++;tokens.push({value:code.slice(start,i),start,end:i});
  }else{tokens.push({value:code[i],start,end:++i});}
  if(tokens.length>50000)throw Error('image-config');
 }
 return tokens;
}
function literalCfgsImageLists(code:string){
 if(code.length>100000||!/\bvar\s+cfgs\s*=\s*\{/.test(code))return [];
 const tokens=dataTokens(code),lists:string[]=[];
 for(let i=0;i<tokens.length-3;i++){
  if(tokens[i].value!=='var'||tokens[i+1].value!=='cfgs'||tokens[i+2].value!=='='||tokens[i+3].value!=='{')continue;
  const stack=['{'];let imageFields=0;
  for(let j=i+4;j<tokens.length&&stack.length;j++){
   const token=tokens[j],previous=tokens[j-1].value;
   if(stack.length===1&&['{',','].includes(previous)&&token.value!=='}'){
    // Dynamic/computed/spread members cannot establish a literal image list,
    // nor may a later duplicate key silently override the inspected array.
    if(!/^(?:[a-z_$][\w$]*|"[^"\\]*"|'[^'\\]*')$/i.test(token.value)||tokens[j+1]?.value!==':')throw Error('image-config');
    if(['imgsList','"imgsList"',"'imgsList'"].includes(token.value)){
     if(++imageFields!==1||tokens[j+2]?.value!=='[')throw Error('image-config');
     let depth=1,k=j+3;for(;k<tokens.length&&depth;k++){if(tokens[k].value==='[')depth++;else if(tokens[k].value===']')depth--;}
     if(depth||!['}',','].includes(tokens[k]?.value))throw Error('image-config');lists.push(code.slice(tokens[j+2].start,tokens[k-1].end));
    }
   }
   if(['{','[','('].includes(token.value))stack.push(token.value);
   else if(['}',']',')'].includes(token.value)){const opening=stack.pop();if(opening!==({'}':'{',']':'[',')':'('} as Record<string,string>)[token.value])throw Error('image-config');}
  }
  if(stack.length)throw Error('image-config');
 }
 return lists;
}
// Parse only a literal, bounded data array. No eval, JavaScript execution, public
// script fetch or account capability is used by Worker or local source readers.
export function sohuImageMetadata(html:string,sourceUrl:string){
 if(!isSohuArticleUrl(sourceUrl))return null;
 const arrays:{raw:string;kind:string}[]=[];
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[])if(attribute(tag,'name')===SOHU_IMAGE_METADATA_NAME)arrays.push({raw:attribute(tag,'content'),kind:'normalized-inert-metadata'});
 for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(/\bsrc\s*=/i.test(script[1]))continue;
  for(const raw of literalCfgsImageLists(script[2]))arrays.push({raw,kind:'publisher-inline-config'});
 }
 if(!arrays.length)return null;
 if(arrays.length!==1||arrays[0].raw.length>100000)throw Error('image-list');
 const images:unknown=JSON.parse(jsonWithoutTrailingCommas(arrays[0].raw));
 if(!Array.isArray(images)||!images.length||images.length>32)throw Error('image-list');
 const urls=new Set<string>();
 for(const image of images){
  if(!image||typeof image!=='object'||Array.isArray(image)||Object.keys(image).some(key=>!['url','width','height'].includes(key)))throw Error('image-list');
  const url=sohuPublicImageUrl(image.url);
  for(const key of ['width','height'])if(!/^[1-9]\d*$/.test(String(image[key]))||Number(image[key])>16384)throw Error('image-list');
  if(urls.has(url))throw Error('image-list');urls.add(url);
 }
 return {images:images as SohuImageDeclaration[],urls,json:JSON.stringify(images),raw:arrays[0].raw,kind:arrays[0].kind};
}
