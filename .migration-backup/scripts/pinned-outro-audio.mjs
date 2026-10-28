import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {command as defaultCommand} from './media-adapter.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sameSequence=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export async function joinPinnedOutroAudio({body,outro,bodyFrames,outroFrames=119,output,command=defaultCommand}){
 if(!Number.isSafeInteger(bodyFrames)||bodyFrames<1||!Number.isSafeInteger(outroFrames)||outroFrames<1||bodyFrames+outroFrames>1800)throw Error('PINNED_AUDIO_FRAME_BUDGET');
 const dir=path.dirname(output),tail=path.join(dir,'original-outro-audio.m4a'),list=path.join(dir,'body-outro-audio.concat.txt'),bodySeconds=bodyFrames/30;
 for(const file of [body,outro,output,tail,list])if(typeof file!=='string'||/[\r\n\0]/.test(file))throw Error('PINNED_AUDIO_PATH_INVALID');
 if([output,tail,list].some(file=>fs.existsSync(file)))throw Error('PINNED_AUDIO_RESULT_EXISTS');
 if(!fs.statSync(body).isFile()||!fs.statSync(outro).isFile()||fs.realpathSync(body)===fs.realpathSync(outro))throw Error('PINNED_AUDIO_INPUT_INVALID');
 const original=sha(fs.readFileSync(outro)),bodyHash=sha(fs.readFileSync(body));
 const inspect=async file=>{
  const data=JSON.parse((await command('ffprobe',['-v','error','-select_streams','a:0','-show_streams','-show_data_hash','sha256','-show_entries','stream=codec_name,profile,sample_rate,channels,channel_layout,extradata_hash,duration','-of','json',file],180000)).out),stream=data.streams?.[0];
  if(!stream||stream.codec_name!=='aac'||!stream.profile||!stream.sample_rate||!Number.isInteger(stream.channels)||!/^SHA256:[a-f0-9]{64}$/i.test(stream.extradata_hash||''))throw Error('PINNED_AUDIO_HEADER_INVALID');return stream;
 };
 const [bodyHeader,tailHeader]=await Promise.all([inspect(body),inspect(outro)]);
 for(const key of ['profile','sample_rate','channels','channel_layout','extradata_hash'])if(bodyHeader[key]!==tailHeader[key])throw Error('PINNED_AUDIO_HEADER_MISMATCH');
 const measuredBody=Number(bodyHeader.duration);if(!Number.isFinite(measuredBody)||Math.abs(measuredBody-bodySeconds)>.025)throw Error('PINNED_AUDIO_BODY_DURATION_MISMATCH');
 const packets=async file=>{const data=JSON.parse((await command('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',file],180000)).out),values=data.packets?.map(p=>p.data_hash);if(!values?.length||values.some(v=>!/^SHA256:[a-f0-9]{64}$/i.test(v||'')))throw Error('PINNED_AUDIO_PACKETS_INVALID');return values;};
 const expected=await packets(outro),expectedBody=await packets(body);
 await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-i',outro,'-map','0:a:0','-vn','-c:a','copy','-n',tail],180000);
 if(!sameSequence(expected,await packets(tail))||sha(fs.readFileSync(outro))!==original)throw Error('PINNED_OUTRO_AUDIO_CHANGED');
 const quote=f=>path.resolve(f).replaceAll('\\','/').replaceAll("'","'\\''");
 fs.writeFileSync(list,`ffconcat version 1.0\nfile '${quote(body)}'\nduration ${bodySeconds}\nfile '${quote(tail)}'\n`,{flag:'wx'});
 await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','concat','-safe','0','-i',list,'-map','0:a:0','-c:a','copy','-n',output],180000);
 const actual=await packets(output),start=expectedBody.length;
 if(!sameSequence(actual.slice(0,start),expectedBody)||!sameSequence(actual.slice(start),expected)||sha(fs.readFileSync(outro))!==original||sha(fs.readFileSync(body))!==bodyHash)throw Error('PINNED_OUTRO_AUDIO_CHANGED');
 return {outro_sha256:original,original_aac_packets:expected.length,original_aac_sequence_present:true,original_aac_sequence_start_packet:start,body_frames:bodyFrames,outro_frames:outroFrames,body_duration_seconds:bodySeconds,stream_copy_join:true};
}
