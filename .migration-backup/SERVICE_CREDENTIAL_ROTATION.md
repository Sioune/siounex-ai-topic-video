# Existing service access dependencies and rotation

Only the existing private Site appgprj_6ac65bafa2a48191a4283cb34ebd5e11 is in scope. The Site service bearer is separate from short-lived Git source-write credentials and from real visitor identity. No token value belongs in this document, source, files, logs, prompts or shell arguments.

Known callers:

- `scripts/native-scheduled-worker.mjs` obtains the existing value through native Sites `get_site` on each run, keeps it in RAM and passes hidden stdin to the bounded queue. No static secret needs replacing in that caller.
- `scripts/production-autonomous-pass.mjs`, `production-session-executor.mjs`, `production-dispatch-executor.mjs`, `production-workflow-executor.mjs`, `production-codex-executor.mjs`, `production-media-executor.mjs`, `production-promo-executor.mjs`, `production-executor.mjs`, `site-request.mjs`, and the smoke/preflight runners receive the service value in hidden stdin. The next invocation must obtain the current value, rather than reuse an older in-memory value.
- Existing queue reads/claims/checkpoints/submissions use `/api/executor`; the media upload transport also uses `/api/publicity-assets` POST. GET media routes require real visitor/job-owner identity and continue rejecting service-only callers after rotation.
- Known daily update instructions in `DAILY_UPDATE.md` obtain the existing native value per run. This checkout does not establish that every remote caller follows those instructions. Do not assume a complete external inventory.
- A currently running finite caller may still hold the previous value. Do not stop another task or blindly restart rendering/model calls. A rejected transport leaves its checkpoint/files available for reconciled recovery with current access.

After explicit user authorization, invoke only the official Site service-token rotation operation for this exact project. Retain the result in RAM, never print it. Future native reads receive the new value; hand it programmatically to hidden stdin for existing bounded callers. Do not change sharing, queue data, jobs, persistent secrets, services, network settings or the Git credential.

Verify read-only service status and a current job read with the new value. Verify the prior value against the same read-only status endpoint. The official operation warns that the prior value may remain valid briefly: report an observed overlap without claiming instant revocation or inventing an expiry. Verify service-only media access still receives401. Do not claim a real owner browser test from those HTTP checks. Do not run the production queue merely as a credential test.
