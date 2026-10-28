# 本人克隆旁白替换

独立于创作返工2/2。保留已批准原文、基础视频/Library版本、全部画面和原4秒品牌片尾；只更换正片旁白。当前指定既有HeyGen私有Starfish声音 e791e6e058f6459cbfb720cd95f24f87，名称Siounex口播；本轮已通过连接器只读列表重新确认，无新克隆、无生成。

入口在制作任务的真实视频播放器下方，锚点 `#voice-replacement`。点「预览本人克隆旁白替换」，明确选择是否认可基础画面，勾选使用本人既有声音/保持版本/仅核费，点「提交换声申请，先核验费用」。这一步只写真实费用核验申请，不消耗生成额度。

账户支付边界需来自当前HeyGen账户/指定声音，保存证据哈希和有效期。当前连接器有get_current_user；Free返回的credits=null符合免费次数配额口径，不等于余额0。已有原生create_speech成功历史。官方免费方案不使用credits，自动补充为Business能力；独立API采用另行购买的预付credits，不将其价格或余额覆盖原生连接器。

允许以当前Free账号+固定Starfish音色+工具参数+官方计费来源记录 `payment_boundary.kind=existing-account-only`：新增支付上限0，不开通/升级、不充值、不转独立API；具体生成成本和配额扣减均为null，不能声称消耗0。此回执是可执行的支付权限边界，不是提供方逐次价格报价。权益不足、要求购买或结果未知时暂停，禁止付费补救及盲目重试。用户必须在本站确认这项边界后才能排队；不代确认。新支付不能确认/约束时仍禁止生成。新增费用须有实际价目与明确授权上限。

原生执行前的voice_checkpoint必须带provider_tool=heygen_create_speech、payment_quote_id、existing_account_only=true、billing_mutations_allowed=false、api_fallback_allowed=false。结果payment_scope需保留同quote_id、connected-heygen、new_payment=0及upgrade/recharge/API fallback三个false。结果cost字段在此边界下只表示新增支付，provider_usage_cost与credit_debit独立保留真实回执或null；不把未知总成本写成0。

证据来源：[Free套餐与补充机制](https://help.heygen.com/en/articles/15125761-heygen-credit-based-pricing-plans-subscriptions-explained)、[独立API预付机制](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained)、[原生ChatGPT通道](https://www.heygen.com/chatgpt-app)。当前账户/音色实际响应哈希绑定在每项回执；Free状态或音色变化不得复用过期边界。

后端真实状态链：cost_check_pending → cost_check_blocked 或 awaiting_fee_confirmation → 本人确认 queued → 单赢家voice_claim → 检查点 → 真实声音/Library/保持画面证明/≤60秒检查 → 新视频产物版本 awaiting_human → 本人通过换声版。未知调用或超时暂停，不盲目重调TTS。voice_recover只恢复同调用、已存回执的过期租约；已有结果重复回传幂等。

结果必须固定全文/正片旁白哈希和声音ID，使用同视频Library身份的新版本；音频必须有实际Library身份。视频实际分片可回读；新视频码流哈希与基础片相等，帧数不变，原片尾声音源保留，旧普通旁白移除。旁白不得超过固定正片时长，全部最终时长须≤60秒。不得截尾、补帧或改文以勉强通过。`replace-narration.mjs`仅处理已存在、经核实的本机输入，不调用生成，不审批。

保持画面与画面认可分开：默认只保持，不替用户批准。即使用户勾选画面认可，声音和新的声画结合仍待试听。通过换声版会审核确切新节点；暂停声音意见及恢复回执不改变原reworks，也不重置预算。旧稿、旧视频、旧批准和每次状态变化的审计保留；切换模式、改稿、换基础视频或撤销scope使旧申请失效。

当前限制：费用尚无可靠回执；定时CLI未暴露HeyGen生成/Library本地归档，因此需要现有授权原生会话接力。网站可以登记、核费回传、确认、排队、租约/检查点、真实产物回传与审核；不声称当前已无人值守生成。公开素材权利仍待确认，仅私有审阅，不授予发布。

本轮仅开发测试部署，没有创建本片真实换声申请、批准视频或调用create_speech。SQLite隔离合同测试覆盖owner-only、重复提交、报价重放、费用未知/新增费用确认、并发领取、回执恢复、版本失效、保持画面/时长/真实归档校验与原返工数不变。实际离线测试使用明确SYNTHETIC色块及音调，验证150帧视频码流不变、全解码、5秒输出；不是本人声音或本题成片。
