// Synthetic recorded receipts only; never starts a provider or edits real data.
export const startupTransportDiagnostics=Object.freeze([
 'Reconnecting... 2/5','Reconnecting... 3/5','Reconnecting... 4/5','Reconnecting... 5/5',
 'Falling back from WebSockets to HTTPS transport. request timed out',
]);
export function addAcceptedStartupTransport(f,name){
 f.patch(name+'/process/process-exit.json',r=>{r.result_unknown=false;r.lifecycle_cleanup_completed=true;r.termination_unconfirmed=false;});
 f.patch(name+'/browser-events.json',s=>{
  s.events.splice(2,0,...startupTransportDiagnostics.map(diagnostic=>({event:'error',tool:null,item_type:null,diagnostic})));
  for(const e of s.events)if(e.tool==='cua_repl.js'){e.mcp_server='cua_repl';e.mcp_tool='js';}
  s.startup_transport_recovered=true;s.validation.startup_transport_recovered=true;
  s.diagnostics=[...(s.diagnostics||[]),...startupTransportDiagnostics];
 });
}
