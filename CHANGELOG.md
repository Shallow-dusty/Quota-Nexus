# Changelog

## v0.1.14 — 2026-08-16

深度审计修复：让液态玻璃折射首次真正上卡；并发与数据正确性治理。

### 液态玻璃（折射引擎全面检修）

- **折射真正上卡（关键修复）**：`.quota-card`/`.app-sidebar` 曾以带 `!important` 的
  `backdrop-filter` 压过 GlassSurface 的内联折射链（author `!important` 高于内联样式），
  v0.1.5–v0.1.13 期间整套 SVG 折射引擎从未在卡片与侧栏上生效。现由组件内联统一管理。
- **撤除嵌套玻璃**：`.workspace-stage` 的 backdrop-filter 会让它成为后代玻璃的
  backdrop root，卡片只能采样到半透明白底而采不到窗口极光。现撤除，全窗口单层玻璃。
- **filterUnits 修复**：SVG filter 显式 `userSpaceOnUse`——默认 `objectBoundingBox`
  会把像素值解析为边界框倍数，产生数百倍于元素的 filter 区域（GPU 纹理浪费）。
- **squircle 轮廓**：主要矩形表面启用 `corner-shape: squircle`（Chrome 139+），
  轮廓曲率与位移图的 squircle 剖面对齐；不支持引擎安全回退圆角。
- **液态交互**：额度卡悬停（×1.14）/按压（×0.74）时以 rAF 插值过渡折射强度——
  `feDisplacementMap` 的 scale 是唯一无需重建位移图即可动画的参数；
  reduced-motion 下直接跳变。
- **渐进模糊页头**：页头改为顶部 22px 全强度、向下 mask 渐隐（iOS 26 工具栏式），
  本体不挂 backdrop-filter 以免成为后代 backdrop root。
- **暗色弱折射**：v0.1.13 的"暗色纯模糊"根因是底板饱和预烘；预烘撤除后暗色改为
  位移减半（scale 9）、色散关闭、高光收敛的克制透镜边。
- **视口懒挂**：滚动出视口（+120px 预载带）的表面退回纯模糊，进入视口再挂折射链；
  `.page-scroll` 提升为独立合成层，规避 Chromium 对 `backdrop-filter: url()`
  的滚动闪动缺陷（crbug 41471914）。

### 数据正确性与并发

- **阈值输入修复（P0）**：阈值输入框清空后失焦曾被存为 0（`Number("") === 0` 且
  isFinite），导致全部账号落入 Warning 档并触发通知风暴。空/非法输入现回退原值，
  提交值 clamp 到 0–100。
- **同账号 in-flight 去重 + 全局并发**：调度器与手动刷新并发时同一账号会被同时抓取，
  并发的告警评估读到相同旧状态导致双发通知；Provider 信号量也在每次刷新时重建，
  使实际上限翻倍。现改为全局静态信号量 + in-flight 集合互斥。
- **编辑标签不再重置刷新计划**：改标签会把 `next_refresh_at` 重置为 now 触发即时刷新；
  现仅在恢复暂停账号且计划为空时补 now。
- **get_history 按账号过滤**：趋势图所需单账号序列不再整表跨 IPC 后前端过滤。
- **Ollama Bearer 剥离修正**：含 `=` 的 base64 API Key 不再被误判为 Cookie 而跳过
  Bearer 前缀剥离。

### 其他修复与优化

- 导出文件名带毫秒（同秒连续导出不覆盖）；ZIP 打包移入 blocking 线程池，
  快照写盘改异步。
- overview/connections 消除 N+1（窗口快照与凭据计数各一次聚合查询）。
- OpenCode 多 Workspace 并行抓取（保序 buffered，并发 2），超时不再叠加。
- WebView 配置 CSP（default-src 'self'）。
- 前端订阅 `scheduler-error` 事件（此前只发不收，调度故障静默丢失）。
- 固定出口编辑改用结构化 `proxyUrl` 回填，不再从展示字符串反推。
- 阈值刻度恢复显示；SegmentedControl 方向键导航 + roving tabindex；
  概览初始加载失败提供重试；窗口档位色改用主题变量（暗色适配）；
  共享时钟替代每卡定时器；移除已无引用的 react-aria-components 依赖；
  index.html 元数据更名 Quota Nexus。

## v0.1.13 — 2026-08-11

深色模式观感打磨：卡片不再像“充气垫”，玻璃污渍彻底清除。

- 暗色卡片压平：边框 0.22→0.14、内部顶→底亮度差收敛、底部内阴影 0.65→0.4，
  读作玻璃而不是气囊。
- 暗色 GlassSurface 彻底改走纯模糊路径（不含 SVG 折射链）：经逐层消融验证，
  折射链在低亮度背景上必然放大背景结构（两层 saturate 预烘 + 位移折带），
  而暗色下透镜边几不可见——立体感由 CSS rim/阴影层承担。浅色链不变。
- 暗色阴影池收敛（玻璃 0.65→0.45、卡片 0.75→0.55）：过浓的阴影会被邻近卡片
  的背景模糊采样进去。
- 暗色极光背景色块 alpha 再降一档（0.10–0.14），工作台/侧栏饱和 1.15。

## v0.1.12 — 2026-08-11

深色模式修复：表面奶白 + 背景色斑。

- 修复深色主题大面积奶白：v0.1.5 重设计给侧栏/工作台/分段控件/玻璃按钮硬编码了带
  `!important` 的浅色值，无 `!important` 的暗色覆盖全部失效。补齐暗色覆盖。
- 修复深色卡面“色斑”：`saturate()` 会放大极光背景与色散边——暗色主题玻璃 saturate
  降为 1，quota 卡 1.05，工作台/侧栏底板 1.15；卡片装饰辉光暗色压暗；暗色极光背景收敛。
- 玻璃 blur/saturate 改为主题 token（`--glass-blur`/`--glass-saturate`），未显式传参的
  GlassSurface 随主题切换。
- 「上次刷新」时间戳 ink-3 → ink-2（暗色可读性）。

## v0.1.11 — 2026-08-11

修复窗口控制失效（ACL 拒权）；概览筛选/排序重设计；前端包大幅瘦身。

- 修复无边框窗口的严重回归：capabilities 只授 `core:default`，window 插件的
  minimize/close/toggleMaximize/start_dragging 等命令自无边框化（v0.1.5）起一直被 ACL
  拒绝，前端静默 catch 掩盖——窗口三键与拖拽区域形同虚设。现显式授予 `window:allow-*`
  权限，窗口操作失败改为 console.warn 而非静默吞没。
- 概览筛选重设计：「需处理」改为「连接异常」，只含可操作异常（刷新连续失败/出口暂停）；
  额度阈值告警不再混入。筛选状态仅会话内恢复（sessionStorage），重启复位。
- 排序默认改为名称稳定序（位置固定可肌肉记忆）；「风险优先」保留但语义修正：
  连接异常排在阈值告警之前（可操作 > 仅需知晓）。
- 前端包瘦身：移除 react-aria-components 依赖，Button/Modal/Select/Segmented 换为轻量
  自实现（保留 portal、焦点圈禁、键盘导航、aria 语义），主包 gzip 140.7KB → 86.7KB，
  总量约 90KB，达成 120KB 目标。

## v0.1.10 — 2026-08-11

液态玻璃高保真化：物理透镜剖面 + 真分通道色散 + 立体感厚度。

- 位移剖面从 sin 经验曲线改为凸 squircle 帽高度函数的导数（物理透镜近似），边缘弯折读起来是弧形玻璃而非水面。
- 色散改为真·分通道位移（R/B 通道 ±9%），彩虹边只在有位移的边缘天然出现；移除旧的全表面 feOffset 泛红层。
- 高光升级为双层：1.8px 锐利 rim + 12px 入射光带，随表面法线与光源夹角变化。
- CSS 厚度层：顶部入射光带 + 底部内阴影 + 凸面软垫高光 + 加深环境投影，强化玻璃立体感。
- 数据卡默认模糊从 1.5px 提升到 7px，背景内容不再把字痕透进卡面文字区。
- 位移图/高光图按参数全键跨元素缓存（LRU 48 项），同尺寸卡片共享地图，resize 重建成本大降。

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
