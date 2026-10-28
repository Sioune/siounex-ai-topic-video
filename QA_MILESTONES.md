# 2026-10-10 里程碑审核验收

源码在 task-4 独立 Git checkout，从线上v7提交43ef6a685a61b33b0efb199a93e25e6a877d7e68打开。没有修改task-2、其本地数据库、源码或视频执行进程。没有创建站点、改变共享、配置新凭证/守护服务/网络或新付费通道。

## 实际测试

| 验收 | 结果与范围 |
|---|---|
| 增量迁移 | 用实际SQLite执行所有SQL。先放入原五表、四张production表及人工批准v3/历史草稿/审稿/阶段样本，再执行0003/0004，逐字段核对旧数据保持一致。旧任务review_mode默认为node。没有复制生产数据库。 |
| 人工节点 | 实际SQL和本地Worker/D1 + 浏览器：来源通过才开放稿件；稿件打回保留旧版、写理由；刷新恢复。六节点的媒体/文案/交付顺序用明确虚构、标记测试的记录验证，不当作真实成片。 |
| 版本绑定 | 草稿新版本拒绝旧批准；已批准稿件可显式reopen并使后续批准失效；媒体产物新版本使旧/后续节点批准失效，旧内容和报告保留。 |
| 重复与并发 | SQL重放同submission_id不重复写、异内容拒绝；并发生成领取及AI审核领取只有一个胜者；同节点并发决定只记一次审核；真实本地Worker/API并发领取同样仅一胜者。 |
| 断线与预算 | Checkpoint CAS/过期租约接管/旧租约拒绝；审核同invocation_id恢复回执不增加预算；两轮返工后暂停；六次领取和八次AI预约上限拒绝额外调用；人工恢复不重置计数。 |
| 模式切换 | CAS拒绝旧mode_epoch；有效执行/审核租约中拒绝切换；浏览器点击模式按钮并刷新仍保留模式。 |
| 真实AI审核 | 已有登录CLI、gpt-5.6-sol真实调用。第一份虚构来源产物漏掉“三份文件上限”，AI实际打回；补齐的新版本实际批准。另一个虚构脚本编造视频上传、语音识别、商用授权与实测经历，AI实际打回并给出对应原因和证据。未调用媒体服务。 |
| 一次启动真实链 | 本地独立任务一次启动，CLI真实生成v1，AI因日期来源处理打回；生成v2，来源AI通过，稿件AI因表述/0–3秒节奏声音等要求打回；生成v3后证据引用装饰引号触发严格校验暂停。没有重调该已消费调用。随后修复引用边界规范化、JSON字符串解码与先存CLI执行回执，并用该保存输出离线核对四项精确证据全部匹配。此运行不宣称“最终口播/视频全链成功”。 |
| 媒体缺口 | 没有视听适配器的cover/video不能领取AI审核；自动模式文本通过后持久暂停待人工决定；零费用媒体报告只报告URL/哈希，不冒充已看/已听。 |
| 手机导航 | 已安装Playwright + Chromium headless，393×852手机模拟：详情滚动后返回、44px触控目标、历史Forward、制作页返回、无水平溢出、无pageerror。另有11组JSDOM/React真实导航事件与Radix Sheet DOM回归。没有声称测试实体手机、Safari原生手势。 |
| 构建与原功能 | TypeScript noEmit、Sites标准构建通过；production旧协议、feed、Chinese筛选回归分别执行。每日更新协议及原内容/收藏/否决代码保持不变。 |

实际本地输出在忽略的 `.sites-runtime/ai-acceptance/results.json`、`.sites-runtime/auto-final.json`、`.sites-runtime/reviews/`、`.sites-runtime/browser-qa/result.json`、`mobile-production.png`。这些只用于核验，不上传为现实选题成果或伪造成片。

## 可复现入口

- `node tests/production.test.mjs`
- `node tests/milestones.test.mjs`
- `node tests/review-evidence.test.mjs`
- `node tests/feed.test.mjs`、`node tests/chinese.test.mjs`
- `TOPIC_TEST_PACKAGE`指向已有jsdom测试依赖package.json后，运行`node scripts/test-navigation.mjs`。
- 本地Worker使用5194端口、独立本地D1和明确测试选题。`PLAYWRIGHT_PACKAGE`指向已有runtime node package.json，`PLAYWRIGHT_CHROMIUM_EXECUTABLE`指向已安装Chromium，`LOCAL_QA_TOPIC`传一个新本地测试选题ID，再运行`node tests/production-browser.test.mjs`。测试不删除旧数据，重复执行要创建新的隔离选题。
- `node scripts/acceptance-cli-review.mjs`是有真实模型调用的显式验收，不作为普通离线测试自动执行；它保存回执并复用已成功结果。

## 保留与回滚

原站owner-only且external_visitor_count=0。保留v7版本ID：`appgprj_6ac65bafa2a48191a4283cb34ebd5e11~appgver_959809dc460481918138d9c1518f0faa`。回滚只重新部署此已保存版本，不做向下迁移、不替换D1，新列/表保留供恢复。

Claude job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee 的v3已在对话中获准，但网站批准字段尚未登记。新增delivery_result只向原审核历史追加真实交付回执，保持人工模式、稿件/任务状态与批准字段，不重新制作。真实61.343333秒视频、封面、宣发及预览的Library身份/版本/哈希与制作任务交付清单绑定；视频与封面的当前Library版本通过只读元数据核对。声音未试听，最终剪辑完整浏览器播放未通过验证；不把技术解码当作视听批准。

sync_existing_approval仍只在真实登录、同源的人工端点执行，凭精确稿件版本/哈希与回执登记既有批准，然后开放封面→视频→宣发人工检查。服务执行器无此入口。本环境的原生浏览器工具不可用，不能冒充线上访客；因此需登录后点“用登录身份同步既有稿件批准记录”，这只登记已有口播批准，不是要求重新审稿或批准成片。实际SQLite验收使用明确虚构Library引用，验证回传不批准、不改模式/费用/执行次数，重复与旧哈希拒绝、错误owner拒绝、同步只一次及后续人工顺序。


## v9媒体适配补充

本文件的v8“文本通过后媒体不可执行/不可看图”限制已部分更新。新增已有文件的本机适配器和真实CLI图片审阅，详见PRODUCTION_MEDIA.md；声音理解、连续画面质量及自动唤醒仍有明确缺口。

v9真实验收记录：

- FFmpeg8.1.1本机产出工程测试cover/video/voice/first_frame/preview/promotion六个文件。成片720×1280、12.000秒，完整1280×720源画面以0.50625倍缩放显示，无循环、冻结或音尾截断；全片解码通过，峰值−13.4dBFS。三秒预览ffprobe为3.000000秒。未试听，未把这些技术检查记为质量批准。
- 既有CLI gpt-5.6-sol实际以`--image`检查精确PNG哈希2f0da0067863a23a3d8ef6d8b5c38e6dab8a47d9946c7428de1ce6223e587b2f，给出四项可见元素、理由和短证据后approve。该批准只属于虚构图片验收，不是生产选题。首轮输出证据引用冻结技能短句，严格验证器遗漏技能语料导致暂停；增加冻结技能语料后只离线复核原成功执行回执，没有再次调用模型。
- SQLite真实执行0005新增表，旧九张表逐行相等；操作计划并发去重、租约一胜者、检查点CAS、同invocation过期恢复、不可变完成回放、费用拒绝、模式/稿件活动保护、历史回执不能登记当前媒体均通过。
- 已暂停已知文件可由owner记录恢复决定，无回执的未知进程不能盲目恢复/变更清单重跑；并发恢复只有一个审计决定；明确结束保留文件与历史，预算不重置。
- 当前真实本地Worker + 已安装Chromium393×852手机模拟：并发领取一胜者、真实封面解码、实际本地签名模拟登录owner恢复、回传真实文件回执、重载恢复、技术测试不批准稿件/不创建真实媒体节点、返回选题库、无横向溢出/零pageerror通过。不是物理手机或Safari手势验收。
- Library批量helper在prepare阶段明确不可用；新六个工程文件没有上传，无不明写入重试或改用另一写路径。当前本人声成片的既有Library视频v4/预览v4/首帧v3/音轨v0完成只读身份核对和线上delivery_result登记；原job每一字段、稿件、历史逐项相等，只有追加回执，状态是主体认可、视觉精修待选。

可核验文件：`.sites-runtime/media-real-results.json`、`cover-ai-acceptance-result.json`、`media-ui-result.json`、`browser-qa/mobile-media.png`、`personal-delivery-response.json`。这些文件不是生产成果或新付费授权。没有完成无人启动、无人归档、自动视听批准整链测试。

线上补充：v9部署成功后，在唯一既有is_test job_bd438d06上完成cover/video/promotion三项真实本机操作的claim/checkpoint/complete；重复完成回执复用，所有原test job字段/历史逐项不变。Claude本人声job所有原字段、稿件、审核历史和node模式逐项不变，无新增操作。健康接口storage=ok，选题仍378（中文98/归档280）。工程文件只在本机，operations的test_only标识明确禁止推进真实节点。

Windows Node24管道子进程在已完成缓存分支强制process.exit时触发libuv句柄关闭断言。保留已完成封面回执后，用直接有限API/渲染器验证剩余video/promotion；没有盲目重新生成或付费。后续补丁改为自然关闭stdin结束，单独验证缓存命令正常退出且不再次制作/回传。核验结果位于`.sites-runtime/live-media-acceptance-result.json`和`finite-cache-result.json`。
