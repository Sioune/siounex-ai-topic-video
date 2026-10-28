import {isFrameBudgetRecoveryCandidate} from './private-frame-budget-selection.mts';
import {validNativePreclaimReconciliation} from './native-preclaim-reconciliation.mts';

// This is a read-only scheduling hint. Current owner/scope checks come from
// listWaitingNativePreparationHandoffs; continuation still verifies every saved
// producer byte and decides whether the complete recording fits the70s policy.
export function isNarrationFitRecoveryCandidate(h:any):boolean{
 if(h?.reconciliation&&!validNativePreclaimReconciliation(h.reconciliation))return false;
 if(!Number.isSafeInteger(h?.binding?.mode_epoch)||h.binding.mode_epoch<0||!/^[a-f0-9]{64}$/.test(h.binding?.script_hash||'')||!/^[a-f0-9]{64}$/.test(h.binding?.contract_hash||'')||typeof h.binding?.scope_id!=='string'||!h.binding.scope_id)return false;
 return isFrameBudgetRecoveryCandidate(h);
}
