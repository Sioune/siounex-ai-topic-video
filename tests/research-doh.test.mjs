// Isolated transport/DNS fixtures only. No live DNS, HTTP, model or Site calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {publicResearchAddress,researchDohRecords,researchDohLookup,resolveResearchAddresses,readResearchPage} from '../scripts/research-web.mjs';

const HOST='source.example.org',PUBLIC='93.184.216.34';
const a=(name=HOST,address=PUBLIC)=>({name,type:1,TTL:60,data:address});
const cname=(name,data)=>({name,type:5,TTL:60,data});
const answer=(rows=[a()])=>({Status:0,TC:false,CD:false,Question:[{name:HOST+'.',type:1}],Answer:rows});
const response=payload=>({status:200,body:Buffer.from(JSON.stringify(payload)),contentType:'application/dns-json'});
const html=Buffer.from('<html><title>Fixture</title><article>'+('SYNTHETIC bounded public text. '.repeat(20))+'</article></html>');

test('IPv4 masks retain private/special networks while accepting the public WordPress VIP address',()=>{
  assert.equal(publicResearchAddress('192.0.66.2'),true);
  assert.equal(publicResearchAddress('192.2.1.1'),true);
  for(const address of ['192.0.0.1','192.0.2.1','192.168.0.1','198.18.0.63','198.19.255.255','10.0.0.1','127.0.0.1','169.254.1.1','172.31.1.1','100.64.0.1','203.0.113.1','224.0.0.1',undefined,123])assert.equal(publicResearchAddress(address),false,String(address));
});

test('trusted DoH binds the exact A question and a complete CNAME chain to public IPv4 only',()=>{
  assert.deepEqual(researchDohRecords(HOST,answer()),[{address:PUBLIC,family:4}]);
  const chain=answer([cname(HOST+'.','cdn.example.net.'),cname('cdn.example.net','edge.example.com'),a('edge.example.com'),a('edge.example.com','8.8.8.8')]);
  chain.Question[0].name=HOST.toUpperCase()+'.';
  assert.deepEqual(researchDohRecords(HOST,chain).map(row=>row.address),[PUBLIC,'8.8.8.8']);
});

test('DoH refuses errors, truncated replies, another question, non-A answers and unbound or cyclic aliases',()=>{
  const invalid=[];
  for(const [field,value] of [['Status',3],['TC',true],['CD',true],['Answer',[]],['Question',[]]])invalid.push({...answer(),[field]:value});
  invalid.push({...answer(),Question:[{name:'other.example.org',type:1}]},{...answer(),Question:[{name:HOST,type:28}]},{...answer(),Question:[{name:HOST,type:1},{name:'other.example.net',type:1}]});
  for(const address of ['127.0.0.1','10.1.2.3','172.16.1.1','169.254.169.254','198.18.0.63','192.0.2.1','::1','2606:4700:4700::1111'])invalid.push(answer([a(HOST,address)]));
  invalid.push(answer([{...a(),type:28}]),answer([{...a(),TTL:-1}]),answer([a('other.example.org')]),answer([a(),cname('unrelated.example.net','cdn.example.com')]));
  invalid.push(answer([cname(HOST,'cdn.example.net')]),answer([cname(HOST,'cdn.example.net'),cname('cdn.example.net',HOST)]),answer([cname(HOST,'cdn.example.net'),a(),a('cdn.example.net')]));
  invalid.push(answer([cname(HOST,'cdn.example.net'),cname(HOST,'other.example.net'),a('cdn.example.net')]),answer([cname(HOST,'server.internal'),a('server.internal')]),answer(Array.from({length:33},()=>a())));
  const long=[];let previous=HOST;for(let i=0;i<9;i++){const next='hop'+i+'.example.net';long.push(cname(previous,next));previous=next;}long.push(a(previous));invalid.push(answer(long));
  for(const payload of invalid)assert.throws(()=>researchDohRecords(HOST,payload));
});

test('DoH bootstrap has one fixed HTTPS resolver and public IP with bounded request data',async()=>{
  let calls=0;
  const records=await researchDohLookup(HOST,{transport:async(url,address,options)=>{
    calls++;assert.equal(url.origin,'https://cloudflare-dns.com');assert.equal(url.pathname,'/dns-query');assert.equal(url.searchParams.get('name'),HOST);assert.equal(url.searchParams.get('type'),'A');assert.equal(address,'1.1.1.1');assert.equal(options.maxBytes,32768);assert.ok(options.timeoutMs<=4000);
    return response(answer());
  }});
  assert.equal(calls,1);assert.equal(records[0].address,PUBLIC);
  for(const reply of [{...response(answer()),status:302},{...response(answer()),contentType:'text/html'},{...response(answer()),body:Buffer.alloc(32769)},{...response(answer()),body:Buffer.from('not JSON')}])await assert.rejects(()=>researchDohLookup(HOST,{transport:async()=>reply}));
});

test('only fake-IP DNS results trigger fallback; real private, mixed-private, malformed and IPv6-only results fail closed',async()=>{
  let fallbacks=0;
  const doh=async name=>{fallbacks++;assert.equal(name,HOST);return [{address:PUBLIC,family:4}];};
  for(const address of ['198.18.0.63','198.19.0.65'])assert.equal((await resolveResearchAddresses(HOST,{lookup:async()=>[{address,family:4}],doh}))[0].address,PUBLIC);
  assert.equal(fallbacks,2);
  assert.equal((await resolveResearchAddresses(HOST,{lookup:async()=>[{address:PUBLIC,family:4},{address:'2001:4860:4860::8888',family:6}],doh}))[0].address,PUBLIC);
  const invalid=[[],[null],[{address:'198.18.0.63',family:4},{address:'10.0.0.1',family:4}],[{address:'192.168.1.1',family:4}],[{address:'::1',family:6}],[{address:'2001:db8::1',family:6}],[{address:'2001:4860:4860::8888',family:6}],[{address:PUBLIC,family:7}],[{address:'not-an-IP',family:4}]];
  for(const records of invalid)await assert.rejects(()=>resolveResearchAddresses(HOST,{lookup:async()=>records,doh}));
  assert.equal(fallbacks,2);
  await assert.rejects(()=>resolveResearchAddresses(HOST,{lookup:async()=>[{address:'198.18.0.63',family:4}],doh:async()=>[{address:'127.0.0.1',family:4}]}));
});

test('DNS, DoH and document transports share finite deadlines instead of hanging or extending redirect budgets',async()=>{
  const forever=()=>new Promise(()=>{}),start=Date.now();
  await assert.rejects(()=>resolveResearchAddresses(HOST,{lookup:forever,timeoutMs:20}),/超时/);
  await assert.rejects(()=>researchDohLookup(HOST,{transport:forever,timeoutMs:20}),/超时/);
  await assert.rejects(()=>readResearchPage('https://'+HOST,{lookup:async()=>[{address:PUBLIC,family:4}],transport:forever,timeoutMs:20}),/超时/);
  assert.ok(Date.now()-start<1000);
  const budgets=[];
  await readResearchPage('https://'+HOST,{lookup:async()=>[{address:PUBLIC,family:4}],timeoutMs:500,transport:async(_url,_address,options)=>{budgets.push(options.timeoutMs);if(budgets.length===1){await new Promise(resolve=>setTimeout(resolve,25));return {status:302,location:'https://second.example.net/document'};}return {status:200,body:html,contentType:'text/html'};}});
  assert.ok(budgets[1]<budgets[0]);
});

test('each redirected document gets a fresh validated resolution and a pinned public address',async()=>{
  const seen=[],fallbacks=[];
  const page=await readResearchPage('https://'+HOST,{lookup:async()=>[{address:'198.18.0.63',family:4}],doh:async name=>{fallbacks.push(name);return [{address:name===HOST?PUBLIC:'8.8.8.8',family:4}];},transport:async(url,address)=>{seen.push({host:url.hostname,address});return seen.length===1?{status:302,location:'https://second.example.net/document'}:{status:200,body:html,contentType:'text/html'};}});
  assert.deepEqual(fallbacks,[HOST,'second.example.net']);assert.deepEqual(seen,[{host:HOST,address:PUBLIC},{host:'second.example.net',address:'8.8.8.8'}]);assert.equal(page.resolved_url,'https://second.example.net/document');
  let transports=0;
  await assert.rejects(()=>readResearchPage('https://'+HOST,{lookup:async()=>[{address:'198.18.0.63',family:4}],doh:async name=>[{address:name===HOST?PUBLIC:'10.0.0.1',family:4}],transport:async()=>{transports++;return {status:302,location:'https://second.example.net/private'};}}));
  assert.equal(transports,1);
});
