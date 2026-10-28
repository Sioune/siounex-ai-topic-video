> 已完成选题的换声、节奏、字幕与片尾迭代，按 [成品版本回传与归档](./PRODUCTION_APPROVED_NATIVE_VERSION.md) 完成新版文件、实际认可和六项交付回传。当前里程碑扩展见 [PRODUCTION_MILESTONES.md](./PRODUCTION_MILESTONES.md)，系列参数见 [PRODUCTION_SERIES.md](./PRODUCTION_SERIES.md)。下文保留原v7协议及兼容说明；两种模式、预算、异常决定与新版节点审核以增量文档为准。

# 可审第一版：真实任务与成果

MiniCPM 当前v2的真实原生导出、站内私有R2及待本人审核兼容入口见 [待审核原生文件回传](./PRODUCTION_PENDING_NATIVE_SITE.md)。它保留旧Library与打回记录，不使用已获认可成品的APV路径，也不把文件存储当作成片批准。

继续使用同一 owner-only Site / project。新增4张 production_* 表；原 topics/favorites/dispositions/source_status/app_state 和 DAILY_UPDATE.md 每日 ingest 不变。

`确定制作`创建永久唯一 topic 任务，保存原文记录与 make-siounex-videos 主技能全文快照、SHA256、请求范围。已制作/否决条目拒绝新生成；重复点击返回原任务。测试任务单独标注，不改旧题个人标记。

## 实际执行与身份

`POST /api/executor` 在已有 owner-private Sites dispatch 边界内接收共享生产任务协议。沿用平台既有服务 access header，既不伪造 visitor 身份，也不访问个人收藏/否决。浏览器请求须同源真实登录。服务 token 只放本次隐藏 stdin，不写任何文件、网站前端、命令参数、提示词或日志。不设置新秘密或长期 token。

支持 action `read`, `claim`, `heartbeat`, `checkpoint`, `submit`, `fail`, `test_create`, `stage_result`。实际执行器需**人工启动**，网站不能调用当前 Codex 会话工具、订阅或反向唤醒 MCP。未启用长期进程、第三方触发器、定时轮询、MCP 插件安装或额外权限。

本地单任务执行：`node scripts/production-executor.mjs`，看到隐藏 stdin 提示后输入一次 JSON：`{token,job_id,draft_file,source_file,submission_id}`。输入材料必须是当前 Windows 实际存在且已核读的文件。source_file SHA256 与 evidence 对应，skill_hash 对应快照；脚本再绑定站上原题快照哈希，真实领单、保存核验检查点、回传审稿草稿。脚本不生成媒体或收费，不假称模型自动生成；本版标签为 operator-assisted。

CLI 兼容性已单独实跑：现有 Windows Codex CLI 0.153.2、ChatGPT 登录、刷新模型目录后选择 `gpt-5.6-sol`，一次受控文本生成退出0并保存结构化草稿。默认 `gpt-6.1-sol` 在该 CLI 账号下拒绝，未切换供应商或 API 计费。

`node scripts/production-codex-executor.mjs` 是参考 StarForge Kernel Codex adapter 的真实单任务桥，隐藏 stdin 参数为 `{token,job_id,source_file,source_url,submission_id}`。它核对本地材料和冻结快照，实际领单，调用既有 CLI，续租，保存输入/输出哈希及执行收据，写检查点并回传不可覆盖的稿件版本。成功的 CLI 输出在本机缓存，重试先检查既有提交与收据，不重复生成。它只运行一次并退出；网站点击目前不能唤醒本机，仍需人工启动，身份或触发缺口如实显示“待执行”。详见 KERNEL_BRIDGE_REFERENCE.md。

## 租约与恢复

claim 原子获得10分钟租约；仅返回一次明文 token，数据库只保存哈希。并发领单最多一位胜出。heartbeat续租，checkpoint使用checkpoint_version compare-and-swap。逾期原子重领保留检查点，旧租约禁止写。失败不自动循环领单，浏览器恢复按钮使任务回到待执行。

submit 带稳定submission_id、base_revision与完整来源/素材/限制/口播稿；事务写不可变草稿和状态。相同提交重放返回既有成果，不覆盖；请求结果不明先读回，不能重跑模型或外部收费服务。来源证据必须包含本题原文URL、实际读取日期与本地快照哈希；提交也绑定技能/原题快照。

`POST /api/production` 浏览器同源身份操作：create/retry/review/stage。审稿批准或退回同时校验revision与content_hash；退回保留旧稿，再人工执行产生新稿。草稿审阅不改“已制作”。没有视频时不能显示已产成片。

## 后续真实接口与费用边界

cover/video/promotion 请求必须绑定已批准版本。请求写入production_stages，显示blocked_executor，不假进度、不发起收费或公开发布。`stage_result`只接受绑定批准版本的零新增费用外部HTTPS成果、provider_job_id、SHA256，状态result_reported表示外部报告待用户打开核验，并非服务端已渲染或验真。重复回调不覆盖；哈希与URL由执行器声明，UI明确尚待核验。禁止付费结果回调，未启用付费适配器，所以重试不可能重复扣费。不得把此限制冒称已接全自动。

下一步若要无人值守：先选择本机前台单次CLI或独立执行机，证明来源读取/CLI身份可用，再给出长期凭证最小权限、租约心跳、凭证存储、可撤销方式及成本上限的具体方案，等待用户批准；当前不启用任何此类配置。渲染须在外部执行机，不在128MB网页Worker。

## 技能恢复限制

主技能按云资源精确快照保存，未安装为用户全局本地技能。云 references/production.md 当前读取失败，本地同名技能未找到；本版只执行主技能已写明的核验与大白话文字稿范围。完整数字人/封面/片尾阶段须恢复引用规范、品牌资产、账户与授权，并重新核验，不能将本版当作其已接通证明。


## 2026-10-11 bounded foreground sessions and factual projections

Use production-session-executor.mjs for one explicit finite start (default15min, hard1–1800sec/16steps). Heartbeat15sec, server presence TTL45sec, atomic8slot cap and one current session per executor ID. Drain in-flight heartbeat before stopped. Selection is reused once; original lease/CAS governs ownership. Stop owned workflow/CLI child tree on deadline; retain PID/start/deadline/exit receipt, and never interpret timeout as failure eligible for blind generation. Truncated/empty JSON is EXECUTOR_RESULT_UNKNOWN; reconcile immutable started/receipt before retry. Declared capabilities are text/review; unsupported media requires exact existing input root and native Library handoff. No wake daemon or persistent credential was installed. Script approval, exact-file oral video approval, archive and external publication stay separate. Real v30 API checks and process-tree timeout are documented in CLOSURE_ACCEPTANCE.md.
