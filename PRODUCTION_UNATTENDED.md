# 自动执行范围与边界（2026-10-12）

已交审 PixVerse V3 保持原状：视频产物2待人工审核，Library原片/播放副本均v1。此次不重新领取、改片、渲染或审核它。

## 这次本片的手动接力

站内范围确认与source/script批准之后，本次工作会话准备了真实原片、普通审阅声音、字幕和精确媒体时轴；人工启动了有限 Node 渲染程序，并通过当前对话可用的原生 Library 保存/替换工具完成归档。当前会话将确切Library身份与结果通过隐藏stdin交回运行器，再写入私有播放器。字幕质量问题由实际关键帧检查发现并修正。这不是现有15分钟任务独立完成的整条成片链。

## 现有计划任务的实际情况

Windows `SiounexTopicProduction-Task4` 已启用，PT15M、IgnoreNew、Interactive登录、WakeToRun=false；入口为本checkout的 `scripts/native-scheduled-worker.mjs`。此次只读核验，没有新建或改动计划任务、账户、凭据、服务和网络配置。

原脚本的媒体分支返回 `native-media-handoff-required`，不会启动媒体执行。准备检查也会因没有实际本地ready清单、真实媒体时轴或原生归档接力而阻断。15分钟唤醒本身不会补出这些能力。

实际只读CLI诊断：`gpt-5.6-sol`能调用Sites；同一CLI工具环境未暴露Library `create_library_file`，不能上传本机文件。隔离130字节TEST探测未得到成功归档回执，保留started/失败记录，不盲目重传。当前对话可用的上传工具不等于定时CLI可用。官方MCP说明也区分主机MCP与Hosted plugin能力：[官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。不以新长期凭据、额外MCP服务或扩大权限填补此缺口。

## 本轮代码收敛

- 自动媒体执行模块串起同一操作领取/租约、真实渲染、技术QA、原生Library回执、私有分片上传、结果回传；保留人工作品质量审核。
- 当前真实生产仍在领取前阻断Library缺口，写入版本/输入绑定的 `executor_media_blocked` 审计回执；重复轮询复用同一记录，不产生重复任务或审核批准。
- 只有当前已授权queued操作和全部SHA匹配的本地输入清单可执行；`registerAuthorizedInputs`供实际准备者登记，不猜测素材、声音、字幕或时轴，不创建任务或新授权。
- Native Library成功结果即时保存身份以便断线恢复；不记录token/签名URL。未知上传结果不自动重试。Windows xattr失败如实记录，不把云端已保存文件重传成新版本。
- 恢复只选择过期租约且有local-files-ready检查点的原操作；检查本机完整文件回执和SHA，绝不重新渲染。归档失败暂停并保留文件；用户明确恢复后接原回执。回传断线先查已存结果，不再归档。
- 已归档结果可通过现有Sites访问恢复回传；不要求重新生成。当前Library阻断不会妨碍独立的已授权文本任务。
- 多文件归档需要官方prepared批次；当前未接通时准确阻断，不绕过协议。私有站15MB单文件/50MB总量保护保留。

## 验收与下一真实任务

`unattended-media.test.mjs`隔离合同测试：并发只一赢家、完成重放、归档失败/人工恢复不重渲染、回传断线、文件改变即停、Native已存结果的进程失败恢复、未知上传禁止重试。

`executor-media-block.test.mjs`实际隔离SQLite：阻断回执幂等、不领取/不改状态、仅过期已知文件恢复被选择；运行中/未知/完成/待人审排除。以上使用明确合成回执，不冒充真实视频或真实Library归档。

18:58:38–18:59:18 UTC现有任务自然空队列回合：`completed=true, blocked=false, outcome=idle, new_fee=false`；没有手动触发新的生产任务。18:43回合未取得Native Site回执，失败亦保留，不能声称每轮保证成功。

下一真实制作任务还需站内当前授权、真实可用输入与媒体准备清单，并在定时运行环境中提供现有Library本地文件归档能力。接通后需真实验证一次归档→私有播放→结果回传；当前不具备这项验收，不声称网站全流程无人值守成熟。自动技术QA不等于看过/听过，也不等于质量批准、付费授权或公开发布。
