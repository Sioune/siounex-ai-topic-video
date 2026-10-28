import {handleCollectionMcp} from '@/lib/data-collection-mcp.mts';
import {readDueCollectionReminders,markCollectionRemindersGenerated} from '@/lib/publication-collections';
import {publishingMcpTools,callPublishingMcp} from '@/lib/publishing-mcp';
import {studioPreviewOwnerPolicyMcpTools,callStudioPreviewOwnerPolicyMcp,STUDIO_PREVIEW_OWNER_POLICY_MCP_NAME} from '@/lib/studio-preview-owner-policy-mcp';
export async function POST(req:Request){return handleCollectionMcp(req,{readDue:readDueCollectionReminders,markGenerated:markCollectionRemindersGenerated,extraTools:[...publishingMcpTools,...studioPreviewOwnerPolicyMcpTools],callExtra:(owner,name,args)=>name===STUDIO_PREVIEW_OWNER_POLICY_MCP_NAME?callStudioPreviewOwnerPolicyMcp(owner,name,args):callPublishingMcp(owner,name,args)});}
