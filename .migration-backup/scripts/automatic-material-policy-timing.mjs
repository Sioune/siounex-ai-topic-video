// Material selection may cover the complete pre-retiming audio. Final output
// still has a strict 1800-frame limit, enforced after measured body retiming.
// Keep the historical timing implementation intact for frozen projects.
import {automaticMaterialTiming as legacyTiming} from './automatic-material-timing.mjs';
import {inspectAutomaticMaterialTiming} from './automatic-material-timing-inspection.mjs';
export function automaticMaterialTiming(input){
 const timing=inspectAutomaticMaterialTiming(input);
 if(!timing)return null;
 const total=timing.body_frames+timing.outro_frames;
 if(total<=1800)return legacyTiming(input);
 if(total>2100)throw Object.assign(Error('AUTO_MATERIAL_NARRATION_REQUIRES_SCRIPT_REVISION'),{code:'AUTO_MATERIAL_NARRATION_REQUIRES_SCRIPT_REVISION'});
 return timing;
}
