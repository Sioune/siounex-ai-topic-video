# 本机媒体适配与恢复（v9）

同一私有站新增 `production_operations` 一张表。0005仅建表/索引；旧九表的每个历史字段在迁移回归中逐行相等。现有Claude本人声任务不交给本适配器；执行器硬性拒绝该job，保持人工节点模式和原稿、声轨及历史。

## 实际能力

- `provided-cover`：接收已经存在的3:4图片，验证输入SHA256、像素比例，实际解码为PNG。`milestone-cli.mjs`通过现有登录Codex CLI的 `--image` 审核这张精确图片；四项理由包含可见元素和冻结原文/技能短证据。元数据、文件名不能冒充看图。
- `local-full-view-video`：接收连续原片和已经获授权的完整音轨，FFmpeg保留原片全视角、等比缩放到720×1280竖屏。检查时长、音轨存在、全片解码、峰值低于0dBFS，不循环、不冻结、不截断音尾。产生真实成片、首帧、90帧/3秒预览和原音轨回执。源片有声音时，必须明确同意使用提供的完整音轨；授权字段不是听感批准。
- `provided-promotion`：接收已有真实宣发文本文件并验证哈希。不会自动写成“已发布”。
- Windows普通系统声音只可用于 `is_test` 工程验收。生产只用已有获授权音轨；不会用普通声音替代本人、克隆声音或新调付费服务。本适配器没有本人声音生成接头；原视频任务的既有本人声文件可复用，但不再生成。

这些是已有文件的真实适配，不是远程图像/视频生成。已冻结的完整制作技能更新到视频任务的2da7073版本；旧eb015快照保存于revisions，已有job快照不迁移。

## 一次有限启动

在工作副本运行 `node scripts/production-media-executor.mjs`，向隐藏stdin传入：

```json
{"token":"<仅本次已有Sites凭证>","job_id":"<当前任务>","node":"cover","base_artifact_version":0,"plan_file":"<本机清单JSON>","input_root":"<仅含授权素材的目录>"}
```

清单例子（输入必须真实存在，哈希来自实际字节）：

```json
{"adapter":"provided-cover","cost":0,"authorization_reference":"已有文件授权依据","inputs":[{"role":"cover","file":"cover.png","sha256":"<64位真实SHA256>"}]}
```

视频清单使用adapter `local-full-view-video`，输入角色 `source_video`、`voice`，`voice_mode:"provided-authorized-audio"`、`voice_authorization`、`duration`（3–120秒）。源片包含音轨时还需 `source_audio_policy:"use-provided-complete-audio"`。宣发使用adapter `provided-promotion`，角色 `promotion`。

进程一次领取精确操作，保存真实文件回执和服务器检查点，并在内存中保留租约等待现有Codex会话归档。归档后第二次隐藏stdin传入 `{result}`，其中包含 `input_hash`、`cost:0`、`publication:false`、实际 `receipt`、`artifact`及全部 `assets`。每个asset的role/sha256必须对应回执文件，并有真实Library标识和版本。封面/视频artifact提供对应SHA256、HTTPS下载地址、provider_job_id、cost及Library标识；宣发artifact提供真实text/limits。未归档不能把本机路径当网站可下载成果。

有限进程最多等待8分钟；没有持续服务或Windows安全配置修改。节点模式回传后等待人通过；总自动模式封面回传后可再次启动文本/看图审核执行器，成片回传后会明确暂停，要求人工视听决定。尚未实现网站自行唤醒本机，也没有一个无人接力的媒体归档/整链启动器。网页“保存请求”只保存请求。

## 重复、异常与恢复

同job/节点/稿件/基础产物版本/清单哈希得到同一操作ID；重复点击复用；不同清单的活跃操作互斥，同job实际媒体执行只允许一个租约。最多六个媒体操作，恢复不重置预算。领取和检查点是CAS；模式/稿件/前序批准或产物版本变化会拒绝旧操作。

完成前先保存prepared结果，再交回节点，最后completed。崩溃后的同回执可完成剩余回传；完成结果不可覆写。执行器的started标记但无完成回执会停止，禁止自动重新生成。已经完整完成的本机文件逐个核对哈希后复用。

暂停操作只能由真实同源登录owner记录决定：核对完整文件回执后恢复接力，或结束操作保留历史。没有完整回执的未知执行不允许恢复重跑；先核对日志再明确结束。恢复按钮不批准质量、不重置预算、不收新费。审阅/执行凭证只进stdin和进程内存，不写清单、日志或源代码。

## 当前明确缺口

此次现有Library批量上传助手在prepare阶段明确返回不可用，六个工程测试文件仅保存在本机；未切换另一写路径、未宣称上传成功。生产归档需可用的既有Library连接接力。已有Claude真人声成片的Library版本通过只读工具核对，delivery_result元数据登记成功。

实际看图已接通；声音理解、连续画面质量没有可靠自动适配器。技术解码及静音标记不等于听过、全程理解或最终质量通过。AI质量批准不授权发布、充值、换套餐、建立持久凭证、系统任务、守护服务或隧道。

后续唤醒建议优先采用Codex原生计划任务/线程follow-up，而不是持久API密钥或自建守护进程。需先确认本项目的原生计划执行宿主/项目登记与可用Library接力，并由用户批准具体启用；本次未新建计划任务，也未把云端轮询说成本机已唤醒。

## 回滚

v8版本：`appgprj_6ac65bafa2a48191a4283cb34ebd5e11~appgver_2a4cca3317ac8191b51e049f28c514d5`。重新部署已保存v8即可撤回新增代码；保留0005表和所有账本/审核历史，不执行逆迁移，不替换D1快照。
# Latest feedback and evidence, 2026-10-10

Website cover/video/promotion rework requires feedback and continues only the rejected node with original counters/hashes/history, without approving old output. Actual cover pixels were independently returned then a new exact-byte native Library operation tested. Promo has human/AI/import versions and saved downloads. Data-center uploads retain original screenshots and truthful observations. No platform scraping/fabricated metrics. PRODUCTION_NATIVE_TARGET.md records concrete evidence/recovery targets/full-skill gap/prepared-case renderer limits.



## v15 acceptance update, 2026-10-10

The complete official 38-file d0 freeze is now verified and used in actual generation and independent review. One actual title-metadata rejection, bounded rework and source approval passed; the new script waits on human. The generic normal adapter completed a full 53-second existing-archive render, pause/recovery, native Library upload and video callback, with all QA limitations retained. The new-script matching voice/caption timeline and listening remain unavailable/human-gated. No production data migration or scheduling occurred. See [PRODUCTION_V15_ACCEPTANCE.md](./PRODUCTION_V15_ACCEPTANCE.md) for exact evidence, old-job preservation and current boundaries. This supersedes the former missing-skill/native-upload statements, without claiming a new-topic finished creative video.
