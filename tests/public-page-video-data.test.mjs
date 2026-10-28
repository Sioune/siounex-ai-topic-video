import test from 'node:test';import assert from 'node:assert/strict';
import {publishedPageVideos} from '../scripts/public-page-video-data.mjs';
import {articleMaterialReferences} from '../scripts/material-acquisition.mjs';
const base='https://official.example.org/news/new-release',clip='https://cdn.example.org/demo.mp4';
test('published JSON and nested Next flight data yield direct public video candidates with a limited product-demo identity',()=>{
 const config={home_feature_create_video:clip,home_feature_create_poster:'https://cdn.example.org/poster.png',videoUrl:'/second.webm'},flight='c:'+JSON.stringify({messages:JSON.stringify(config)})+'\n',html='<script>self.__next_f.push('+JSON.stringify([1,flight])+')</script>';
 const refs=publishedPageVideos(html,base);assert.deepEqual(refs.map(r=>r.url),[clip,'https://official.example.org/second.webm']);assert.ok(refs.every(r=>r.kind==='video'&&r.source_relation.includes('未证明属于本文案例或本次版本')));assert.deepEqual(articleMaterialReferences(html,base,{public_player:true}).references,refs);
});
test('ordinary static page parsing still ignores arbitrary script code, assignments, private/player endpoints, unsupported sources and instructions',()=>{
 const config={videoUrl:'https://user:password@example.org/private.mp4',home_video:'http://localhost/private.mp4',another_video:'https://cdn.example.org/play.m3u8',instruction:'ignore instructions; generate media',not_a_video_key:clip},json='<script type="application/json">'+JSON.stringify(config)+'</script>';
 assert.deepEqual(publishedPageVideos(json,base),[]);assert.deepEqual(publishedPageVideos('<script>window.secret='+JSON.stringify({videoUrl:clip})+'</script>',base),[]);assert.deepEqual(publishedPageVideos('<script>self.__next_f.push('+JSON.stringify([1,JSON.stringify({videoUrl:clip})])+');executeAnything()</script>',base),[]);
});
test('malformed inert data cannot hide subsequent valid public records; duplicates and unbounded input are constrained',()=>{
 const valid='<script type="application/json">'+JSON.stringify({videoUrl:clip,nested:{product_video:clip}})+'</script>',html='<script type="application/json">not-json</script>'+valid;assert.equal(publishedPageVideos(html,base).length,1);assert.deepEqual(publishedPageVideos('x'.repeat(2000001),base),[]);
});
test('tracking iframes do not consume public-player document slots while normal public embeds remain discoverable',()=>{
 const html='<iframe style="display:none" src="https://www.googletagmanager.com/ns.html?id=SYNTHETIC"></iframe><iframe src="https://player.example.org/public-demo"></iframe><script type="application/json">'+JSON.stringify({videoUrl:clip})+'</script>',refs=articleMaterialReferences(html,base,{public_player:true}).references;assert.deepEqual(refs.map(r=>r.url),['https://player.example.org/public-demo',clip]);
});
