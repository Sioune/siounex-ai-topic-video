// Pure shared policy: safe in both the local CLI and the website worker.
// The owner's current stage separation supersedes the old cross-stage material
// gate prospectively; frozen skills and historical reports remain immutable.
export const REVIEW_STAGE_POLICY_VERSION = 'owner-stage-separated-review-v2';
export const REVIEW_STAGE_POLICY_TEXT = `仅审核当前来源/口播文本，独立于后续素材获取、制作和成片验收。此明确指令优先于旧冻结技能中“素材待补不得通过”的跨阶段解释；旧素材门继续约束制作就绪与最终成片，不改写旧技能或历史审核。
来源节点：检查实际URL、原文身份/日期、主张与证据、必要归属和未知边界。区分编辑拟题与原文标题，不能仅因二者不同就退回。facts检查本稿实际采用的主张，不要求复述整篇文章。materials检查素材清单及缺口是否如实记录；尚未下载的演示、未取得的原片、分镜素材、复用权待确认，只登记为后续取材待办，不因此判来源或口播不通过。
系列模板、最近三期/往期作品片单、系列选择快照与稿件materials中的制作记录属于下游制作上下文。来源/口播阶段不核对这些记录彼此是否一致，不以模板或片单差异、选择状态过期、素材文件尚不可用作为revise或pause理由；一律只登记为后续制作待办。制作记录中提到GLM等其他作品不等于本条口播事实错误；只有本稿实际对观众表达的事实主张与原文证据冲突、捏造已做实测等当前文本问题才打回。此边界优先于冻结技能里的系列一致性与往期核对要求，后续制作仍须核对精确系列与素材绑定。
口播节点：检查事实依据、误导/夸大、选题对应、口语清晰度、分镜计划和含既有片尾在内的60秒时长规划。可以批准诚实标明待补素材的文本和分镜计划；无需已有录屏、配音、数字人、封面、FPS审计、手机预览或最终导出。画面计划不能冒充已看过或亲测结果；未发生的对照实验不能写成已经证实的结论，事实矛盾或凭空功能仍应revise，决定性事实不足应pause。
审批只表示当前文本节点通过，production_ready仍为false；素材真实性、权利、连续实演、声音、帧率、实际时长与手机画面必须在后续独立流程核查。429、连接故障或无模型输出属于审核未完成，不能生成内容revise，不能当作质量不合格。已批准的同版人工决定不因本政策重新审核。`;
export const REVIEW_STAGE_POLICY_SHA256 = '33566ad4efe1701d260d64ea41ab3807a7956346735a9298b16ceec2b7ea6283';
export const REVIEW_STAGE_POLICY = Object.freeze({
  version: REVIEW_STAGE_POLICY_VERSION,
  authorized_at: '2026-10-20',
  stages: Object.freeze(['source', 'script']),
  text_approval_is_production_readiness: false,
  source_materials_criterion: 'truthful-inventory-and-gaps',
  missing_media_action: 'record-for-material-preparation',
  series_history_action: 'defer-to-material-production',
  facts_and_misleading_claims_remain_blocking: true,
  technical_failure_is_content_rejection: false,
});
