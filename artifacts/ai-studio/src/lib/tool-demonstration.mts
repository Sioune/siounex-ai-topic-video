export function requiresToolDemonstration(source:Record<string,unknown>){
 const requirements=source.production_requirements as Record<string,unknown>|undefined;
 return source.demonstration_required===true||requirements?.demonstration_required===true||['tool-demonstration','hands-on-comparison','gameplay-comparison'].includes(String(source.production_form||requirements?.form||''));
}
export function toolDemonstrationProblems(content:Record<string,unknown>){
 const check=content.demonstration_check as Record<string,unknown>|undefined;if(!check||check.schema!=='actual-tool-demonstration-v1')return ['缺少真实调用界面及实际干活连续视频，静态图、文字或模拟UI不能替代'];
 const files=check.files as Record<string,unknown>[];if(!Array.isArray(files)||!files.length)return ['没有对应节点的实际视频文件'];const issues:string[]=[];
 for(const f of files){if(f.kind!=='recorded-tool-session'||!/^[a-f0-9]{64}$/.test(String(f.sha256))||typeof f.size_bytes!=='number'||f.size_bytes<=0||typeof f.duration_seconds!=='number'||f.duration_seconds<3||!Number.isFinite(Date.parse(String(f.checked_at)))||f.full_decode!==true||typeof f.actual_tool!=='string'||!f.actual_tool.trim()||typeof f.visible_action_result!=='string'||!f.visible_action_result.trim()||f.simulated_ui!==false||!Array.isArray(f.frame_hashes)||f.frame_hashes.length<2||f.frame_hashes.some(h=>!/^[a-f0-9]{64}$/.test(String(h))))issues.push('视频身份、真实工具/动作/结果、连续性或实际取帧证据不完整');}
 const mapping=check.mapping as Record<string,unknown>[];if(!Array.isArray(mapping)||!mapping.some(m=>m.segment==='opening-0-3'&&files.some(f=>f.sha256===m.file_sha256)&&typeof m.source_in==='number'&&typeof m.source_out==='number'&&m.source_out-m.source_in>=3)||!mapping.some(m=>m.segment==='core-operation'&&files.some(f=>f.sha256===m.file_sha256)))issues.push('前三秒与核心实际操作没有逐段绑定到同一确切视频');
 if(files.some(f=>!Array.isArray(f.frames)||f.frames.length<2||(f.frames as Record<string,unknown>[]).some(frame=>typeof frame.file!=='string'||!frame.file||!/^[a-f0-9]{64}$/.test(String(frame.sha256))||typeof frame.source_second!=='number'||!Array.isArray(f.frame_hashes)||!f.frame_hashes.includes(frame.sha256))))issues.push('缺少与实际视频绑定的可打开原始取帧文件');
 if(check.semantic_review!=='actual-file-reviewed')issues.push('技术解码不等于真实画面语义核验');return issues;
}
