import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {createHash} from 'node:crypto';

export const researchDigest=value=>createHash('sha256').update(value).digest('hex');

// Public HTTPS documents only. The selected DNS address is pinned to this request;
// redirects are independently validated. The browser/Worker is never an URL proxy.
export function researchUrl(value){
  if(typeof value!=='string'||value.length>2000)throw Error('资料网址无效');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||net.isIP(url.hostname)||!url.hostname.includes('.')||/(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example)$/.test(url.hostname))throw Error('仅可读取公开 HTTPS 资料网页');
  url.hash='';
  return url;
}

export function publicResearchAddress(address){
  if(typeof address!=='string'||net.isIP(address)!==4)return false;
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&(c===0||c===2))||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}

const DOH_ORIGIN='https://cloudflare-dns.com',DOH_ADDRESS='1.1.1.1',DOH_MAX_BYTES=32768;
const fakeResearchAddress=address=>typeof address==='string'&&net.isIP(address)===4&&/^198\.(?:18|19)\./.test(address);
const pinnedLookup=address=>(_hostname,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4);
function dnsName(value){
  if(typeof value!=='string')throw Error('DNS 名称无效');
  const name=value.toLowerCase().replace(/\.$/,'');
  if(name.length>253||!name.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw Error('DNS 名称无效');
  if(researchUrl('https://'+name+'/').hostname!==name)throw Error('DNS 名称不是公开主机');
  return name;
}
function bounded(operation,timeoutMs,label){
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.reject(Error(label+'超时'));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(label+'超时')),timeoutMs);
    Promise.resolve().then(operation).then(resolve,reject).finally(()=>clearTimeout(timer));
  });
}
function publicIpv6(address){return typeof address==='string'&&net.isIP(address)===6&&/^[23][0-9a-f]{0,3}:/i.test(address)&&!/^2001:db8:/i.test(address);}
function allowedDnsRecord(row,allowFake=false){if(!row||typeof row!=='object')return false;return row.family===4?publicResearchAddress(row.address)||allowFake&&fakeResearchAddress(row.address):row.family===6&&publicIpv6(row.address);}

// Only these authenticated resolver answers can replace a local 198.18/15
// fake-IP. CNAMEs must form one complete, acyclic chain to public IPv4 answers.
export function researchDohRecords(hostname,payload){
  const requested=dnsName(hostname);
  if(!payload||typeof payload!=='object'||payload.Status!==0||payload.TC!==false||payload.CD===true||!Array.isArray(payload.Question)||payload.Question.length!==1||payload.Question[0]?.type!==1||dnsName(payload.Question[0]?.name)!==requested||!Array.isArray(payload.Answer)||!payload.Answer.length||payload.Answer.length>32)throw Error('公开 DNS 回执无效或不完整');
  const aliases=new Map(),addresses=new Map();
  for(const row of payload.Answer){
    if(!row||!Number.isInteger(row.TTL)||row.TTL<0||row.TTL>0xffffffff)throw Error('公开 DNS 记录无效');
    const owner=dnsName(row.name);
    if(row.type===5){if(aliases.has(owner))throw Error('公开 DNS 别名不唯一');aliases.set(owner,dnsName(row.data));}
    else if(row.type===1){if(!publicResearchAddress(row.data))throw Error('公开 DNS 返回非公开 IPv4');const values=addresses.get(owner)||[];values.push(row.data);addresses.set(owner,values);}
    else throw Error('公开 DNS 返回非 A/CNAME 记录');
  }
  const chain=new Set();let terminal=requested;
  while(aliases.has(terminal)){
    if(chain.has(terminal)||chain.size>=8||addresses.has(terminal))throw Error('公开 DNS 别名链无效');
    chain.add(terminal);terminal=aliases.get(terminal);
  }
  if(chain.has(terminal)||aliases.size!==chain.size||addresses.size!==1||!addresses.has(terminal))throw Error('公开 DNS 答复不属于所请求的别名链');
  return [...new Set(addresses.get(terminal))].map(address=>({address,family:4}));
}

async function readDohResponse(url,address,{timeoutMs,maxBytes}){
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{method:'GET',agent:false,family:4,servername:'cloudflare-dns.com',maxHeaderSize:8192,signal:AbortSignal.timeout(timeoutMs),lookup:pinnedLookup(address),headers:{Accept:'application/dns-json','Accept-Encoding':'identity'}},response=>{
      const type=String(response.headers['content-type']||'');
      if(response.statusCode!==200||!/^application\/(?:dns-json|json)(?:;|$)/i.test(type)||response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'||Number(response.headers['content-length']||0)>maxBytes){response.destroy();reject(Error('受信 DNS HTTPS 响应无效'));return;}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy(Error('受信 DNS 响应过大'));return;}chunks.push(chunk);});
      response.once('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks),contentType:type}));
      response.once('error',reject);
    });
    request.once('error',reject);request.end();
  });
}

// The resolver hostname, public connection IP and TLS server name are fixed;
// neither a page URL nor system DNS can redirect this bootstrap connection.
// https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
export async function researchDohLookup(hostname,{transport=readDohResponse,timeoutMs=4000}={}){
  const name=dnsName(hostname),url=new URL('/dns-query',DOH_ORIGIN);url.searchParams.set('name',name);url.searchParams.set('type','A');
  const budget=Math.min(timeoutMs,4000),response=await bounded(()=>transport(url,DOH_ADDRESS,{timeoutMs:budget,maxBytes:DOH_MAX_BYTES}),budget,'公开 DNS 读取');
  if(response?.status!==200||!response.body||response.body.length>DOH_MAX_BYTES||!/^application\/(?:dns-json|json)(?:;|$)/i.test(response.contentType||''))throw Error('受信 DNS HTTPS 响应无效');
  let payload;try{payload=JSON.parse(Buffer.from(response.body).toString('utf8'));}catch{throw Error('受信 DNS JSON 无效');}
  return researchDohRecords(name,payload);
}

export async function resolveResearchAddresses(hostname,{lookup=dns.lookup,doh=researchDohLookup,timeoutMs=6000,lookupTimeoutMs=2000}={}){
  const name=dnsName(hostname),deadline=Date.now()+timeoutMs,records=await bounded(()=>lookup(name,{all:true,verbatim:true}),Math.min(lookupTimeoutMs,timeoutMs),'系统 DNS 读取');
  if(!Array.isArray(records)||!records.length||records.length>32||records.some(row=>!allowedDnsRecord(row,true)))throw Error('资料地址解析到非公开网络');
  const resolved=records.some(row=>fakeResearchAddress(row.address))?await bounded(()=>doh(name,{timeoutMs:Math.min(4000,deadline-Date.now())}),Math.min(4000,deadline-Date.now()),'公开 DNS 读取'):records;
  if(!Array.isArray(resolved)||!resolved.length||resolved.length>32||resolved.some(row=>!allowedDnsRecord(row)))throw Error('资料地址解析到非公开网络');
  const publicV4=resolved.filter(row=>row.family===4&&publicResearchAddress(row.address));
  if(!publicV4.length)throw Error('资料地址缺少可验证的公开 IPv4 连接');
  return publicV4;
}

function entities(text){
  return text.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|(amp|lt|gt|quot|apos|nbsp));/gi,(all,number,name)=>{
    if(name)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name.toLowerCase()];
    const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):Number(number);
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):' ';
  });
}
const clean=value=>entities(value.replace(/<[^>]*>/g,' ')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/\s+/g,' ').trim();
export function extractResearchDocument(body,{contentType='text/html',url,limit=18000}={}){
  const charset=contentType.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]||'utf-8';
  let html;
  try{html=new TextDecoder(charset).decode(body);}catch{html=new TextDecoder().decode(body);}
  const title=clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname).slice(0,250);
  let published=null;
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const name=tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const stamp=tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if(/^(?:article:published_time|datepublished|publishdate|pubdate)$/i.test(name||'')&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(stamp||'')&&Number.isFinite(Date.parse(stamp)))published=new Date(stamp).toISOString();
  }
  html=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|footer|aside|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const primary=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html;
  const full=clean(primary),text=full.slice(0,limit);
  if(text.length<120)throw Error('网页可读文字不足，未作为事实材料');
  return {title,published_at:published,text,extraction:'bounded-text',extracted_chars:text.length,truncated:full.length>limit,extract_sha256:researchDigest(text)};
}

async function readResponse(url,address,{timeoutMs,maxBytes}){
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{method:'GET',agent:false,maxHeaderSize:16384,signal:AbortSignal.timeout(timeoutMs),lookup:pinnedLookup(address),headers:{'User-Agent':'SiounexResearch/1.0 (private research materials)','Accept':'text/html, application/xhtml+xml, text/plain;q=0.9','Accept-Encoding':'identity'}},response=>{
      const status=response.statusCode||0,headers=response.headers;
      if(status>=300&&status<400){response.resume();resolve({status,location:headers.location});return;}
      if(status!==200){response.resume();reject(Error('资料网页 HTTP '+status));return;}
      const type=String(headers['content-type']||'');
      if(!/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:;|$)/i.test(type)||headers['content-encoding']&&headers['content-encoding']!=='identity'||Number(headers['content-length']||0)>maxBytes){response.destroy();reject(Error('网页类型、编码或体积不适合本轮文字研究'));return;}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy(Error('资料网页过大'));return;}chunks.push(chunk);});
      response.once('end',()=>resolve({status,body:Buffer.concat(chunks),contentType:type}));
      response.once('error',reject);
    });
    request.once('error',reject);request.end();
  });
}

export async function readResearchPage(value,{lookup=dns.lookup,doh=researchDohLookup,transport=readResponse,timeoutMs=12000,maxBytes=2000000,maxRedirects=2}={}){
  const original=researchUrl(value).href,deadline=Date.now()+timeoutMs;let current=original;
  for(let hop=0;hop<=maxRedirects;hop++){
    const url=researchUrl(current),records=await resolveResearchAddresses(url.hostname,{lookup,doh,timeoutMs:deadline-Date.now()});
    // Ignore public IPv6 results when public IPv4 is available, reject any private
    // result instead of handing a rebinding opportunity to the HTTP resolver.
    const address=records.find(row=>row.family===4&&publicResearchAddress(row.address))?.address;
    if(!address)throw Error('资料地址缺少可验证的公开 IPv4 连接');
    const remaining=deadline-Date.now(),response=await bounded(()=>transport(url,address,{timeoutMs:remaining,maxBytes}),remaining,'资料网页读取');
    if(response.status>=300&&response.status<400){
      if(hop===maxRedirects||!response.location)throw Error('资料网页跳转过多或无目标');
      current=researchUrl(new URL(response.location,url).href).href;continue;
    }
    if(response.status!==200||!response.body||response.body.length>maxBytes)throw Error('资料网页未完整读取');
    const document=extractResearchDocument(response.body,{contentType:response.contentType,url:current});
    return {url:original,resolved_url:url.href,publisher:url.hostname,retrieved_at:new Date().toISOString(),sha256:researchDigest(response.body),bytes:response.body.length,...document};
  }
  throw Error('资料网页读取未完成');
}

export function researchSearchEvents(raw){
  const queries=[],actions=[];
  for(const line of raw.split(/\r?\n/)){
    let event;try{event=JSON.parse(line);}catch{continue;}
    const item=event.item;
    if(event.type!=='item.completed'||!item)continue;
    if(['command_execution','mcp_tool_call'].includes(item.type))throw Error('研究子进程使用了未授权工具，结果不采用');
    if(item.type==='web_search'){
      actions.push(item.action?.type||'other');
      if(item.action?.type==='search'){
        for(const query of [item.action.query,...(item.action.queries||[]),item.query])if(typeof query==='string'&&query.trim()&&!queries.includes(query.trim()))queries.push(query.trim().slice(0,500));
      }
    }
  }
  return {queries:queries.slice(0,16),search_count:actions.filter(action=>action==='search').length,actions};
}
