# Changelog

## v0.1.9 — 2026-08-11

修复三个实锤缺陷与窗口控制交互回退：

- **修复 OpenCode Go 额度误报耗尽**：解析器的“分数制兼容”启发式把百分比制 `usagePercent: 1`
  误读为已用 100%，低用量窗口（如周额度刚重置）被谎报为耗尽并触发错误告警。接口合同文档
  早已确认 0–100 百分比制，启发式已删除，并新增百分比 1 的回归测试。
- **修复额度告警反复弹窗**：ClinePass 的 `resetsAt` 由服务端按请求现算，每次刷新漂移数秒至
  数分钟，被周期身份（period_key）误判为“进入新周期”而重置告警代次——耗尽账号在自适应
  快刷下每 5 分钟重复弹窗（生产库代次高达 92）。周期判定新增漂移容差：偏移不足窗口标称
  长度 1/4 视为同周期；窗口闲置（`resetsAt` 缺失）不再丢失周期身份。
- **告警冷却与总开关**：同一窗口重新越线（回落武装后再次超阈）2 小时内不重复通知，
  Warning→High→Critical 升级不受冷却限制；设置页新增“额度阈值通知”总开关
  （此前额度告警无法关闭）。
- **窗口控制回归 Windows 直觉**：删除侧栏左上角 12px 仿 macOS 纯色斑点，改为右上角标准
  最小化/最大化/关闭三键（悬停高亮、关闭键红色悬停）；主区顶部新增整宽拖拽条，
  双击最大化/还原；侧栏品牌区同为拖拽区。
- 清理死代码：移除 v0.1.2 文案减法后无人调用的四个概览统计函数及其测试。

## v0.1.8 — 2026-08-03

> 本条目合并 v0.1.4–v0.1.8 五个连续迭代的改动；v0.1.4–v0.1.7 为本地开发迭代，未单独发布。

无边框晶透桌面沉浸框体 (Custom Frameless Translucent Window):

- **移除 Windows 原生黑标题栏与硬质黑框 (Remove Windows Titlebar)**：在 `tauri.conf.json` 中配置 `"decorations": false` 和 `"transparent": true`，彻底丢弃原生黑框，使整个 Webview 窗口直接嵌入系统透明画层。
- **自定义 3D 水晶拖拽与窗口控制**：左上角红黄绿 3D 晶透红绿灯直接关联 Windows 系统最小化/最大化/关闭窗口，侧栏顶部与全局顶栏加入 `data-tauri-drag-region` 拖拽支持。


极润晶透 3D 液态玻璃材质引擎 (Hyper-Liquid Ice Glass System):

- **冰晶极光氛围背景 (Ambient Ice Aurora Wallpaper)**：引入通透的天蓝-冰蓝-淡紫流体壁纸背景，彻底替代沉闷灰色底色。
- **高透 3D 水晶模压背板 (Translucent Crystal Backplate)**：提高卡片与侧栏透明度，透出背景极光；四周加固 3.5px 3D 水晶凸起反光管，右上/左下内嵌三棱镜彩虹折射光斑。
- **3D 晶透胶囊控件 (3D Crystal Pill Controls)**：`全部刷新`、`导出快照`、`网格/列表` 及选项卡控件全量 3D 晶透胶囊化。
- **macOS 风格 3D 水晶窗口控制粒 (macOS 3D Crystal Window Controls)**：侧栏顶部嵌入经典红黄绿 3D 晶透按键装饰。


终极 3D 晶莹液态玻璃材质系统 (Ultimate 3D Liquid Crystal Engine):

- **3D 果冻胶囊进度条 (3D Jelly Pill Progress)**：加粗至 14px 润泽胶囊，轨道采用 3D 玻璃凹槽内阴影，填块右端加入润泽液滴高光头 (Capsule End Bulb Sheen)，带来极致 Q 弹的水晶宝石质感。
- **28px 晶体压克力卡片 Chamfer**：卡片圆角提升至 28px，结合顶部 2.5px 纯白凸透镜 3D 导角高光，浅色底升至 0.78 润泽银白。
- **3D 晶透图标块 (3D Crystal Squircle Icon)**：Provider 标记升级为 42px 晶透圆角方块，配以高光折射与浮雕投影。


浮层视效修补与材质明度再平衡 (Floating Layer Isolation & Contrast Balance)：

- **抽屉与弹窗遮罩修补 (Drawer/Popover Isolation)**：将右侧详情抽屉面板 (`.drawer-panel`)、弹窗与下拉列表 (`.glass-popover`) 的背景透明度调至高遮罩率状态 (`0.88 - 0.92`)，解决原本全透导致抽屉文字与底层卡片严重字痕重叠的穿透碰撞问题。
- **环境光与底色纯正化 (Unified Ambient Backlighting)**：重置深色模式下的底色渐变，去除侧栏下方生硬偏红的橙色光斑，统一为优雅深邃的靛紫-青蓝极光背景；浅色模式改用冷灰蓝 Canvas 调性。
- **抽屉动作按钮精致化 (Refined Drawer Controls)**：抽屉顶部动作按键组淡化生硬白框，危险操作按钮（删除账号）配备柔和红微光。


重构 3D 光学色散液态玻璃 (3D Optics & Chromatic Liquid Glass Engine)：

- **中心晶莹剔透 (Clear Transmission)**：中心 `blur` 降至 `1.5px`（几乎零模糊），消除 2020 时代大面积模糊导致的“老毛玻璃感”；背景内容与颜色高保真透出。
- **24px 3D 边缘折射 (3D Chamfer Lensing)**：边缘导角区 (`bev`) 扩至 `24px`，折射位移 (`maxDisp`) 升至 `18`；使用 Sigmoid 凸透镜曲面，实现边缘强力液态扭曲。
- **彩虹边缘色散 (Chromatic Aberration Prism Split)**：SVG 滤镜引入 RGB 分通道色散算法（`feOffset` dx: 2.0 / dy: -1.0），在玻璃 24px 弯曲边缘呈现真三棱镜彩虹色散与光学分色。
- **3D 菲涅尔多重立体阴影 (Multi-tier Fresnel Inset Shadows)**：淘汰平面 1px 单线边框，采用高阶 4 层 Inset 阴影组合（顶部 1px 镜面 Highlight + 3px Chamfer 凸起光 + 12px 深度折射体 + 底部 Dark Refraction），赋予玻璃真实的压克力/晶体厚度感。
- **动态流体环境光 (Fluid Gradient Blobs)**：升级 `app-shell` 动态环境光斑，提供丰富的高对比色彩供玻璃边缘折射。

## v0.1.3 — 2026-08-02

> 注：该改动提交时未 bump 版本号（代码树从 0.1.2 直接升至 0.1.4），v0.1.3 无独立构建；
> 内容随 v0.1.4 首次进入带版本号的代码树。

液态玻璃重做：从“磨砂糊+硬叠白边”改为“折射为主+柔和镜面”，更接近 Apple Liquid Glass 的晶莹剔透。

- 玻璃 filter 链重构：移除 feGaussianBlur/feColorMatrix（磨砂+过饱和是“糊而不晶莹”的根因），SVG 滤镜只保留纯几何折射 + feBlend(screen) 镜面边缘光；blur+saturate 改由 CSS backdrop-filter 函数在滤镜前串联，背景清晰透出而非糊掉。
- 镜面边缘光改用 feBlend(screen) 替代 feComposite(over)：柔光叠加替代“硬画白边”，去掉刺眼感；强度参数下调（specStrength 1.25→0.85，edgeAmbient 0.38→0.22）。
- tint 无色化：深色 --glass-bg 从偏绿 rgba(26,30,27) 改纯白，浅色从 0.28 降到 0.14，去掉色偏与过曝。
- sheen 改 ::before + mix-blend-mode：顶部高光从硬叠渐变改为 screen 柔合（深色）/ normal 直接高光（浅色），边缘亮线从 90% 白降到 30-40%。
- 环境光增强：深色补一道中部暖光、浅色补一道中部淡蓝光，让卡片区有明暗/色彩可供折射（玻璃在纯色背景上“消失”是晶莹感缺失的根因）。
- 浅色玻璃靠投影（0.14→0.22）+ 灰边框 + 边缘暗轮廓定义形状，而非白色高光（白色在亮背景上无效）。

## v0.1.2 — 2026-08-01

视觉与交互深度重构：流体玻璃 + 剩余量表达 + 文案减法。

- 液态玻璃材质系统：利用 Chromium 专属 backdrop-filter: url(#svg)，按元素尺寸运行时生成 squircle 物理折射位移图（边缘位移大、中心为零），背景磨砂 + 折射 + 镜面边缘光；全应用统一（侧栏、对话框、toast、抽屉、列表行、设置卡），透明关闭/高对比/减弱动态时回退实色。
- 配额改为剩余量表达：进度条表剩余、主读数“剩余 X%”、阈值刻度按剩余轴镜像。
- 文案减法（对齐 CPA 交互逻辑）：状态徽标沉默化（正常与额度档位不再贴“正常/注意/危险”，仅数据陈旧显示“待刷新”）；筛选改为带计数的“全部/需处理 N”；删除“正常账号/注意窗口”抽象汇总条；错误文案改为事实句。
- 玻璃下拉（GlassSelect）替代全部原生 <select>，解决深色主题下原生下拉是白底框的问题。
- 设置页改两列独立 flex，消除右侧大片空白；概览顶部精简；列表行加粗进度条。
- 安装器新增 NSIS_HOOK_PREINSTALL：自动卸载旧版 AI Quota Monitor，避免双版本并存。
- 移除失效的 surface 抽象与液态噪声滤镜。

## v0.1.1 — 2026-08-01

修复两个 v0.1.0 实装缺陷：

- 安装后不再附带控制台黑框：发布版补 `windows_subsystem = "windows"`，EXE 编译为 GUI 子系统。
- 修复设置页全部控件"保存即弹回"：auto-launch 的 `disable()` 在注册表值不存在时会报错，
  导致未启用过自启的机器上每次保存设置都失败；自启设置改为幂等，目标状态一致时不再调用。

产品更名为 **Quota Nexus**（曾用名 AI Quota Monitor）：

- identifier 变更为 `com.quotanexus.desktop`；首次启动自动迁移旧版的 SQLite 业务库、
  Windows Credential Manager 秘密条目与数据库文件名，无需手动操作。

交互与视觉重构（深度审核后的设计修正）：

- 新增账号详情抽屉：概览卡片与账号行点击进入，聚合额度窗口、连接状态、
  单账号趋势和全部账号操作；历史趋势从概览底部迁入详情层。
- 窗口健康档位改由 Rust Core 按用户阈值计算下发，修复修改阈值后概览筛选失效的问题。
- 新增 toast 反馈系统与应用内确认对话框，移除常驻横幅与原生 window.confirm。
- 清除产品内说明性文案与调度器术语（"Phase 0 样本""退避至"等）。
- 状态徽标收敛为三级风险（正常/注意/危险）加中性态；供应商识别色区分为橙/紫/青。
- 窗口已用百分比提升为卡片视觉主角并按档位着色；进度条移除滑块式端点；
  趋势图补齐时间刻度，系列配色按窗口类型固定。
- 修复空状态混淆：筛选无结果不再误显示"还没有账号"。
- 概览新增排序选择（风险优先/名称/供应商）与网格/列表两种视图，偏好本地持久化。

## v0.1.0 — 2026-08-01

首个公开版本。

- 统一监控多个 OpenCode Go、Ollama Cloud 和 ClinePass 账号的额度窗口与重置时间。
- 支持 Firefox 请求头 JSON 导入、凭据复用、OpenCode Workspace 自动发现和固定代理出口。
- 提供历史趋势、自适应刷新、Windows 告警、托盘运行、开机自启和脱敏诊断导出。
- Provider 秘密和代理认证保存在 Windows Credential Manager，SQLite 只保存业务数据。
- 提供浅色、深色、实色、高对比度、隐私截图和窄窗口适配的液态玻璃界面。

Windows 首发资产为未签名 NSIS 安装器，文件名带有 `UNSIGNED`，同时提供 SHA-256 清单。
