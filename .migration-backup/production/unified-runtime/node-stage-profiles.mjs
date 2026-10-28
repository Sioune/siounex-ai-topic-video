import {NODE_STAGE_PROFILE,NODE_STAGE_LAYOUT} from './node-stage-layout.mjs';
import spacedLayout from './node-stage-layout-v2.json' with {type:'json'};

// Keep the original v1 module bytes stable for existing frozen project identity.
export const NODE_STAGE_SPACED_PROFILE='approved-node-stage-v2';
export const NODE_STAGE_SPACED_LAYOUT=spacedLayout;
export function nodeStageLayout(profile){return profile===NODE_STAGE_PROFILE?NODE_STAGE_LAYOUT:profile===NODE_STAGE_SPACED_PROFILE?NODE_STAGE_SPACED_LAYOUT:null;}
