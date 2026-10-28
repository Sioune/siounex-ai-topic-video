# Script revision and immutable rules

`request_revision` on the existing private executor protocol records an explicitly delegated owner change request. It is limited to the current awaiting-review revision and content hash, uses a stable request ID, and writes a review audit with actor `delegated-owner-change-request`. It never fabricates a browser visitor identity, grants approval, changes personal topic dispositions, or runs media generation.

The next lease uses the updated frozen skill. The job retains the full previous skill snapshot, prior contract hash and corresponding draft hash; draft rows are immutable. New rules carry verified cloud revision `eb015e0e41f627d1157f6671466d1473e6cb2363`. This checkout now contains the three supplied changed files; other cloud references are not claimed locally restored.

CLI receipts/cache are scoped by job and stable submission ID, so a new revision cannot overwrite a prior execution or accidentally reuse its output. A successful submission remains awaiting human review. A single manually launched executor remains required; no daemon, new credential, paid media, cloned voice, video publication or generalized stage scheduler was enabled.
