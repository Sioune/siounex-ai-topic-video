// A stopped transport can leave a complete candidate in both its final log
// and output file. Recover those exact words; never reinterpret the transport
// as successful or grant a new model call, approval, or external submission.
export function promoOutputTerminalProof(v:any){
 if(v?.exit_code!==0)return false;
 if(v.timed_out===false&&v.result_unknown===false)return true;
 const r=v.output_readback;
 return typeof v.timed_out==='boolean'&&typeof v.result_unknown==='boolean'&&
  (v.timed_out===true||v.result_unknown===true)&&r?.schema==='promo-existing-output-readback-v1'&&
  r.original_timed_out===v.timed_out&&r.original_result_unknown===v.result_unknown&&
  r.output_log_suffix_sha256===v.output_sha256&&/^[a-f0-9]{64}$/.test(v.output_sha256||'')&&
  r.original_process_evidence_preserved===true&&r.candidate_readback_only===true&&
  r.model_called_again===false&&r.quality_approved===false&&r.publication_authorized===false;
}
