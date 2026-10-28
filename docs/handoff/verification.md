# 验证与打包范围

## 本次执行

- 只读核对正式源码 HEAD 与工作区；原 tsconfig.tsbuildinfo 改动保留。
- 使用 Sites 原生连接读取当前站点、V328 版本及成功部署；仅本人访问、外部访客 0。
- 读取本机自然轮回执、当前 CLI descriptor 与官方 manifest 路径，未改执行器。
- 对 V328 角标脚本及九项未同步文件做字节/换行归一核对。
- 通过原生制作入口只读读取 MiniCPM、PHP、AI 漫剧、AI 搜索 handoff。
- 读取发布看板和原发布对话；没有本轮独立访问平台，区分平台回执与本人报告。
- 从固定 Git 提交隔离导出，再加入交接文档；逐文件 SHA256 清单见 source-manifest.json。
- 扫描当前跟踪文本的常见私钥、token、Bearer、带引号秘密配置和签名 URL；可疑项复核为合成测试数据或公开图片编码，没有确认真实秘密。扫描不涵盖 Git 历史、运行缓存或二进制隐写。

## 原版本检查，非本次重新运行

V328 原发布记录：17 项相关检查、类型及正式构建通过；真实浅色 IRON 隔离合成抽查与深色底片单帧检查无灰条，音轨、119 帧片尾及时间轴核验通过。隔离样片不是对已发布 IRON 的替换，也不证明自然轮已使用新脚本。

V327 原发布记录：8 项定向、独立相关组 30 项、类型与正式构建通过；尚无运行端并行批次实际提速数据。

上述是原有证据，不声称本次或历史全库通过，不声称业务出片或回站成功。

## 排除项

原 Git 跟踪 1600 文件，排除 tsconfig.tsbuildinfo 和 .takeover/caption-final-tests.log，保留 1598 个原源码文件（原字节 67,815,844）。另加入本次文档。README 与 .gitignore 的导出版本有明确调整，其余原源码按 Git 提交原字节保留。

不导出 `.git/`、`.sites-runtime/`、`.wrangler/`、node_modules、.env、凭据、数据库、私有成片和素材缓存。品牌及片尾资源属于版本控制源码，保留原字节。没有新增开源许可；仓库保持私有。


## GitHub 大文件存储适配

最终 GitHub 交接包将三个较大的片尾原件按原字节切分，全部分块放在 `.snapshot-assets/`。原 `production/assets/` 路径在执行 `node scripts/restore-snapshot-assets.mjs` 后恢复；本次已在独立目录实际还原并逐文件核对原件 SHA256。

其余源码正常保存。GitHub 当前文件清单及 SHA256 见 `github-manifest.json`；`source-manifest.json` 保留 V328 源文件身份及分块映射。`package-manifest.json` 对应本机最初完整 ZIP 的内容，GitHub 的分块与新增还原说明以 GitHub 清单为准。

最终 GitHub tree 应与本地隔离构造的交接目录完全一致；该比对验证当前 GitHub 存储集合。运行还原脚本后，三份媒体原字节与 V328 保持一致。此适配没有变更原网站源码或制作运行端。
