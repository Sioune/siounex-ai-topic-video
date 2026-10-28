# 怎么用好AI · Unified v9 运行模板 v1

这是当前Claude内容v9的可运行源模板，原A2源包保留。用户自报本片于2026-10-10北京时间20:22发布；未核平台视频。本包只支持素材恢复、校验与本地画面合成，不生成旁白/数字人、不配置凭据、不发Slack、不公开发布。

## 文件职责

- `render-v9.mjs`：实际本地FFmpeg/Sharp执行器，输入先校验，支持明确范围的预览与本地完整版。
- `mechanism-v1.json`：通用机制和版式。统一冷银背景；无主区/底区大包围框；满宽连续章节蒙层；真实胶片条；低亮亚像素进度；同槽单轮往期；恢复真实时间。
- `examples/claude-v9.json`：本片专属参数。1636正文帧、四段真实章节、六帧采样与23–33.8秒三条往期。这不是所有视频的默认时序。
- `media-resources.json`：固定Library ID、file ID、version、字节数和SHA256。重媒体不打进源码包，恢复后才读取真实本地路径。
- `font-profile-windows.json`：字体文件和哈希；字体不随包分发。不能静默用替代字体冒称同一视觉结果。
- `restore-assets.py`：从已由官方Library流程物化的固定主片与旧媒体包恢复所需四个成员。标准库、离线、无网络凭据。
- `assets/unified-background.svg`与`assets/claude-captions.ass`：轻量真实布局源与本片已批准字幕。字幕正文、字号与位置保留。

## Windows恢复与执行

依赖Node.js >=22、Sharp 0.35.4、具有libass/libx264/geq的FFmpeg与ffprobe、Python 3。当前验证环境用既有Node v24.14.0与Sharp 0.35.4；未测试全新无依赖机器安装、Mac/Linux或新选题完整链路。缺依赖时先补当前环境依赖，不使用128MB网页Worker代替渲染。

1. 将源码ZIP展开到一个新目录，保留旧A2包和发布片。
2. 用官方Library `prepare_materialize`和本环境的官方transfer helper物化以下固定版本，保留完整返回元数据：主片 `libfile_7cd6310c62948191b7358238328fe072` / `file_0000000016f081f7aee772fd63df4bad` / v10；旧媒体ZIP `libfile_f63aab2beb44819180a8b8f52dffbf59` / `file_0000000095548230900df003a2f8e798` / v0。不能把云路径当Windows文件，也不能把恢复失败的旧版本偷偷换成latest。对应SHA256见资源索引。
3. 推荐直接将主片物化到包内`media/published-v9.mp4`；或在同一文件系统下通过下面命令创建硬链接，保留原文件身份和附加元数据。跨卷无法硬链接时重新官方物化到该目标，不降级为丢元数据的字节复制。

```powershell
python restore-assets.py --master '实际已物化主片路径' --media-bundle '实际已物化旧媒体ZIP路径'
node render-v9.mjs examples/claude-v9.json --check
node render-v9.mjs examples/claude-v9.json --preview 0 3 --out check-opening
node render-v9.mjs examples/claude-v9.json --preview 22.9 11.1 --out check-history
```

第一条预览校验真实高光开头与主构图；第二条覆盖三条往期各一次和33.8秒回到当下进度。预览是静音，本包不会重新生成或改已发布音轨。`--preview`参数是全局正文时间，蒙层、播放线、往期和字幕不会从头重跑。各范围输出实际主片、360×640手机预览、首帧、FFmpeg图和运行回执。

如需本地完整复现，显式运行`node render-v9.mjs examples/claude-v9.json --full --out local-review`。它使用已经批准的AAC主片音轨并原样拼接索引中的120帧片尾。本次源包验证只跑短预览，未运行这个完整模板命令，也未替换发布片。不要把CLI写文件等同于公开发布。

## 迁移到下一条

复制样例配置，绑定下一条已经批准且实际落地的素材轨、音轨、字幕、哈希和原版片尾。章节按实际旁白切点覆盖完整正文，数量与名称按内容确定；蒙层全局持续推进，不重置。胶片帧必须取自新正文对应区间，裁切只用于小缩略图，主画面完整等比适配。

往期必须来自真实已发布内容，标题、看点、封面和来源都齐全；每条仅一次，与本期帧条互斥。单轮窗口由下一条旁白和实际观察决定，不复制Claude的23–33.8秒、不把用户“二十多秒疲劳”的假设当已验证规律。保留正确恢复时轴与独立片尾。当前运行器接受一个明确的连续往期窗口；如未来不要往期或需要其他机制，应先明确设计再扩展，不能用重复卡片凑数。

包内验证报告会明确实际执行的窗口、输入hash、帧数、源片未改与未验证范围。技术通过不自动代表新选题叙事、字体替换或视觉审阅通过。
