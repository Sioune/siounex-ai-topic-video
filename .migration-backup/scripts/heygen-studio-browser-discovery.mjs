// Directory discovery is not browser evidence. Only this named, completed
// read-only prefix may precede the real CUA observations in a Studio child.
const sha=/^[a-f0-9]{64}$/,id=/^[A-Za-z0-9_.:-]{1,200}$/;
export const isStudioDirectoryDiscovery=e=>e?.item_type==='mcp_tool_call'&&e.tool==='other'&&e.mcp_server==='codex'&&e.mcp_tool==='list_mcp_resources';
export function studioBrowserEvents(events){
 if(!Array.isArray(events))return null;
 const firstBrowser=events.findIndex(e=>e?.tool==='cua_repl.js'),discoveryIds=new Set(),tools=events.filter(e=>e?.tool!=null);
 if(tools.some(e=>e.tool!=='cua_repl.js'&&!isStudioDirectoryDiscovery(e)))return null;
 for(const e of tools)if(isStudioDirectoryDiscovery(e))discoveryIds.add(e.item_id);
 for(const itemId of discoveryIds){
  const rows=events.filter(e=>e?.item_id===itemId),positions=rows.map(e=>events.indexOf(e));
  if(!id.test(itemId||'')||rows.length!==2||rows.some(e=>!isStudioDirectoryDiscovery(e)||e.diagnostic!=null||e.failure_class!=null||e.api_calls!=null&&(!Array.isArray(e.api_calls)||e.api_calls.length))||rows[0].event!=='item.started'||rows[0].status!=='in_progress'||rows[1].event!=='item.completed'||rows[1].status!=='completed'||!sha.test(rows[1].response_sha256||'')||firstBrowser>=0&&positions.some(i=>i>=firstBrowser))return null;
 }
 return{events:events.filter(e=>!isStudioDirectoryDiscovery(e)),discovery_count:discoveryIds.size,tool_call_count:new Set(tools.map(e=>e.item_id)).size,browser_tool_call_count:new Set(tools.filter(e=>e.tool==='cua_repl.js').map(e=>e.item_id)).size};
}
