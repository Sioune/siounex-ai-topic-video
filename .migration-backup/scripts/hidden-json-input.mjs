// Read one bounded hidden JSON line. Windows PTYs may deliver a residual CR/LF
// after the previous prompt; blank terminators must never become a receipt.
export function readHiddenJsonInput(stream=process.stdin,{limit=40000,prompt='Ready for JSON on hidden stdin.'}={}){
 return new Promise((resolve,reject)=>{
  let s='',settled=false;const tty=stream.isTTY;
  function done(error){if(settled)return;settled=true;stream.off('data',data);stream.off('end',end);if(tty)stream.setRawMode(false);stream.pause();error?reject(error):resolve(s.trim());}
  function data(chunk){
   for(const c of String(chunk)){
    if(c==='\u0003'){done(Error('Cancelled'));return;}
    if(c==='\r'||c==='\n'){if(s.trim()){done();return;}s='';continue;}
    s+=c;if(s.length>limit){done(Error('Input too large'));return;}
   }
  }
  function end(){done(s.trim()?undefined:Error('Input closed before JSON receipt'));}
  if(tty)stream.setRawMode(true);console.log(prompt);stream.setEncoding('utf8');stream.on('data',data);stream.once('end',end);stream.resume();
 });
}
