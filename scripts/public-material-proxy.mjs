import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {publicResearchAddress} from './research-web.mjs';

// Read Windows' existing WinHTTP proxy configuration. Do not change it or
// accept a proxy endpoint supplied by material pages.
export function winHttpProxy({platform=process.platform,run=spawnSync}={}){
 if(platform!=='win32')return null;
 const r=run('netsh',['winhttp','show','proxy'],{encoding:'utf8',windowsHide:true,timeout:6000,maxBuffer:16384});
 if(r.status!==0)return null;
 const value=String(r.stdout||'').match(/(?:Proxy Server\(s\)|代理服务器)\s*:\s*([^\r\n]+)/i)?.[1]?.trim();
 if(!value)return null;
 const v=value.includes('=')?value.split(';').map(s=>s.trim()).find(s=>/^https=/i.test(s))?.replace(/^https=/i,''):value;
 const match=String(v||'').match(/^(?:http:\/\/)?(localhost|127\.0\.0\.1):(\d{1,5})$/i);
 if(!match||Number(match[2])<1||Number(match[2])>65535)return null;
 return {host:match[1],port:Number(match[2])};
}

// CONNECT is made to the already validated IPv4, while TLS verifies the
// original hostname. A proxy must not resolve a page-provided hostname.
export function proxyPublicResponse(url,address,{proxy,timeoutMs,maxBytes}){
 if(!proxy||!publicResearchAddress(address))return Promise.reject(Error('PUBLIC_PROXY_TARGET_INVALID'));
 return new Promise((resolve,reject)=>{
  let finished=false,socket,req,tunnel;const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);if(error){tunnel?.destroy();req?.destroy();socket?.destroy();reject(error)}else resolve(result)};
  const timer=setTimeout(()=>done(Object.assign(Error('PUBLIC_PROXY_DEADLINE'),{code:'ETIMEDOUT'})),timeoutMs);
  tunnel=http.request({host:proxy.host,port:proxy.port,method:'CONNECT',path:address+':443',headers:{Host:address+':443'},agent:false});
  tunnel.once('error',error=>done(error));
  tunnel.once('connect',(response,raw,head)=>{
   if(response.statusCode!==200||head.length){raw.destroy();done(Error('PUBLIC_PROXY_CONNECT_FAILED'));return}
   socket=tls.connect({socket:raw,servername:url.hostname,rejectUnauthorized:true});socket.once('error',error=>done(error));
   socket.once('secureConnect',()=>{
    const agent=new https.Agent({keepAlive:false});agent.createConnection=()=>socket;
    req=https.request(url,{agent,method:'GET',headers:{'User-Agent':'SiounexMaterialDiscovery/1.0 (bounded public research)','Accept':url.hostname==='cloudflare-dns.com'?'application/dns-json':'text/html,application/xhtml+xml,text/plain,video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif','Accept-Encoding':'identity'},maxHeaderSize:16384},response=>{
     const status=response.statusCode||0,h=response.headers;if(status>=300&&status<400){response.destroy();done(null,{status,location:h.location});return}
     const length=h['content-length'];if(status!==200||h['content-encoding']&&h['content-encoding']!=='identity'||length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>maxBytes)){response.destroy();done(Error(status!==200?'MATERIAL_HTTP_'+status:'MATERIAL_DECLARED_SIZE_REJECTED'));return}
     const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){response.destroy();done(Error('MATERIAL_BYTE_BUDGET'));return}chunks.push(chunk)});response.once('error',error=>done(error));response.once('end',()=>done(null,{status,body:Buffer.concat(chunks),contentType:String(h['content-type']||''),contentEncoding:'identity'}));
    });req.once('error',error=>done(error));req.end();
   });
  });tunnel.end();
 });
}
