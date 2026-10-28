// Deterministic, bounded ZIP with UTF-8 names and stored entries. No external calls.
const enc=new TextEncoder();
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function promoZip(files:{name:string;bytes:Uint8Array}[]){
 if(!files.length||files.length>12||files.reduce((n,f)=>n+f.bytes.length,0)>14000000)throw Error('宣发ZIP超出有界打包范围');
 const chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const f of files){if(!f.name||/[\\/]/.test(f.name))throw Error('ZIP文件名无效');const name=enc.encode(f.name),sum=crc(f.bytes),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,sum,true);v.setUint32(18,f.bytes.length,true);v.setUint32(22,f.bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);
 const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(14,33,true);e.setUint32(16,sum,true);e.setUint32(20,f.bytes.length,true);e.setUint32(24,f.bytes.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);chunks.push(local,f.bytes);central.push(entry);offset+=local.length+f.bytes.length;}
 const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);chunks.push(...central,end);const out=new Uint8Array(offset+size+22);let pos=0;for(const c of chunks){out.set(c,pos);pos+=c.length;}return out;
}
