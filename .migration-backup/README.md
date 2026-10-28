# 怎么用好AI · 选题生视频一站式网站

截至 **2026-10-28 21:45（北京时间）** 的源码与进展交接，保存在私有 GitHub。源码已补入打包期间 V329/V330 的九文件增量，最近确认成功版本为 **V330**，提交 `1c09876742e750bc5bd99a9a4db3e7b6094078fa`。

正式网站：https://siounex-ai-topic-library.siounexzhao.chatgpt.site/ （仅本人可访问）

CLI 已重新绑定并进入真实业务；原 V327 九项已同步，后续 PHP 续验及小幅动态复核六项仍待实际接入。最新完整轮仍失败，新轮没有完成证明。PHP/画面缺口没有新完成结论。

V331 最新部署失败，不作为已上线或本包已包含源码。详情、未解决事项及真实时间边界见 [当前进展](docs/handoff/current-progress.md)。原 V328/20:05 快照保留为历史记录。

## 下载后先还原片尾资源

三个较大的片尾原件采用分块存储，全部原字节包含在 `.snapshot-assets/` 中。下载或克隆仓库后，在仓库根目录执行一次：

```sh
node scripts/restore-snapshot-assets.mjs
```

脚本无需联网或安装依赖，会校验各分块及完整文件 SHA256，再还原到原 `production/assets/` 路径。其余源码直接保存。该步骤只还原本地快照文件，不执行制作、同步或发布。

## 先读这些

- [当前进展与未解决事项](docs/handoff/current-progress.md)
- [下一步恢复顺序与验收要求](docs/handoff/recovery.md)
- [现行协作与制作规则](AGENTS.md)
- [源码快照来源与 SHA256 清单](docs/handoff/source-manifest.json)
- [目录与本地开发说明](docs/handoff/development.md)
- [验证范围和打包边界](docs/handoff/verification.md)

## 本包包含什么

保留应用代码、制作脚本、数据库迁移、测试、锁文件、构建插件和必要品牌资源。`build/` 内是构建源码，应保留。Sites 原有项目 ID、绑定和权限逻辑保留。

未携带 Sites Git 历史、数据库内容、私有成片、新闻素材缓存、运行端状态、凭据、环境文件、依赖或编译产物。此包可供继续开发，不是生产数据的完整灾备。

本次仅导出独立快照，没有部署网站、同步运行端、改计划或重做媒体。原站和运行端仍为正式执行来源。旧说明文档保留历史原意；有冲突时以本人最新指令、当前 AGENTS 和真实回执为准。
