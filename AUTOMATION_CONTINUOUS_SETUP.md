# 持续执行的实际配置

用户已批准Windows/task-4/既有账号和私有站，每15分钟、单次最多10分钟；只执行已授权节点，人工审核、缺媒体或新费用时停止，不发布。无需重复询问相同配置。

已注册当前用户的Windows任务SiounexTopicProduction-Task4。Limited、InteractiveToken、不保存密码、忽略重叠运行、最长PT10M、每PT15M检查。真正的项目绑定是操作WorkingDirectory及脚本对.openai/hosting.json的项目ID校验；没有伪造App本地projectId。电脑须保持登录与联网；未配置硬件唤醒或管理员服务。

原生Sites工具在每个新CLI会话取得现有短期授权，仅RAM与隐藏stdin传递。不得新建持久凭证、改变共享或调用新增付费媒体。冻结的ready.json必须匹配任务revision、mode_epoch与contract_hash，原站反馈ID、文本hash与来源稿件hash从站上读取。保护中的Claude任务永不领取，测试任务不进入生产扫描。

纯文字预稿及真实反馈返工允许在视频素材待补时执行，回传后停在人审。AI实用的连续实际操作证据只约束媒体计划、领取与视频审核：源文件、全量解码、帧像素hash及动作结果须核验；静态图片不冒充操作录像。

媒体执行仍有真实能力缺口：目前定时CLI没有原生Library工具，两个独立只读探针已证实，不能用手动上传冒充定时归档。每次原生媒体接力前必须先证明当次Library能力，否则不领取、不渲染。未来接通时需原生上传实际文件、下载核对SHA并在同一lease完成回传；未知结果先恢复已有回执，禁止重渲染。

07:53及08:08 UTC真实时钟触发均未进入Node。只读诊断确认Windows PowerShell为Restricted；任务改用隐藏inline Node命令，未修改系统执行策略。08:13:37 UTC为修复后首次独立时钟触发。实际证据见.sites-runtime/periodic-runs，任务启用本身不作为成功执行证据。

停用：Windows任务计划程序中禁用SiounexTopicProduction-Task4。保留任务与历史供恢复；不停止其他任务。原有两条暂停Codex任务保持暂停。
