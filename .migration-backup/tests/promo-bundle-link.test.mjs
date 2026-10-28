import test from'node:test';import assert from'node:assert/strict';import{promoBundleLink}from'../lib/promo-bundle-link.mts';
test('complete package download is bound to current video without approving or publishing',()=>{
 const b={library_file_id:'libfile_0b69a0260cb48191a3148c7fc44f6637',file_id:'file_00000000af948230a9b930def174aa3f',file_name:'PixVerse龙_视频与宣发完整包_待审.zip',size_bytes:15209730,mime_type:'application/zip',source_video_sha256:'e587149fc0ca86559fc911b210a75524e542709277eefc4685d6b6ed11362f6a'},v=JSON.stringify({sha256:b.source_video_sha256}),r={publication:false,quality_approval:false,complete_bundle:b};
 assert.equal(promoBundleLink(JSON.stringify(r),v,true).href,'https://chatgpt.com/api/library/files/libfile_0b69a0260cb48191a3148c7fc44f6637/download');
 assert.equal(promoBundleLink(JSON.stringify(r),v,false),null);
 assert.equal(promoBundleLink(JSON.stringify(r),JSON.stringify({sha256:'old'}),true),null);
 assert.equal(promoBundleLink(JSON.stringify({...r,quality_approval:true}),v,true),null);
 assert.equal(promoBundleLink(JSON.stringify({...r,complete_bundle:{...b,library_file_id:'https://external.example'}}),v,true),null);
 assert.equal(promoBundleLink('{',v,true),null);
});
