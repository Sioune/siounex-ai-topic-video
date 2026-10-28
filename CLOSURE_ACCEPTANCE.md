# 2026-10-11 复盘验收与剩余边界

基线：原私有站 v29，提交 `9eb9e8a91e170910eaa1a6ddb9c27bfd60327f69`。不迁移数据库，不覆盖运行中的任务，不重复付费生成，不变更共享。可回滚到该保存版本；回滚代码不撤销已追加的真实文件回执。

## 已实际完成的回填

原 Decision-1 job `job_6f01090e-218f-4fc9-bd1c-14984d6c1863` 追加 V7 历史与 V8 当前候选档案。V8 为用户口头确认通过的确切文件；不是网站审批按钮事件，不改变正式稿件 V3，也不批准外部发布。

固定 V8 文件 SHA256：`e745d90db99a40f53c949972a9ee337bd685ede7d6a9b0c4eed97782f85adadf`。最终完整 ZIP 为 Library `libfile_ba307594b1c88191a76e8bceb5e6c18e` / V1 / `file_0000000063f4823090668824cc7ede92`，6,719,779 字节，SHA256 `3868178c84ec68f9d3030eadaad18f9a31a725f11d5399ba420c1d5e795ab430`。

13 个网站固定版本下载已实际回读，SHA256 全部一致；网站回读 ZIP 六个成员 CRC 通过。ZIP 只有一个 V8 视频、精确 V3 双封面、去掉内部状态尾注的宣发正文、说明和哈希清单。原宣发 V3 原始文件仍可单独下载。V3 双封面的新画面审核仍待本人确认。

正式 job status/revision/approved_revision/approved_hash/review_mode/mode_epoch/attempt/reworks/ai_calls/milestones/operations/drafts 均未改变；旧 review 未改变；原五张表所有原有行保留，表仍为16张。旧 cover/video 操作的 `Unexpected end of JSON input` 暂停记录未伪装成新 V8 的执行。

本机证据（忽略目录，不提交文件或凭证）：`.sites-runtime/decision-v6-phone/rework-v8/website-acceptance.json`、前后数据库快照、网站回读 ZIP、`.sites-runtime/closure-logical-live-proof.json`、`.sites-runtime/closure-live-qa-proof.json`。

## 本次流程变更

- 页面分别显示稿件批准、候选成片、本人对确切视频的口头确认、文件归档、完整 ZIP 和发布记录。审批不能变成发布授权。
- app_state 记录有限前台执行器的 session、能力、阶段和心跳；45秒失效后离线。同名在线 session 不允许被另一会话接管。不保存凭证，不新增表。
- 一次手动启动 `scripts/production-session-executor.mjs` 可以在1–1800秒窗口内轮询并等待人工决定后继续文字/审核流程，最多16步；声明真实能力仅 text/review。选择结果沿用一次读取，后续领取仍用原有 CAS。媒体缺少明确输入/原生 Library 交接时停止并给出原因。
- 前台 deadline 到期停止自身启动的工作流子进程树，异常结果需要先核对不可变 started/receipt，禁止盲目重复。已实际启动隔离 Node 子进程及其子进程，超时停止后两 PID 均已退出，保存 PID/开始/截止/退出回执；没有停止其他任务。该实测未调用真实模型。
- 截断/空 JSON 回调明确为结果未知，保留 HTTP 状态；不自动重试，不输出服务器完整对象或凭证。
- 反馈生成只采用本任务冻结上下文、来源版本/哈希和原始意见，移除将 Decision-1 内容强加到其他选题的规则。
- 统计保留全部物理历史，界面使用逻辑作品及关系，并继承旧版本上的原样样本和证据。真实快照为4作品/7版本、3关系/6记录、4样本。三条关系都没有后续样本，差值为 null。缺少/无效时间、超窗口或逆序样本不产生 T24/T48 差值；合法负差保留为异常证据。

## 30项矩阵映射

“测试”指隔离 SQLite/HTTP 或合成协议夹具，不能等同真实模型、真实视频或浏览器验收。

| 项 | 现有机制 / 本次结果 | 验证范围与缺口 |
|---|---|---|
| A01 | production-facts 状态投影 | 单元测试；v30线上 API 回读通过 |
| A02 | private-publicity-files 固定版本档案 | V8/V3/ZIP 实际写入，13下载验证 |
| A03 | 不可变媒体 plan、input_hash、prepare receipt | 已有协议测试；所有新视觉要求仍需显式方案与人工画面审核 |
| A04 | 前台 presence / session | 真 SQLite + loopback HTTP 生命周期、8槽并发上限测试，v30线上在线/停止/并发唯一赢家回读；无人值守唤醒未接通 |
| A05 | claim/lease/CAS、selection 沿用 | 并发唯一赢家、重复提交、二次选取防护测试 |
| A06 | started/receipt、相同 invocation 恢复 | 断线回执与过期 lease 隔离测试；未知结果暂停 |
| A07 | 模型子进程超时、前台 deadline | 隔离 Windows Node 子进程树超时实测通过；实际模型本次未重调 |
| A08 | 六节点依赖、revision/hash/epoch | 隔离测试通过；不可审音视频交人工 |
| A09 | script-feedback 与 rework queue | 原意见ID/哈希、旧版拒绝、重复与断线测试；模型本次未新增调用 |
| A10 | component/frame/audio 固定输入、候选报告 | V8既有实际证据；所有未来视觉变化不能仅凭技术审核通过 |
| A11 | 替换媒体/模式 epoch 失效批准 | 隔离协议测试 |
| A12 | 原 Sites owner-only 边界 | audience 保留；无新增外访、令牌、付费或发布 |
| A13 | owner-v7 successful narration receipt | 已有 HeyGen connector 音频索引；不把单独钱包零余额当全渠道不可用 |
| A14 | candidate_script_sha256 独立于正式稿 | 精确233字旁白哈希记录，未静默改正式稿 |
| A15 | final-duration、全解码、输出哈希 | V8实际成片既有核验与下载回读；未生成新片 |
| A16 | human hearing gate / oral-file approval | 本人真实口头 V8 确认；工具本次没有人工听审 |
| A17 | unified project / preparation | 既有冻结参数渲染；旧付费素材没有重调 |
| A18 | 双封面固定3:4/4:3与品牌证据 | V3实际文件入库；新图仍待本人确认 |
| A19 | private chunks 与 fixed GET | 13文件实际 readback；最终 ZIP CRC通过；合成中断测试 |
| A20 | movie/Library/ZIP/archive 独立不可变回执 | 实际回填与下载；媒体工具交接尚非全自动 |
| A21 | 返回导航/responsive 既有实现 | 本次 CUA 启动因 Windows平台目录缺失失败；未宣称真机通过 |
| A22 | 真实桌面业务闭环 | 未通过：同一浏览器环境故障；后端隔离测试不替代此项 |
| A23 | observed_at 与窗口 | T+24:06保留24.1小时，缺项null，隔离测试 |
| A24 | relation baseline/followup | 实际三关系无后续故delta null；非法/超窗null、负差保留测试 |
| A25 | logicalData supersedes 与样本映射 | 实际快照4/7、3/6；不删除原记录 |
| A26 | typeComparison 独立指标 n/median/range | 隔离测试；没有伪造平台或样本 |
| A27 | metrics & evidence 单位分离 | 已有测试；recommendations 与 recommendation_views 独立 |
| A28 | publication 单独记录 | 完整包归档、AI批准不授权外部发布 |
| A29 | workflow checkpoints、媒体回执、未知费用限制 | 阶段时间索引仍不等于完整互斥活动分类，未知成本不能填免费 |
| A30 | 同输入 ChatCut 对照 | 尚未实测，不新增授权或假对照 |

## 真实触发闭环边界

Sites 云 schedule 与本机 Codex/FFmpeg不是同一个执行环境。当前工具没有“启动此 Windows checkout 的本地任务”入口；站内排队不等于进程启动。现有本机自动任务须核对状态和工作目录，不能通过新增凭证、守护服务、网络入口来暗中补齐。

下一步可授权的具体范围：使用现有本机 Codex 定时执行入口绑定本任务工作副本；只读取已授权队列，排除保护 job；使用 gpt-5.6-sol，单次有限运行，保留2次返工/8次AI审核/6次领取等上限；不新增媒体生成费或自动发布。必须先验证平台能安全提供 Site授权及原生 Library交接；未验证前不能宣称全流程无人值守。若平台仅支持持久 bearer 或新后台服务，应明确请求凭证保存位置、执行频率与撤销方式的授权，不能先装后报。

追加：站内v30实际 API 验收确认稿件/成片/档案/发布状态拆分与4/7、3/6统计；在线与停止状态可回读，冲突会话只有一个赢家；测试没有模型调用，前后所有生产/history行一致。最后小修增加并发8槽原子限制、在途心跳排空再停止、宣发CLI同样沿用有限子进程树保护。
