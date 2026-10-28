# 有限执行器的自动接单与素材绑定

站点仍由原 owner-only Sites 权限保护。新增 `dispatch_next` 是只读选择，不领取、不审核、不调用模型。默认只选真实已授权待办；技术验收必须显式提供 `test_job_id`。正在由视频任务处理的 Claude job 永久排除，人工待审、未知暂停和未过期审核租约也不会自动接走。

人工启动一次 `node scripts/production-dispatch-executor.mjs`，随后从隐藏 stdin 传入短期 `{token,execute:true}` 即可选择待办，并接力既有有限文本流程；无需手工寻找 job ID 或下载原文。省略 `execute:true` 只检查状态，绝不执行。这个脚本不会安装调度或自我循环唤醒。

`dispatch_source` 绑定 job/revision/mode_epoch/contract_hash 与冻结来源。只使用原站现有四个来源和原有网络防护，抓取完整、有长度上限的响应，记录真实 URL、SHA256、来源快照哈希和获取时间。空白、超量、非法地址、抓取过程中版本变化都拒绝；不截断后冒充全文。冻结文件按 job/contract 存于忽略的 `.sites-runtime/dispatch-sources/`，返工复用同一份内容，不静默重新抓取变化后的文章。残留未确认文件或哈希变化需人工核对。

生成执行器现在使用任务自己的冻结技能。新版 `contents` 对象和旧版 `files` 对象都按其原 SHA256 检查并完整序列化，修复提示词出现 `[object Object]` 的问题。旧格式未哈希的便利拼接内容不作为指令。现有任务和历史快照没有批量迁移。旧调用回执若与修复后提示词不同会暂停核对，不能用不匹配缓存或因此自动重复模型调用。

自动文本审核仍通过既有真实 Codex CLI `gpt-5.6-sol`，通过继续、打回最多两轮；八次审核和六次执行上限不重置。断线后过期的同一审核可选中，通过既有不可变回执恢复；未知启动痕迹阻止新调用。封面必须先提供 SHA256 一致的本机图片，缺图在预约 AI 前停下。已批准稿件后的媒体操作返回明确接力需求，需要已授权输入和真正 Library 归档。没有视听适配器时成片暂停人工，不能以技术通过代替质量批准。

## 本轮实际验收范围

- 真 SQLite：只读选取、测试隔离、当前版本/模式绑定、来源白名单、完整响应哈希、非法地址/超量/旧版拒绝，原九张表全部原字段及收藏/排除保留。抓取响应使用隔离 mock，不宣称抓过新的真实文章。
- 执行器单元验收：扫描不执行、不可变素材复用、哈希变化阻断、缺封面不预约、媒体缺口不盲调、新旧冻结技能均完整读取。模型运行在这些新测试中是 mock，不能算新一轮端到端模型验收。
- 既有真实模型验收：来源打回后修正通过，虚假稿件打回，真实 PNG 封面通过并含可见观察。既有实际 FFmpeg 文件与技术回执不改写成真实选题成果。
- 最新 Claude 内容 v6 的 Library 文件实际只读核验为 7/7/6，生产 API 追加并独立回读一条人工待审回执，原 job 所有其他字段和旧记录逐项不变。同步器没有渲染、上传、观看或试听。生产者播放器到末尾零掉帧、两次暂停恢复，未声称连续无暂停或已人工批准。

## 尚未接通与准确的下一项决定

本机自动唤醒尚未安装。原站 Sites schedules 为空；两个已有 Codex 自动化均暂停且属于别的工作，本项目也不是已登记的本机项目。不能把云端 schedule 触发当作 Windows CLI/FFmpeg 已可执行。若继续使用原生 Codex 自动化，需要用户明确同意登记本项目和建立对应本机线程/heartbeat，并确认其目标、频率和执行范围；不需要新建 API 密钥、守护服务或 Windows 网络配置。此前对话“开始开发”未被解释成后台安装授权。

人工整理入库的 `editorial-zh` 来源标签也支持原四个域名的素材抓取；其他域名需要提供已核对的原文，不扩大网络权限。

本次官方 Library Windows 上传助手的应用桥在 prepare 阶段明确不可用。直接连接器的准备元数据可调用，但只得到待传输预约，未传输字节或 finalize，也未创建 Library 文件。六个工程文件仍留在本机，未绕过新建上传通道。已由视频任务归档的真正 Library 产物可以正常只读核对和登记。

发布不包含 D1 迁移，也不恢复数据库快照。代码回滚到原已保存 v10/v8 即可，保留全部生产记录。
# Latest runtime acceptance, 2026-10-10

Native Library create/materialize work on this Windows task. Process-only NTFS long-path metadata handling fixes exact-byte handoff without OS settings. Standalone CLI still needs native-agent handoff and manual initial start; wake is unconnected. Promo uses existing gpt-5.6-sol, immutable receipts and three-call per-binding limit; human versions remain preferred. PRODUCTION_NATIVE_TARGET.md lists actual acceptance and skill/renderer gaps. No full creative six-node pass/listening claimed.



## v15 acceptance update, 2026-10-10

The complete official 38-file d0 freeze is now verified and used in actual generation and independent review. One actual title-metadata rejection, bounded rework and source approval passed; the new script waits on human. The generic normal adapter completed a full 53-second existing-archive render, pause/recovery, native Library upload and video callback, with all QA limitations retained. The new-script matching voice/caption timeline and listening remain unavailable/human-gated. No production data migration or scheduling occurred. See [PRODUCTION_V15_ACCEPTANCE.md](./PRODUCTION_V15_ACCEPTANCE.md) for exact evidence, old-job preservation and current boundaries. This supersedes the former missing-skill/native-upload statements, without claiming a new-topic finished creative video.
