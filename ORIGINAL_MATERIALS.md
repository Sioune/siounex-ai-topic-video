# 本人原创材料

`/originals` 与 `/api/originals` 是本人原创产品说明及报道草稿入口，使用现有 ChatGPT 身份与同源 JSON 写入校验。它不属于外部新闻导入或多来源研究，不变更 Sites 的 owner-only 策略。

保存原文时同时建立一个普通可收藏、可排除的选题；不会建立制作任务、调用模型、生成媒体或改变发布计划。公开发布日期始终保留未知；说明日期另存。功能说明、待核功能、已核内容和原稿历史说明分别展示。

完整原文保留原字符串与 SHA-256，后续不可覆盖。草稿编辑新增版本；选题 ID 不变。每次提交有本人范围内的幂等回执，完整原文哈希另作本人范围去重。相同原文但未保存的新草稿返回 409 并保留输入，要求在已有记录另存版本。

数据使用现有 `app_state` 的 `owner_original_v1:`、`owner_original_version_v1:`、`owner_original_topic_v1:` 和 `owner_original_request_v1:` 命名空间；无需迁移或重置既有表。外部采集与导入不能覆盖原创选题。后续明确建立制作任务时冻结原文、草稿和核验边界，既有任务不会被新版本改写。

验证：新增原创流程 12 项、原创 UI 4 项、原创来源包 4 项通过；相关来源与研究 UI 回归 66 项通过，TypeScript 和 Worker 构建通过。研究合约与流程回归 45 项中 44 项通过；剩余 `research-flow.test.mjs` 的 finite-dispatch 用例在隔离 v250 基线同样因本机缺少其预设 Codex CLI 路径触发 `CONTENT_SUPPORT_SEARCH_RECONCILIATION_REQUIRED`，未更改该保护或扩大本次修复。
