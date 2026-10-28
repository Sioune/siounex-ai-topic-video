# 本机 Scheduled：只读入口核验与隔离测试规格

截至本次检查：没有创建、启用或更新任何 Scheduled/heartbeat，没有写内部配置，没有新密钥。两条旧暂停任务保持原状。

## 可用工具与当前实际阻碍

当前工具声明提供 `mcp__codex_app__automation_update` 的本机独立 cron 分支：

```json
{
  "mode": "create",
  "kind": "cron",
  "destination": "local",
  "executionEnvironment": "local",
  "name": "选题工作台隔离闭环测试",
  "projectId": "必须是list_projects真实返回的本目录项目ID",
  "model": "gpt-5.6-sol",
  "reasoningEffort": "medium",
  "prompt": "下面的隔离测试提示词",
  "status": "PAUSED"
}
```

还有必填的内部计划参数 `rrule`，只在用户确定频率/一次运行时间后由原生工具设置。此文档不是创建调用；未虚构项目ID或保存计划。

`list_projects` 实际成功，当前目录 `C:\Users\赵元章\Documents\Codex\2026-10-10\task-4` 未列在本机项目中。cron 可以绑定 projectId，不能绑定 threadId；projectId:null 的无项目任务不能声称已经绑定这个 checkout。

`list_threads` 当前委派任务为 `01a12437-c2d2-7183-9870-e9ab5492d011`，hostId 是 durable、projectId 是 null。对旧任务仅调用 mode:view，两次都真实返回 `Automations are only supported for local threads.`。因此工具声明可见不等于此委派线程能够创建本机任务。

浏览器/电脑界面此前初始化报缺少 Windows 平台目录 HRESULT 0x80070003，本次没有用脚本、内部配置或不受支持的私有协议绕过它。

最小人工设置：从 Codex App 的真正本机线程进入，将上述现有文件夹加入本机项目，确认 list_projects 返回其项目ID；然后在 Scheduled 创建独立本机任务并选择该项目。具体按钮名未读取界面，不作虚构。先暂停保存，获得持续授权后启用；不要更改两条旧 heartbeat。电脑开机、App运行、此目录可访问是前提。网站决定仍需轮询，没有审批事件直接唤起本机的入口。

## 实际可执行入口

`node scripts/scheduled-smoke-runner.mjs` 从隐藏stdin接收 JSON，mode:prepare 只读既有隔离任务、创建带 TEST 标识的900×1200 PNG与不可变 plan/binding。Site bearer 只由当次原生 get_site 在内存提供，不写文件，不传命令行。

固定隔离任务：`job_bd438d06-8d99-4b28-b594-b86fa5f58d08`。必须仍为 is_test=1、人工模式、awaiting_review，并存在当前 draft；否则停止，不能回退到真实任务或创建新任务绕过预算。当前准备使用 run_id:scheduled-smoke-v1；重复准备不覆盖输入。

实际媒体 runner 是既有 `node scripts/production-media-executor.mjs`，接收 preparation 返回的 runner_input_without_token 加当次RAM token。它只领取 test_only 的零费用 cover 操作、用本机既有 FFmpeg处理测试PNG，并在本进程内等待原生Library交接。没有模型、语音或视频付费生成。这个步骤此时未启动。

完成输入通过 `node scripts/scheduled-smoke-runner.mjs` 的 mode:completion 构造，必须先有实际渲染 receipt、当次原生Library结果及下载文件。native_proof_file 必须位于 `.sites-runtime/scheduled-smoke/scheduled-smoke-v1/`，格式：

```json
{
  "source":"native-library-response",
  "files":[{
    "role":"cover",
    "library_file_id":"复制实际原生返回值",
    "file_id":"复制实际原生返回值",
    "version":0,
    "sha256":"实际字节哈希",
    "downloaded_file":"该run目录中的实际原生下载文件"
  }]
}
```

参数示意不是原生调用成功证据。测试代理必须调用 Library创建/读取/准备下载工具并保存真实输出，禁止手工填造ID。completion 会比较本机输出、下载字节、哈希、尺寸和版本绑定，返回 `{result:...}`；将该JSON送回原来仍持有lease的媒体runner隐藏stdin，不能保存或复制造成两个lease。

## 一次隔离测试验收

1. 定时触发的**新代理**报告当前实际工作目录、工具名与版本。至少真实只读调用 get_site 和 Library读操作，确认当次具备原生工具；不能用当前交互代理的能力冒充定时代理。
2. 准备固定 TEST 输入。检查真实生产任务及保护中的 Claude job 快照。执行仅此 test_only 操作，重复触发应选相同 input_hash/operation，不新增调用。
3. 在仍持有lease的媒体runner暂停等待期间，由定时代理真实上传输出到Library，再用原生下载通路取回当次文件，核对字节SHA。上传未知时查原生状态，不盲重建。
4. completion生成精确结果并回调；只读重新读取操作，必须 completed、真实Library文件可下载、SHA一致、cost0、publicationfalse。job的人工批准、revision、mode、真实里程碑不能被工程测试推进。
5. 保存不可变 completion 结果，重复回调得到相同操作与结果；不重复渲染、不重复上传。若断线，按原invocation、保存回执和已有Native文件恢复；未知结果暂停，不新建操作代替。
6. 验证停止和lease、线程/App重启条件。整个测试不给真实选题增加稿件、审批、媒体费用或外部发布。测试应增加至多一个明确 test_only操作和一个TEST Library文件，保留历史。

## 给新定时代理的提示词草案

在本机注册的选题工作台项目内执行一次隔离能力闭环测试。先读 SCHEDULED_SMOKE_SPEC.md，核对现有网站与隔离任务。仅用既有Sites与Library原生连接，授权只在本次内存传递。运行scheduled-smoke-runner的prepare，再用既有production-media-executor处理返回的test_only封面操作；从原生Library上传实际输出、下载并核对字节，completion构造回执回传原持lease进程。记录定时代理本次实际拥有的工具和工作目录。没有连接、输入变化、费用要求或未知结果时停止并报告，不新增凭证、不安装服务、不改共享、不运行真实选题、不更改两个旧暂停任务，不调用模型或任何付费媒体生成，不发布。完成后保留操作与Native证据，禁止假定全生产自动化已接通。

持续生产轮询是另一个授权范围；需先通过上述**定时代理实际触发**测试，再确认频率、每次时限、费用上限、人工门槛与撤销方式。当前只准备，未创建或执行计划。
