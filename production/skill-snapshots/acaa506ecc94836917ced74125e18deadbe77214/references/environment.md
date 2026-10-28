# 环境与资源恢复

先区分技能可见与实际制作能力。Dot/ChatGPT和Codex都可使用被当前会话发现的技能，但不能保证另一台电脑自动有同一技能。先在该端技能目录查 make-siounex-videos；若未出现，按该端支持的技能安装方式安装完整技能文件夹，不能只拷SKILL.md漏掉references/assets/scripts。云端已安装但列表缓存时刷新或重新打开技能页。

本地准备与检查：
- 用 python3 scripts/qa_media.py --help 检查Python脚本可运行；用 ffmpeg -version 和 ffprobe -version 检查媒体依赖。
- SVG模板外部引用 portrait-source.jpg：此文件刻意不打包，先恢复已授权肖像，放在模板相同目录；否则模板没有人脸，不能视为成片。
- 如重新渲染SVG，选可用的SVG渲染工具，例如Inkscape，并确认中文字库（原设计使用Noto Sans CJK SC）。无需强制某一个编辑器。
- 读取resource-manifest.json，根据资源ID在同一授权账号恢复媒体；manifest中的legacy资源只是旧版线索，不代表最新获选片尾或当前数字人口播。
- 数字人生成还需对应服务账号、授权头像/声音及可用额度；云连接与浏览器登录分别核验。不得把新设备需要的付费/登录/安装假称已完成。

电脑离线时，已有技能、依赖和本地素材可以支持写稿、剪辑、渲染及技术QA；无法据此完成新在线新闻核验或云端数字人生成。未接通用户电脑时不能从云端直接操作它。

严格时长用最终视频帧与音轨实测。脚本默认容差0.04秒只用于帧级舍入；平台硬上限应同时确认实际总时长不超过上限，必要时缩短一帧，不把容差内超时当合格。

A2布局另见 [A2可复用布局](a2-silver-history.md) 和 assets/a2-silver-history.template.json。实际源码已收入 assets/a2-runtime/，示例素材按资源索引的 Library ID 恢复，或将源码ZIP与素材ZIP校验后解压到同一受控目录。Windows 输入校验和90帧预览已验证；完整模板命令、新题材全流程、Mac/Linux未验证。字体未分发，需当地实际字体与校验值。历史电脑路径只供定位，不授予电脑访问权。

统一v9源包恢复见 references/unified-narrative.md 与 assets/unified-v9-runtime/README.md。它有实际运行器但不含重媒体/字体：依赖固定主片v10与旧媒体ZIP v0。只验证Windows新目录两段短预览，未验证整片模板命令、新题材、新机器安装或Mac/Linux；不得与旧A2的90帧测试范围混淆。
