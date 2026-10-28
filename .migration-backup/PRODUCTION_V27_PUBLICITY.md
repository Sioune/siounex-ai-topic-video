# v27 fixed publicity files and measured final duration

The existing owner-private Site retains all database tables and records. This revision adds no database migration, external access, credentials, scheduled worker or paid call.

Approved cover exports are stored as immutable, bounded file chunks in existing app_state. The file receipt binds both PNG exports, exact dimensions, SHA256, Library file identity and version, visual brand evidence, copy and ZIP. A same-origin file route serves the fixed bytes for viewing/download. Review receipts append history and bind the current approved script; a newer script makes that receipt historical. User approval of two covers is recorded with its limited scope and never advances paused operations or approves a video/publication.

The final media gate requires a SHA-bound actual-file probe receipt with container duration and video/audio playback endpoints all at most 60 seconds. Historical overlong receipts remain readable; newly submitted media cannot pass the gate without the probe evidence. This technical gate cannot establish hearing, content quality or source rights.

The existing private dispatch boundary supports bounded evidence/sample imports using the actual job owner read from the database. Screenshots are preserved as original bytes. Publication-time corrections and recommended-video associations are appended as new records, with superseded history retained. Relation baselines use the promoter's T+24 anchor and remain distinct from each old video's own first day. Unknown metrics remain null and diagnostic cutoff counts are recorded separately in notes.

Verified locally: real SQLite migrations and immutable file reads, dual-cover/branding/version refusals, stale/owner isolation, duplicate requests, milestone/rework/leases/recovery tests, duration boundaries, data append semantics and static typing. Hosted readback is required before delivery. Browser automation is unavailable on this Windows runtime; HTTP readback must not be described as a phone UI click test.

Recovery: retain the previous v26 source/archive and all frozen skill versions. Roll back code by deploying the saved version, never restore a stale database over live records.
