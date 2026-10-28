# 已完成选题的成品迭代与站内回传

此流程接收已真实完成、并由所有者明确认可的新 ChatCut 导出，或保留原批准画面码流的本地仅音轨混合成品。它适用于既有私有交付之后的本人声音替换、节奏、字幕位置、片尾、已授权配乐混音等迭代。稿件 revision 与视频制作 v4/v5 等名称是两种版本，不应混用。MiniCPM 及受保护任务不接收此入口。

## 何时算完成

本机 MP4、聊天中的预览、ChatCut 工程和技能更新均不能单独代表选题网站已完成新版交付。当前新版须同时具有：

- 真实最终 MP4 SHA256、字节数、完整时长、project/timeline 工程身份与技术检查。ChatCut 原生导出使用真实 render UUID；本地仅音轨混合使用下文的空 render 与严格回执，不伪造原生渲染身份。
- 针对该精确文件的实际人工认可。记录用户原话和来源，声音类型如实为 owner-cloned 或 ordinary-temporary；聊天批准不能冒称网站按钮点击。
- 六项本站私有文件：video、source_bundle、cover_3_4、cover_4_3、promotion、complete_bundle；均经服务器封存和实际完整二次下载 SHA/大小校验。
- 原子版本提交后的当前 video/cover/promotion/delivery 正式节点及 completed 状态。source/script 原批准和所有历史成品、认可、下载继续保留。
- 在所有者网站实际核对当前成片和交付包可播放/下载；不能只核对上传元数据。

制作归档包保存实际引用源、当前实例参数/MG 源码、音轨、最终字幕与 Source 位置、QA、认可和恢复说明。完整交付包保存最终成片、双比例封面、宣发、字幕与真实档案索引。普通 ZIP 不是可直接导入 ChatCut 的原生工程；恢复能力必须如实说明。

## 执行协议

1. 通过当前所有者 Sites 原生读取取得访问上下文；凭据仅在内存和隐藏 stdin 中使用，不写文件、命令参数或日志。读取 production job 与 native_work_packet，核验当前已 completed 的精确 base 视频、稿件、模式、合同、owner 和私有 scope。
2. 调用 approved_native_version_begin。输入包含稳定 request_id、当前 binding、base milestone/version/hash/SHA、新 video 原生身份/实际文件元数据、真实 approval、actual-final-duration-v1 与完整技术 QA、有限 adjustments，以及当前已批准双封面/宣发的真实 sitefile ID/SHA。publication_authorized=false、new_paid_calls=0、new_generation_authorized=false。
3. 保存返回的 version.version_id、archive_context 和原始回执。staging 不改变原来已完成交付。相同 request_id/相同输入幂等；不同文件或认可不能复用该身份。
4. 每文件沿用 site_archive_start → site_archive_part → site_archive_finalize → site_archive_read_part（实际重组完整文件并算 SHA）→ site_archive_confirm。只有 start 额外携带 version_request_id，其余操作从归档身份读取版本上下文。六角色每版各一项，每个文件严格小于 50MiB；后续版本不占用旧版的六项配额。
5. 旧双封面与宣发只有在实际字节相同、对应原正式节点已 approved 时才可沿用。旧材料中的历史备注不能替代本次新版视频身份；在新版 README/清单写明复用来源。改动文案内容或封面需要对应的新认可流程，不借用旧认可。
6. 全六项 confirmed 后调用 approved_native_version_commit，传回六个真实归档 ID。单个 CAS 事务绑定原完成版、当前 owner/稿件/scope 与所有文件后新增正式节点。提交失败先 read，不重做媒体、不重复生成；中断可用相同请求和分片回执续传。
7. 用 approved_native_version_read 和 job/native_work_packet 读回；验证候选 SHA、owner-cloned 标识、聊天认可来源、六项当前档案及最高 artifact_version；打开网站实际下载核对字节。最后才更新当前交付指针和向用户报告完成。

若所有者明确取消待归档版本，调用 approved_native_version_cancel，传入 version_request_id、begin 返回的 request_hash、explicit_user_direction:true 与真实 note。取消仅软标记 staging 版本，保留当前交付和已存字节；不能取消已 committed 版本。取消后可用新 request_id 接续真正的新成品。

实现位于 lib/approved-native-version.ts、lib/approved-native-version-context.ts 和 lib/site-file-archive.ts。独立 SQLite/R2 回归覆盖并发与旧文件保留。

## 本地仅音轨混合成品

原来 `video.render_id` 为真实 ChatCut UUID 的请求保持原样。若最终文件通过本地音轨混合生成，`video` 必须额外提供以下字段；project_id/timeline_id 保留实际可编辑 ChatCut 工程与时间线，不能充当最终本地文件的渲染回执：

```json
{
  "render_id": null,
  "delivery_method": "local-audio-only-finishing",
  "local_audio_proof": {
    "schema": "local-audio-only-finishing-v1",
    "base_video_sha256": "原当前已批准成片SHA256",
    "output_video_sha256": "本次最终MP4的SHA256",
    "source_video_stream_sha256": "原批准视频的解复用视频码流SHA256",
    "output_video_stream_sha256": "最终文件的解复用视频码流SHA256，必须与原码流一致",
    "video_stream_unchanged": true,
    "music_sha256": "本次实际音乐文件SHA256",
    "music_gain_db": -15,
    "audio_codec": "aac",
    "audio_bitrate_kbps": 192,
    "recovery_receipt_sha256": "与qa.recovery_receipt_sha256相同的真实恢复回执SHA256",
    "checked_at": "实际核验ISO时间"
  }
}
```

上述摘要须实际从原件、最终文件及真实检查报告计算。服务器校验回执中的原成片 SHA 与本次 base、新文件 SHA、相同码流摘要、音乐摘要、AAC 192k 参数及恢复回执绑定；网站不自行运行媒体解码或重新计算解复用码流，实际媒体检查由制作会话保存在该回执中。music_gain_db 仅接受 -60 至 0 的有限数值；它记录此次已认可文件的参数，不授予新的调音、生成、付费或发布权限。完整解码、原批准口播保留、时长检查和针对最终文件的明确人工认可仍是必填条件。

begin 为该方法分配确定性的 `site_delivery_<SHA256>` 本站交付编号，commit 将其写入正式视频的 provider_job_id。candidate、qa 和只读 native_work_packet 保存 delivery_method、delivery_id、native_render_id:null 与 local_audio_proof，网站显示“本地音轨混合成品，保留ChatCut可编辑工程”。render_id 始终为 null；原批准视频及其真实旧 render 留在历史记录中。最终MP4仍须经过六角色完整归档与同一CAS提交，任何前置绑定改变都会阻止切换。

## 自动执行边界

此回传入口不调用 HeyGen、ChatCut 渲染、模型、收费服务，也不授权公开发布。外部制作仍由具备相应工具的制作会话或已明确授权的执行器完成；完成后必须运行上述回传步骤，不能停在本机交片。网站不会仅因聊天说“已完成”就自动知道导出文件的真实字节。

