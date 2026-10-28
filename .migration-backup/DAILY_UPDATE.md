# Daily Chinese topic update

Keep this existing owner-private Site: appgprj_6ac65bafa2a48191a4283cb34ebd5e11.
Do not create another Site, widen access, replace the database, or use the user's computer.

## Access and sources

1. Read Sites get_site for this exact project. Confirm active, owner-private, and current live URL.
2. Obtain the existing service credential returned by get_site. Do not generate or rotate credentials. Keep it only in memory; never put it in prompts, source, logs, or files. Send it only to this Site in the platform's OAI-Sites-Authorization header. It is consumed by dispatch and does not impersonate a signed-in visitor.
3. Chinese public sources need no user connector: https://www.qbitai.com/feed (follow same-site article because feed summary is short); https://www.ifanr.com/feed (content:encoded); https://www.geekpark.net/rss (description); https://www.ithome.com/rss/ (description). Verify reading sources independently from writer access. Search additional native Chinese articles when useful. Do not collect large English batches and translate titles. IT之家 only retains roughly 60 recent items; daily sampling cannot claim complete 24-hour coverage. Do not fall back to stale snippets when the original cannot be read.

## Read, select, and write

4. GET /api/catalog?offset=0 and follow next_offset until null. Read all history including legacy English, selected, rejected, and produced flags. These flags are only for avoiding repeated recommendations; never change them.
5. Look for real new progress, with Chinese source pages and substantive, readable Chinese briefs. Aim for about 50 new topics per Shanghai day, but do not pad. Skip irrelevant hardware, finance, pure benchmark stories and multi-story roundup cards; a useful roundup section may be made into one clearly focused topic. Preserve actual published_at; collected date is not publication date.
6. Compare canonical URLs, cross-source copies, product/version/event, and historical selections/dispositions. For an existing event, retain its id with existing_id and update that record, retaining source links. New development is an update, not another card. Do not turn differing angles on the same event into separate new items. Avoid merging unrelated uses of the same model.
7. POST /api/ingest with Content-Type application/json, no browser Origin, and JSON {"entries":[...]} containing 1–50 entries. Each entry requires: url (HTTPS Chinese article), source, title, summary (factual complete Chinese; >=35 Chinese characters), angle (Chinese filming angle), materials (specific verified material pointers and limits), risk (Chinese caveats), published_at (actual publication ISO timestamp, or null when unknown; do not substitute crawl time or a last-updated timestamp). Optional event_key is a stable semantic event key <=150 characters; existing_id is the existing t_... id to update; related_urls is an array of {url,title,source,published_at}. The endpoint changes shared content only, never favorites or dispositions. It enforces a maximum of 50 new records per Shanghai date across all writers. Updates to existing records do not consume that quota.
8. GET /api/status and the necessary /api/catalog pages to read back ids, Chinese text, source URLs and dates. Retrying the same URL is idempotent; on an uncertain response read back first. A cooldown response means another collector is active; wait and retry without editing source or starting another schedule. Source failures retain old data.
9. Report useful findings and actual counts; disclose source failures and coverage. Do not claim a source roundup count is an independently verified topic count. Do not implement personal auto-scoring; that research was postponed.

## Optional fixed-source collection

POST /api/refresh with JSON {} directly fetches the four configured Chinese sources and does language/relevance filtering and conservative event/URL deduplication. This is a convenience collector, not a replacement for the semantic comparison and factual Chinese briefs above. Use it only after editorial ingestion or when a source snapshot is appropriate. It never deletes legacy records; UI keeps those under 历史英文. Automatic duplicate detection is heuristic, so read back and review ambiguous event pairs. Prefer /api/ingest for the scheduled researched update.

## Verification

The production writer must be verified using intended service access and an initial real-content write, then read back via API. Never claim unattended updates are working from a page-open refresh alone. The parent coordinates the single daily schedule. Routine updates need no build or republish.
# 2026-10-10：有限自动接单补齐

独立 task-4 checkout 新增只读待办选择、原四来源的绑定素材抓取与不可变本机缓存，人工启动一次可接力现有文本生成/审核/有限返工。修复技能对象在生成提示词中显示为 `[object Object]` 的缺陷；旧任务使用自身冻结规范，未批量改写历史。无新增迁移、账号、网络配置、调度或付费请求。

实际 SQLite、执行器 mock、类型检查均通过；旧表字段及收藏/排除保护、并发领取、版本失效、预算、模式和已知回执恢复仍通过。既有实际媒体/模型验收证据保留，本轮新流程没有伪称新的整条真实模型制作验收。手机导航与恢复沿用已测 v9 基线；历史交付禁止用当前 Library 链接伪装旧版文件。

最新 Claude 内容 `A2-highlight-outline-v6`，Library 完整/前三秒7、首帧6，已真实回写并独立回读。只追加一个人工待审回执；原 job 其他字段、历史、人工模式完全一致。本轮未试听、未渲染、未发布。完整播放器到末尾但两次暂停恢复，此限制已保存。

自动唤醒尚缺本机项目及原生任务目标的明确授权与登记；官方 Library 上传 prepare 在本环境不可用，六个工程样例只留本机。详见 `PRODUCTION_DISPATCH.md`。发布本轮代码保留原 owner-only 站和现有数据库，不覆盖实时视频状态；可回滚已保存 v10/v8 代码，勿恢复旧数据库快照。

# Latest website acceptance and recovery, 2026-10-10

Same private Site received readonly v13 recovery export. Full untruncated live backup, separate SQLite restoration and additive 0006/0007 validation passed with every old row hash unchanged. Actual promo mobile edit/copy/download/history/human-priority and two real existing-account AI generations passed. Data-center screenshot bytes, truthful timestamps, T+24 cohorts, distinct recommendation interactions, old-video T+24/T+48 cumulative observations, duplicate protection and navigation/back passed on marked isolated fixtures. Required media feedback starts bounded rework while retaining rejected versions and counters. New modules are intended for same-site v14 with sharing and protected Claude job unchanged. See PRODUCTION_NATIVE_TARGET.md for exact evidence/limits.

Claude publication at 20:22 Shanghai is user self-report only. Latest full skill d0a38070a7ed7ed2f1699c8a60cea878a3fed1a8 child files remain unavailable. Actual v9 ZIP was verified/inspected but is a prepared-case renderer, not an arbitrary-topic engine. No automatic wake, new key, daemon, media fee or external publishing.



## v15 acceptance update, 2026-10-10

The complete official 38-file d0 freeze is now verified and used in actual generation and independent review. One actual title-metadata rejection, bounded rework and source approval passed; the new script waits on human. The generic normal adapter completed a full 53-second existing-archive render, pause/recovery, native Library upload and video callback, with all QA limitations retained. The new-script matching voice/caption timeline and listening remain unavailable/human-gated. No production data migration or scheduling occurred. See [PRODUCTION_V15_ACCEPTANCE.md](./PRODUCTION_V15_ACCEPTANCE.md) for exact evidence, old-job preservation and current boundaries. This supersedes the former missing-skill/native-upload statements, without claiming a new-topic finished creative video.


## 2026-10-11 closure review

Read the two review/matrix documents. V8 and exact V3 publicity assets/final ZIP V1 were appended to the existing Decision-1 job; 13 immutable website downloads matched hashes, full ZIP CRC passed. v30 deployed the separate script/video/archive/publication facts, foreground executor presence/session and logical data aggregation. Real production API readback confirmed oral V8 binding, online/stopped presence, one concurrent winner, 4 logical works/7 revisions and 3 relations/6 rows with missing followups still null. No schema changes, new fees, new persistent credentials or publication. Existing protected job and all history retained. Further bounded-process safeguards tested on an isolated actual Windows Node process tree. See CLOSURE_ACCEPTANCE.md for the 30-item mapping, evidence and unfinished browser/wake/media handoff boundaries.
