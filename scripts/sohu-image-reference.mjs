import {createDecipheriv,createHash} from 'node:crypto';
import {isSohuArticleUrl,sohuPublicImageUrl,sohuImageMetadata} from '../lib/sohu-image-metadata.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
// This public rendering constant and AES/ECB/Pkcs7 mode are declared by Sohu's
// normal article bundle. It is not an account credential. Never evaluate that
// bundle or an inline script to discover an image URL.
const renderingKey=Buffer.from('www.sohu.com6666','utf8');
const renderingScript='https://g1.itc.cn/msfe-pcarti-prod/300000000000/assets/js/main_article-cf45afb.js';
const renderingScriptSha='acc1c418b574c8f495c95aac53c4051c7ea3aa481c527909473319ab0d08801b';

export function mapSohuImageReference(value,{sourceUrl,html,sourceSha256}){
 if(!isSohuArticleUrl(sourceUrl))return null;
 // Preserve ordinary URL/path handling. Opaque data-src values must never be
 // resolved against the article URL as though they were relative image paths.
 if(/^https?:\/\//i.test(value)||/^\/\/[^/?#]+\.[^/?#]+(?:[/?#]|$)/.test(value)||/\.(?:png|jpe?g|webp|gif)(?:[?#]|$)/i.test(value))return null;
 try{
  if(typeof value!=='string'||value.length>4096||!value.length||value.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('image-token');
  const ciphertext=Buffer.from(value,'base64');
  if(!ciphertext.length||ciphertext.length%16||ciphertext.toString('base64')!==value)throw Error('image-token');
  const decipher=createDecipheriv('aes-128-ecb',renderingKey,null),plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(plain),url=sohuPublicImageUrl(decoded),declared=sohuImageMetadata(html,sourceUrl);
  if(!declared?.urls.has(url)||!/^[a-f0-9]{64}$/.test(sourceSha256))throw Error('image-membership');
  return {url,audit:{schema:'sohu-public-image-reference-v1',method:'public-renderer-aes-128-ecb-pkcs7',original_data_src:value,original_data_src_sha256:sha(value),decoded_url:url,source_document_sha256:sourceSha256,page_imgs_list_sha256:sha(declared.raw),declaration_basis:declared.kind,rendering_script_url:renderingScript,rendering_script_sha256:renderingScriptSha}};
 }catch{return {blocked:true,reason:'Sohu article image does not have a valid public rendering mapping and exact same-page image declaration'};}
}
