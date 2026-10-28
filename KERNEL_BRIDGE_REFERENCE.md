# Starforge Kernel 复用依据

只读核对授权私有仓 `Sioune/starforge-kernel`，未改其运行实例、代码或凭证。

核对的真实源码：`src/providers/adapters/codex-agent.ts` blob SHA `2e965f297c1e206893194fbd45db6ed515fc849f`；`src/engine/runner.ts` blob SHA `00047e3bc25c1611bdc24dd8d54f7d955798ce29`。

Kernel 的文本适配器调用现有 Codex SDK/CLI 登录，每任务独立 Thread、只读沙箱、关闭网络、结构化 outputSchema、取消信号；返回真实 finalResponse、thread id、usage，不把文本通道冒充媒体 API。runner 保存输入/供应商快照与幂等键；取得远程任务 ID 后走恢复/轮询，避免重复提交。

本版参考同一模式：站点负责D1唯一任务与审稿记录，本机单次执行器负责真实CLI文字生成，结构化成果回传。已有CLI 0.153.2刷新目录没有gpt-6.1-sol，明确支持gpt-5.6-sol；后者已成功完成受控预检。`scripts/production-codex-executor.mjs`再按站上真实任务领单、核对来源/技能快照、生成独立CLI任务、存真实执行receipt与输出哈希、按提交ID回传；失败恢复优先复用已完成CLI输出。当前调用CLI而未新增SDK依赖，使用既有登录，不复制Kernel数据库或秘密。

与Kernel的本机常驻server不同，当前未启用任何长期worker。需要人工启动单次执行器；网站不反向唤醒当前Codex会话，也未连接图像/视频/宣发供应商。付费媒体与公开发布仍未授权。
