# MiniCPM 原生导出 · 私有站内归档 · 待本人审核

仅支持 `job_9ef39025-d92e-4770-82d0-05881451c5df` 当前正式脚本 revision 2。此通路不使用 Library 伪身份、不进入 APV 既有批准版本流程，也不把上传文件当成本人通过。旧 Library 视频、原驳回和计数全部保留。

## 本人范围来自真实页面

暂停的当前 `video/revise` 在「继续准备与私有视频」可预览并确认私有制作范围。确认先以当前登录本人调用现有 `media_rework`，再同源调用 `media_scope_confirm`；前者只恢复状态并记录继续决定，既有 `reworks/attempt/ai_calls` 不增加、不重置，旧节点不改为通过。两步不是一个事务；第二步失败显示已保存继续决定但范围未确认，必须读回核对。服务凭据不会获得本人身份。原 scope 是免费准备、已失效或 scope 未确认时，下面的 begin 必须拒绝。

## executor 请求

所有下列动作均使用现有 owner-private `/api/executor`。带 Origin 的调用仍须真实同源本人；既有无 Origin 受保护服务边界保持不变。不能传入 Library ID、质量批准、发布或新增付费字段。

1. `native_site_draft_begin`：提交当前已真实完成并下载的 ChatCut 原生导出。平面字段如下，全部值取真实 fresh packet、当前 owner scope、原生导出及实际技术证据：

```text
action, id, request_id
revision=2, script_hash, mode_epoch, contract_hash, scope_id, scope_hash
base_milestone_id, base_artifact_version, base_artifact_hash, base_sha256
base_report_sha256, feedback_review_id, feedback_note_sha256
sha256, size_bytes, duration, file_name, project_id, timeline_id, render_id, source
quality_approved=false, publication_authorized=false, new_paid_calls=0
qa.semantic_listening_passed=false
qa.recovery_receipt_sha256
qa.final_duration = 实际 actual-final-duration-v1（绑定完整最终文件SHA，所有端点严格小于60秒）
qa.preview_proof = actual-native-preview-v1（真实 opening/core/ending 原生预览，绑定同一 project/timeline/render/视频SHA）
demonstration_check = 实际 actual-tool-demonstration-v1（本稿需要真实工具实演时必填）
```

`render_id` 必须是新完成的真实 ChatCut UUID，与旧历史 render 不同；保持原 MiniCPM project，文件 SHA 不得回收旧版。服务校验现有 Mini 返工反馈和本人继续记录的精确 revision/hash/decision/reviewer/note，不能由客户端创建这些身份。真实 native/render/恢复证据由制作会话核验；本站校验绑定结构与实际上传字节，不伪称直接调用 ChatCut 检查或亲自试听。

返回 `pending`：保存 `pending_id`（`nsd_…`）、`binding`、`scope_id`、`scope_hash`。同一 request_id 内容不可变。begin 不创建视频审核节点，不更新原视频。

2. 四角色逐项调用现有 `site_archive_start → site_archive_part → site_archive_finalize → site_archive_read_part → site_archive_confirm`。start 示例结构：

```text
action=site_archive_start, id, request_id=每文件稳定且唯一
pending_native_request_id=begin.pending.pending_id
binding=begin.pending.binding
owner_review_id=null
scope_id=begin.pending.scope_id, scope_hash=begin.pending.scope_hash
file={role, sha256, size_bytes, file_name, mime_type}
```

仅接 `video/cover_3_4/cover_4_3/promotion` 四项，每项小于50MiB；视频精确匹配 begin，封面为真实正确比例PNG，宣发为非空UTF-8文本。服务真实封存全部分片并核完整SHA；客户端完整二次下载核 SHA/大小后 confirm。存储记录保留 `owner_review_id:null`、`quality_review:'awaiting-human'` 和全部批准/发布/付费 false。这里没有 source/complete 角色；后续归档另走已支持且获授权的范围。

3. `native_site_draft_return` 仅 `{action,id,pending_id}`。四份实际确认及物化证据齐全后 CAS 一次创建递增视频与封面 `awaiting_human`、宣发 `pending`。旧视频/审核保持原字节；job 仍是已批准脚本 `approved`，不会 completed，不重置计数。前置视频与封面由真实本人通过后，原有审核依赖才把宣发移至 awaiting_human。最终质量由原 `milestone_review` 决定。

4. `native_site_draft_read` 仅 `{action,id,pending_id}` 读回固定状态和 job。成功 return 可原样重放；不能把同一 pending 作为新版本覆盖。

5. stale staging 恢复：明确调用 `native_site_draft_cancel` `{action,id,pending_id,note}`，只软取消尚未提交的 staging，保留原字节、取消理由和旧节点；新尝试使用新 request_id。已 returned 的 pending 不能取消，须通过正式审稿处理。新 scope/base 改动不会悄悄让旧 staging 有效。

## 页面与真实状态

当前新节点可播放本站私有 MP4、下载双封面与宣发。未审核不出现本人通过记录或伪按钮点击。待审核存储的 `quality_review` 是不可变入库事实，当前审核状态由最新正式节点显示。

只有真实原生完成 receipt、精确视频节点与四项确认归档绑定后，素材摘要才显示 `native-completed-awaiting-review`。旧 draft preflight 和准备 probe 保留历史、不改成 ready；旧 queued/blocked 准备不会再被页面描述为仍在空等新制作。技术完成、文件保存和用户质量通过分别记录。

变更需先完成在途 H/J 的既定上传/commit，再由根会话发布。此文档及本地实现不意味着已部署、已确认本人 scope 或已写入真实 Mini 数据。
