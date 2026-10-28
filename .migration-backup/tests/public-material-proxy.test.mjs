import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {winHttpProxy,proxyPublicResponse} from '../scripts/public-material-proxy.mjs';

test('reads existing English and Chinese WinHTTP proxy without changing settings',()=>{
 const run=s=>()=>({status:0,stdout:s});
 for(const label of ['Proxy Server(s)','代理服务器'])assert.deepEqual(winHttpProxy({platform:'win32',run:run(`${label} : 127.0.0.1:7890\r\n`)}),{host:'127.0.0.1',port:7890});
 assert.equal(winHttpProxy({platform:'win32',run:run('Direct access (no proxy server).')}),null);
 assert.equal(winHttpProxy({platform:'linux',run:run('Proxy Server(s) : 127.0.0.1:7890')}),null);
});
test('proxy is only used for validated public IPv4 destinations',async()=>{
 await assert.rejects(proxyPublicResponse(new URL('https://example.org/'),'127.0.0.1',{proxy:{host:'127.0.0.1',port:9},timeoutMs:100,maxBytes:100}),/PUBLIC_PROXY_TARGET_INVALID/);
});
test('proxy CONNECT uses validated IP and does not send a page hostname',async t=>{
 const server=http.createServer();let target;
 server.on('connect',(req,socket)=>{target=req.url;socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 await assert.rejects(proxyPublicResponse(new URL('https://public.example.org/'),'8.8.8.8',{proxy:{host:'127.0.0.1',port:server.address().port},timeoutMs:3000,maxBytes:100}),/PUBLIC_PROXY_CONNECT_FAILED/);
 assert.equal(target,'8.8.8.8:443');
});
