import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativePublicationObservation,nativePublicationAnchor,nativePublicationInterval,publicationTimeDescription} from '../lib/publication-details.mts';

const interval={range_start:'2026-10-10T15:12:56.810127+08:00',range_end:'2026-10-10T15:13:56.858140+08:00',evidence_note:'SYNTHETIC: one submit, native success screen and owner confirmation.'};
const source=()=>JSON.stringify({schema:'owner-click-publication-v1',time_source:'native_observation',precision:'observed_interval',display_time:'SYNTHETIC',timestamp_role:'collection_anchor',platform:'wechat_channels',video:{storage:'site-private-r2',site_archive_id:'SYNTHETIC',sha256:'a'.repeat(64)},independent_platform_verification:false,exact_platform_published_at:null,collection_anchor_rule:'observation_range_end',native_observation:interval});

test('native interval preserves evidence precision and rounds the collection anchor conservatively',()=>{
 assert.deepEqual(parseNativePublicationObservation(interval),interval);
 assert.equal(nativePublicationAnchor(interval),'2026-10-10T07:13:56.859Z');
 assert.equal(nativePublicationAnchor({...interval,range_end:'2026-10-10T15:13:56.999999999+08:00'}),'2026-10-10T07:13:57.000Z');
 assert.equal(nativePublicationAnchor({...interval,range_end:'2026-10-10T15:13:56.858000000+08:00'}),'2026-10-10T07:13:56.858Z');
 assert.deepEqual(nativePublicationInterval(source(),nativePublicationAnchor(interval)),interval);
 assert.match(publicationTimeDescription(nativePublicationAnchor(interval),source()),/原生成功观察区间.*官方精确发布时间未知/);
});

test('native observation rejects malformed, reversed, future, oversized and unsupported evidence',()=>{
 for(const changes of [{range_start:'2026-10-10T15:12'},{range_start:'2026-02-30T00:00:00Z'},{range_start:'2026-10-10T07:13:56.858141Z'},{range_end:'2026-10-11T07:12:56.810128Z'},{range_end:new Date(Date.now()+3600000).toISOString()},{evidence_note:''},{evidence_note:'x'.repeat(2001)}])assert.throws(()=>parseNativePublicationObservation({...interval,...changes}));
 assert.throws(()=>parseNativePublicationObservation([]));
 assert.equal(parseNativePublicationObservation(undefined),null);
});

test('a timestamp correction cannot reuse the old native interval as its new publication time',()=>{
 const corrected='2026-10-10T08:00:00.000Z';
 assert.equal(nativePublicationInterval(source(),corrected),null);
 assert.match(publicationTimeDescription(corrected,source()),/已更正/);
 assert.doesNotMatch(publicationTimeDescription(corrected,source()),/原生成功观察区间：/);
 const forged=JSON.parse(source());forged.independent_platform_verification=true;
 assert.equal(nativePublicationInterval(JSON.stringify(forged)),null);
});
