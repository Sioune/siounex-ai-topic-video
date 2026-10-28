type Candidate={library_file_id:string;file_id:string;file_name:string;size_bytes:number;mime_type:string;source_video_sha256:string};
export function promoBundleLink(receipt:string|null,videoBinding:string,isCurrent:boolean){
 if(!receipt||!isCurrent)return null;
 try{const r=JSON.parse(receipt),b=r.complete_bundle as Candidate,v=JSON.parse(videoBinding);
  if(r.publication!==false||r.quality_approval!==false||!b||!/^libfile_[a-f0-9]+$/.test(b.library_file_id)||!/^file_[a-f0-9]+$/.test(b.file_id)||b.mime_type!=='application/zip'||!Number.isInteger(b.size_bytes)||b.size_bytes<=0||typeof b.file_name!=='string'||!b.file_name.trim()||b.source_video_sha256!==v?.sha256)return null;
  return {file_name:b.file_name,size_bytes:b.size_bytes,href:'https://chatgpt.com/api/library/files/'+b.library_file_id+'/download',file_id:b.file_id};
 }catch{return null;}
}
