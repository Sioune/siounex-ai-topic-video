// Public rendering vector + synthetic adversarial data only. No network, image
// downloads, JavaScript evaluation, model invocation or production mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {mapSohuImageReference} from '../scripts/sohu-image-reference.mjs';
import {sourceEvidence} from '../scripts/source-evidence.mjs';
import {extractSourceArticle} from '../lib/source-document.mts';
import {sohuImageMetadata,SOHU_IMAGE_METADATA_NAME} from '../lib/sohu-image-metadata.mts';

const SOURCE='https://www.sohu.com/a/1089743298_362042';
const sha=value=>createHash('sha256').update(value).digest('hex');
// Exact token/URL pair observed in the ordinary public article response and its
// inline imgsList on 2026-10-20, independently confirmed in Chrome currentSrc.
const TOKEN='t3/aQzRlO0/sBY0zrGUHDsmJ5ULT+qz1crB9Zo+mUNN4f6u724w4OWmCbS/7BTb5dWUxJwWpTb1uoWtu3S6O8nCvFimk6ruGvWVn2LsB1cE=';
const IMAGE='https://q3.itc.cn/q_70/images03/20261019/63fa0d8cb7c44553aaa2b2602fd1c28a.png';
const declaration=url=>({url,width:'1158',height:'698'});
function config(images){return '<script>var cfgs = {imgsList: '+JSON.stringify(images).replace(/}]/g,'},]')+', displayMode: "0",};</script>';}
function html(token=TOKEN,images=[declaration(IMAGE)],extra=''){return '<html><head><title>SYNTHETIC source</title>'+config(images)+extra+'</head><body><div class="text"><article class="article" id="mp-editor"><p>'+('SYNTHETIC original prose. '.repeat(12))+'</p><img data-src="'+token+'"><p>LAST_SYNTHETIC_PARAGRAPH</p></article></div></body></html>';}
function encode(value){const cipher=createCipheriv('aes-128-ecb',Buffer.from('www.sohu.com6666'),null);return Buffer.concat([cipher.update(Buffer.from(value)),cipher.final()]).toString('base64');}
function evidence(document){return sourceEvidence(Buffer.from(document),{url:SOURCE});}

test('observed Sohu public renderer vector maps to its exact same-page declaration and preserves raw audit identity',()=>{
 const document=html(),bytes=Buffer.from(document),result=evidence(document);
 assert.equal(result.blocked_image_references.length,0);assert.equal(result.media_references.length,1);assert.equal(result.media_references[0].url,IMAGE);
 const audit=result.media_references[0].source_mapping;
 assert.equal(audit.original_data_src,TOKEN);assert.equal(audit.original_data_src_sha256,sha(TOKEN));assert.equal(audit.decoded_url,IMAGE);
 assert.equal(audit.source_document_sha256,sha(bytes));assert.equal(result.source_sha256,sha(bytes));assert.equal(audit.declaration_basis,'publisher-inline-config');
 assert.match(audit.page_imgs_list_sha256,/^[a-f0-9]{64}$/);assert.ok(document.includes('data-src="'+TOKEN+'"'));
 assert.equal(bytes.toString(),document,'decoding must not rewrite frozen source bytes');
});

test('Sohu large-page extraction retains only inert validated image metadata and uses the actual normalized content hash',()=>{
 const document=html(TOKEN,[declaration(IMAGE)],'<script>'+('SYNTHETIC template furniture;'.repeat(5000))+'</script>');
 assert.ok(document.length>100000);
 const article=extractSourceArticle(document,{url:SOURCE});
 assert.ok(article.content.length<100000);assert.equal(article.content.includes('<script'),false);assert.ok(article.content.includes(SOHU_IMAGE_METADATA_NAME));
 assert.ok(article.content.includes('data-src="'+TOKEN+'"'));assert.ok(article.text.includes('LAST_SYNTHETIC_PARAGRAPH'));
 const normalized=evidence(article.content),reference=normalized.media_references[0];
 assert.equal(reference.url,IMAGE);assert.equal(reference.source_mapping.declaration_basis,'normalized-inert-metadata');
 assert.equal(normalized.source_sha256,sha(article.content));assert.notEqual(normalized.source_sha256,sha(document));
 assert.equal(reference.source_mapping.source_document_sha256,sha(article.content));
 const repeated=extractSourceArticle(article.content,{url:SOURCE});
 assert.deepEqual(sohuImageMetadata(repeated.content,SOURCE).images,[declaration(IMAGE)]);
 assert.equal(evidence(repeated.content).media_references[0].url,IMAGE);
});

test('Sohu mapping uses exact decrypted membership rather than declared image order',()=>{
 const other='https://q7.itc.cn/q_70/images03/20261019/SYNTHETIC-other.png';
 const result=evidence(html(TOKEN,[declaration(other),declaration(IMAGE)]));assert.equal(result.media_references[0].url,IMAGE);
 const mismatched=evidence(html(TOKEN,[declaration(other)]));assert.equal(mismatched.media_references.length,0);assert.equal(mismatched.blocked_image_references.length,1);
});

test('malformed tokens, non-UTF8 plaintext and missing or ambiguous declarations are blocked without opaque relative URLs',()=>{
 const missing=html().replace(config([declaration(IMAGE)]),'');
 const documents=[html('not-an-image-token'),html(TOKEN.slice(1)),html(TOKEN+'='),html('A'.repeat(64)),html('/'+'A'.repeat(63)),html('//opaque-base64'),html('/loading/opaque-token'),html('A'.repeat(4100)),missing,html(TOKEN,[declaration(IMAGE)],config([declaration(IMAGE)])),html(TOKEN,[declaration(IMAGE),declaration(IMAGE)])];
 const badUtf8=createCipheriv('aes-128-ecb',Buffer.from('www.sohu.com6666'),null);documents.push(html(Buffer.concat([badUtf8.update(Buffer.from([0xff,0xff])),badUtf8.final()]).toString('base64')));
 for(const document of documents){const result=evidence(document);assert.equal(result.media_references.length,0);assert.equal(result.blocked_image_references.length,1);assert.equal(JSON.stringify(result).includes('https://www.sohu.com/a/'+TOKEN),false);}
});

test('only precise public HTTPS image hosts and bounded dimensions can enter a Sohu declaration',()=>{
 const urls=['http://q3.itc.cn/a.png','https://user:pass@q3.itc.cn/a.png','https://q3.itc.cn:444/a.png','https://q3.itc.cn.evil.example/a.png','https://q10.itc.cn/a.png','https://127.0.0.1/a.png','https://[::1]/a.png','https://other.example/a.png',IMAGE+'#fragment'];
 for(const url of urls){const result=evidence(html(encode(url),[declaration(url)]));assert.equal(result.media_references.length,0);assert.equal(result.blocked_image_references.length,1);}
 for(const image of [{...declaration(IMAGE),width:'0'},{...declaration(IMAGE),height:16385},{...declaration(IMAGE),handler:'SYNTHETIC executable data'}]){const result=evidence(html(TOKEN,[image]));assert.equal(result.media_references.length,0);assert.equal(result.blocked_image_references.length,1);}
});

test('inline image declarations are parsed as data and cannot execute expressions or escape inert metadata',()=>{
 globalThis.__sohuUnexpectedExecution=false;
 const malicious='<script>var cfgs = {imgsList: [(()=>{globalThis.__sohuUnexpectedExecution=true;return '+JSON.stringify(declaration(IMAGE))+'})()], displayMode:"0",};</script>';
 const document=html().replace(config([declaration(IMAGE)]),malicious),result=evidence(document);
 assert.equal(globalThis.__sohuUnexpectedExecution,false);delete globalThis.__sohuUnexpectedExecution;
 assert.equal(result.media_references.length,0);assert.equal(result.blocked_image_references.length,1);
 const metadata=extractSourceArticle(document,{url:SOURCE});assert.equal(metadata.content.includes(SOHU_IMAGE_METADATA_NAME),false);assert.equal(metadata.content.includes('<script'),false);
});

test('only the actual top-level cfgs image array counts; comments, strings, regex and nearby objects cannot supply declarations',()=>{
 const rows=JSON.stringify([declaration(IMAGE)]),scripts=[
  'var cfgs={}; /* imgsList: '+rows+', */',
  'var cfgs={}; const other={imgsList:'+rows+',x:0};',
  'var cfgs={}; // imgsList: '+rows+',\n',
  'const fake="var cfgs={imgsList: []; }";',
  'const fake=`var cfgs={imgsList: []; }`;',
  'const fake=`outer ${`var cfgs={imgsList:'+rows+',}`}`;',
  'var cfgs={nested:{imgsList:'+rows+',},label:"imgsList",};',
  'const fake=/var cfgs={imgsList: []}/;',
  'var cfgs={imgsList:'+rows+',',
  'var cfgs={imgsList:'+rows+'.filter(()=>false),};',
  'var cfgs={imgsList:'+rows+',imgsList:null,};',
  'var cfgs={imgsList:'+rows+',...{imgsList:[]},};',
 ];
 for(const script of scripts){const document=html().replace(config([declaration(IMAGE)]),'<script>'+script+'</script>'),result=evidence(document);assert.equal(result.media_references.length,0);assert.equal(result.blocked_image_references.length,1);}
 const valid=html().replace(config([declaration(IMAGE)]),'<script>/* imgsList: '+rows+', */ try { var cfgs={nested:{ignored:true}, imgsList:'+rows+', displayMode:"0",}; } catch(e){}</script>');
 assert.equal(evidence(valid).media_references[0].url,IMAGE);
});

test('ordinary relative image paths and non-Sohu behavior retain existing semantics',()=>{
 assert.equal(mapSohuImageReference(TOKEN,{sourceUrl:'https://www.sohu.com.evil.example/a',html:html(),sourceSha256:sha(html())}),null);
 for(const value of ['/image.png','./image.png','../image.png','figures/image.png?size=2','https://q3.itc.cn/image.png','//q3.itc.cn/image.png'])assert.equal(mapSohuImageReference(value,{sourceUrl:SOURCE,html:'',sourceSha256:sha('')}),null);
 const document=html('figures/image.png'),result=evidence(document);assert.equal(result.media_references[0].url,'https://www.sohu.com/a/figures/image.png');assert.equal(result.blocked_image_references.length,0);
 const other=sourceEvidence(Buffer.from('<article><img data-src="/ordinary.png"></article>'),{url:'https://www.ifanr.com/article'});assert.equal(other.media_references[0].url,'https://www.ifanr.com/ordinary.png');assert.equal(other.media_references[0].source_mapping,undefined);
});
