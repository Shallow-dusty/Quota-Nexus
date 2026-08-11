# Quota Nexus 设计与实现基线

| 项目 | 当前值 |
| --- | --- |
| 文档状态 | Implemented baseline |
| 版本 | 0.1.8 |
| 最后更新 | 2026-08-11 |
| 首要平台 | Windows 11 |
| 产品形态 | 本地桌面应用 |

## 1. 产品目标

Quota Nexus 把 OpenCode Go、Ollama Cloud 和 ClinePass 的多个账号放进同一个额度面板，
统一展示供应商原生窗口、已用比例、重置时间、数据新鲜度和认证健康。

当前版本优先完成额度监控，不接管现有客户端，也不进入模型请求链路。这是当前开发阶段的
产品重点，不是对未来账号操作、客户端联动、请求路由或使用分析的永久禁止。新增能力应与
后台额度采集分层，并清楚说明副作用和数据范围。

当前版本包含：

- 三家供应商、多账号和 OpenCode 多 Workspace。
- 手动、周期、自适应刷新和失败隔离。
- 凭据复用/更新，账号暂停/恢复/本地删除。
- Credential 级固定网络出口。
- 7/30/90 天历史、Windows 通知、脱敏快照和诊断导出。
- 托盘、自启动、隐私显示与 Windows 安装包。

## 2. 架构

```text
┌─────────────────────────────────────────────────────────────┐
│ React UI                                                    │
│ Overview · Accounts · Settings                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ typed Tauri commands/events
┌──────────────────────────▼──────────────────────────────────┐
│ Rust Core                                                   │
│ Scheduler · Adapters · Normalizer · Alerts · Export         │
├───────────────────┬───────────────────────┬─────────────────┤
│ SQLite            │ Credential Manager    │ Windows shell   │
│ state/history     │ provider/proxy secret │ toast/tray/start│
└───────────────────┴───────────┬───────────┴─────────────────┘
                                │ scoped HTTPS client
                ┌───────────────▼────────────────┐
                │ Cline · OpenCode · Ollama      │
                └────────────────────────────────┘
```

### 2.1 技术栈

- Tauri 2 + Windows WebView2 + NSIS。
- Rust、reqwest、sqlx/SQLite、keyring、Tauri plugins。
- React 19、TypeScript、Vite、Tailwind CSS 4、React Aria、Lucide。
- SVG 自绘趋势图，不引入大型图表运行时；生产 JS 当前约 138KB gzip（超出 120KB 目标，待瘦身）。
- Windows Credential Manager 保存 Provider 秘密和代理认证。

前端没有第二个调度器。页面只读取 Rust Core DTO，并监听 `overview-updated` 事件；领域
`freshness`、退避和下次刷新时间全部由 Core 决定。

## 3. 供应商适配器

| Provider | 当前数据源 | 认证 | 窗口 |
| --- | --- | --- | --- |
| ClinePass | `GET https://api.cline.bot/api/v1/users/me/plan/usage-limits` | API Key | 5 小时、周、月 |
| OpenCode Go | `https://opencode.ai/_server` 与 Workspace Go 页面 | `auth` Cookie | 5 小时、周、月 |
| Ollama Cloud | `GET https://ollama.com/api/usage`（主）/ `/settings`（兼容） | API Key（主）/完整 Cookie header（兼容） | Session、Weekly |

适配器只返回 Provider 原生窗口；Core 将其归一为：

```ts
type QuotaWindow = {
  kind: "rolling_5h" | "weekly" | "monthly" | "session" | "unknown";
  label: string;
  usedPercent: number;
  resetsAt: string | null;
};
```

发往 UI 的 DTO 额外携带 `tone`（normal/warning/high/critical），由 Core 按用户阈值
统一计算；UI 不做百分比与阈值的二次比较。

OpenCode 的一个登录 Cookie 可发现多个 Workspace。它们在 UI 中是不同账号，但共享一个
Credential 和同一 NetworkProfile。当前三个适配器均已用真实账号验证，脱敏合同保存在
`docs/provider-contracts/`。

## 4. 网络和凭据

### 4.1 两种出口

1. Credential 未绑定 NetworkProfile：reqwest 发出普通 socket，由 Windows 网络栈或现有
   TUN 接管。
2. Credential 绑定 NetworkProfile：只走该 HTTP、HTTPS、SOCKS5 或 SOCKS5H 出口。

Client 始终 `.no_proxy()`、禁用自动重定向、设置连接/总超时。显式出口配置或连接失败时
直接返回固定摘要，不回退默认/TUN，也不把端点或认证带入错误。

Adapter 使用固定 HTTPS host/path，不接受 UI 传入任意上游 URL。Cookie/API Key 只在适配器
创建请求时注入；client 不启用 cookie jar。

### 4.2 秘密生命周期

```text
AIQuotaMonitor/Credential/<uuid>      Provider Cookie/API Key
AIQuotaMonitor/NetworkProfile/<uuid>  代理用户名/密码
```

- 两类秘密均保存在当前 Windows 用户的 Credential Manager。
- SQLite 保存 opaque UUID、供应商、标签、非秘密网络元数据和 `has_auth`，不保存秘密。
- UI 录入值只停留在当前 Dialog 局部状态，成功、取消或切换凭据后清空。
- 更新凭据覆盖 WCM 旧值；删除最后一个共享账号时同时清理对应 WCM 条目。
- 删除仍被 Credential 引用的 NetworkProfile 会被拒绝。

录入层会从 Firefox 请求头 JSON 或普通请求头文本中提取 Cookie/Authorization；前端不需要
用户手工裁剪字段。Ollama API Key、ClinePass API Key 与兼容 Cookie 均由 WCM 存储。
若未来供应商凭据超过 WCM 可接受范围，再引入
CurrentUser DPAPI 后备；MVP 不维护一套当前没有真实需求的第二秘密存储实现。

## 5. 数据模型

SQLite schema 由五个 migration 演进：

| 表 | 职责 |
| --- | --- |
| `network_profiles` | 固定出口的非秘密元数据 |
| `credentials` | Provider、标签、WCM 引用关系、最后验证时间 |
| `provider_accounts` | 账号/Workspace、计划、调度与错误状态 |
| `quota_snapshots` | 每个账号窗口的最新成功快照 |
| `quota_history` | 成功刷新历史，按 7/30/90 天策略清理 |
| `app_settings` | 刷新、阈值、历史、托盘、自启、隐私和通知设置 |
| `provider_health` | Provider 熔断、失败计数和下一次探测 |
| `alert_states` | 账号+窗口的状态代次、待投递事件和成功通知确认 |

SQLite 每次连接启用 `foreign_keys=ON`、WAL 和 5 秒 busy timeout。刷新失败只更新错误与调度
状态，不覆盖 `quota_snapshots`，因此 UI 可以同时展示最后成功额度和“陈旧/失败”状态。

## 6. 调度和失败处理

- 启动后延迟 5 秒，此后 Rust scheduler 每 5 秒查询到期任务；它是唯一刷新时钟。
- 基础周期可选手动、5、15、30 分钟，默认 15 分钟。
- 任一窗口达到 Warning 后有效周期为 5 分钟；全部低于 Warning 5 个百分点后恢复基础周期。
- 每账号使用 0–15 秒稳定抖动。
- 全局最大并发 4，同 Provider 最大并发 2。
- 网络/超时/5xx：5、10、20、40、60 分钟退避。
- 401/403：认证暂停，直到更新凭据。
- 429：优先 `Retry-After`，否则至少 5 分钟。
- parser/schema 错误：Provider 级熔断 30 分钟，避免同一失效解析器逐账号重复请求。
- 手动刷新可绕过普通网络/429 退避一次，不绕过认证暂停或 parser 熔断。
- 系统休眠后，调度循环恢复时立即处理数据库中已经到期的任务。

一家 Provider 的任务、并发信号量、错误状态和熔断均独立，不阻塞另外两家。

## 7. 告警、历史和导出

默认阈值是 Warning 70%、High 85%、Critical 95%，要求严格递增。`alert_states` 以
`account + alert_key + period_key + generation` 表达状态代次：同一级别不重复通知，升级时
再次通知，窗口周期改变或用量低于 Warning 5 个百分点后重新武装。告警先以 pending 状态
持久化，只有 Windows Toast 返回成功后才写入 `last_notified_at` 并清除 pending；发送失败会
在后续刷新中重试，不会被误判为已通知。OpenCode Go 的 `resetInSec` 是相对值，不作为
`period_key`；它依靠用量回落后的状态跃迁重新武装，避免每轮换算时间戳触发重复告警。

认证、网络/陈旧、parser、固定出口和恢复事件共用同一持久化健康状态。应用重启不会重新
轰炸已通知状态。

历史只记录成功快照，保留策略为关闭、7、30 或 90 天。Overview 的趋势区支持账号和时间
范围切换，SVG 图表同时提供屏幕阅读器数据表。

导出分两类：

- 最新快照 JSON：去掉账号 ID、账号标签、Credential 和 NetworkProfile 信息。
- 诊断 ZIP：只含 manifest、Provider health、应用设置和脱敏最新快照。

ZIP 内容生成与解包扫描有独立 Rust 测试；导出中不包含 Cookie、Authorization、API Key、
代理认证或本地账号标识。

## 8. 页面与交互

三个一级页面加一个详情层：

- Overview：摘要、筛选、排序（风险/名称/供应商）、网格与列表两种视图、账号卡、
  手动刷新、脱敏导出。卡片或行点击进入详情层；排序与视图偏好本地持久化。
- 账号详情抽屉：右侧滑入的详情层，从概览卡片或账号行进入，聚合该账号的额度窗口、
  连接状态、单账号历史趋势和全部账号操作（刷新/暂停/编辑/凭据/删除）。
- Accounts：添加、凭据复用/更新、标签编辑、暂停/恢复、调度诊断、本地删除；行点击进入详情层。
- Settings：刷新/阈值/历史、托盘/自启、主题/透明/隐私、固定出口、Provider 诊断和导出。

交互基线：

- 动作结果用 toast 做瞬时反馈；只有初始加载失败使用页面级错误面。
- 不可逆操作走应用内确认对话框，不使用原生 confirm。
- 空状态区分“无账号”与“筛选无结果”，后者提供一键清除筛选。
- 窗口健康档位（tone）由 Core 按用户阈值计算并随 DTO 下发；前端不持有阈值判断，
  进度条阈值刻度跟随设置上下文。
- 状态徽标按三级风险（正常/注意/危险）加中性态（陈旧/已暂停）呈现，
  状态同时有文字/图标，不只依赖颜色。
- 说明性内容不属于产品界面：架构承诺与设计理念进文档，界面只保留当下决策所需的信息。

状态包含 loading、ready、refreshing、stale-with-error、paused、empty。认证、固定出口、解析
和陈旧状态均有文字/图标，不只依赖颜色。

### 8.1 视觉基线

UI 使用 Windows 桌面语境下的克制液态玻璃，而不是复刻 macOS 原生控件：

| Surface | 用途 | 处理 |
| --- | --- | --- |
| StableSurface | 额度卡、趋势、表格 | 高不透明中性色，稳定可读 |
| ControlGlass | 侧栏、分段控制、按钮 | backdrop blur、轻折射、连续亮沿 |
| FloatingGlass | Dialog、浮层 | 更高 blur 和短时空间层级 |

关闭透明时所有表面回退到实色；`prefers-reduced-motion` 取消位移/旋转；forced-colors 使用
系统 Canvas/CanvasText/Highlight。截图隐私模式模糊账号标签和外部 ID。当前接受版本以 CSS
和 SVG 材质实现，不把原生 Mica 作为 MVP 依赖，避免远程桌面和透明关闭时出现两套外观。

窗口壳层（v0.1.8 起）为无边框透明窗口：`decorations: false` + `transparent: true`，
移除 Windows 原生标题栏；侧栏顶部的红黄绿窗口控制直接调用系统最小化/最大化/关闭，
侧栏顶部与全局顶栏通过 `data-tauri-drag-region` 承担窗口拖拽。透明关闭时壳层背景与
所有材质表面一并回退实色，窗口控制能力不变。

## 9. Windows 集成与发布

- 单实例插件：第二次启动唤起现有窗口，不创建第二个调度器。
- 托盘：左键/菜单显示主窗口，托盘启用时关闭窗口转为隐藏；菜单可显式退出。
- 开机自启：默认关闭；启用后以 `--background` 启动到托盘。设置变更同时写 OS 状态和
  SQLite，失败时回滚另一侧；托盘关闭时即使带后台参数也会显示主窗口，避免失去入口。
- Toast：提供测试通知以及额度/健康事件通知。
- 安装：Tauri NSIS；相同 identifier/version 支持安装包覆盖升级。
- 校验：每次最终构建生成 SHA-256 文件。
- 签名：本地/内部包可以无证书构建；公开分发前必须提供发布者证书，这属于发布凭据而非
  源码功能。

本地数据与彻底清理方法见 `docs/SECURITY.md`，许可证见 `LICENSE` 和
`THIRD_PARTY_NOTICES.md`。

## 10. 验收状态

### 10.1 功能与可靠性

- [x] 三家各至少 5 个账号的数据模型和同屏刷新覆盖。
- [x] 真实三家账号返回其实际窗口、重置时间和最后成功时间。
- [x] 账号暂停/恢复、凭据复用/更新、本地删除、OpenCode 多 Workspace。
- [x] 默认 TUN 与 Credential 固定出口；显式出口失败不回退。
- [x] Rust 单时钟、自适应周期、并发、退避、429、认证暂停和 Provider 熔断。
- [x] 单 Provider 故障不阻塞其他 Provider，失败不覆盖最后成功快照。
- [x] 历史、状态代次告警、重启持久化和重新武装。
- [x] 托盘、自启、单实例、脱敏 JSON/ZIP 和 NSIS 安装包。

### 10.2 安全

- [x] 上游固定 HTTPS host/path，禁用 cookie jar、自动重定向和环境/系统代理发现。
- [x] Provider 秘密和代理认证只在 WCM，SQLite schema 无秘密列。
- [x] 错误采用固定摘要，不输出代理端点、认证或底层请求正文。
- [x] WCM 写入/读取/删除、代理不回退和 allowlist 有自动测试。
- [x] 快照与诊断导出有身份移除和秘密关键字扫描测试。
- [x] `pnpm audit --prod` 无已知漏洞。
- [x] RustSec 无可达漏洞；`RUSTSEC-2023-0071` 只存在于未启用的 `sqlx-mysql → rsa` 锁文件
  路径，Windows/SQLite 构建依赖树不可达，审计时显式记录该例外。

### 10.3 UI 与性能

- [x] 浅/深色、实色、高对比、减少动态、截图隐私和 640/960/1440 宽度视觉回归。
- [x] 认证失效、陈旧、固定出口、解析、暂停、空状态均有文字/图标表现。
- [x] 图表有等效数据表。
- [x] 50 张额度卡全量渲染与滚动检查；当前无头回归环境首屏低于 2 秒。
- [ ] 生产 JS gzip 低于 120KB：v0.1.8 实测约 138KB（主包 135KB + 异步块 3KB），超限待瘦身。

### 10.4 当前证据

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 9/9（2026-08-11 复验） |
| `cargo test --lib` | 28 通过、5 忽略；另有 2 个 WCM round-trip 通过，3 个真实 Provider live test 按需运行 |
| `cargo clippy --all-targets -- -D warnings` | 通过 |
| `pnpm build` | 通过，JS 约 102KB gzip |
| `pnpm visual:check` | 15 个视觉场景 + 50 账号场景通过 |
| 真实本机数据 | 已安装实例完成 schema 5 迁移，5 账号在库（2026-08-11 复核）；三家 Provider 曾完成真实刷新 |

## 11. 后续演进

后续能力按真实需求推进，而不是被 MVP 边界永久排除：

- 经授权的浏览器凭据导入和跨设备同步。
- 账号操作、客户端联动和更细的通知规则。
- 模型请求代理/路由或使用分析；若处理请求内容，需单独设计权限、保留与清理策略。
- Linux/macOS 适配、公开签名发布和自动更新服务。
- 前端 bundle 瘦身：v0.1.8 生产 JS gzip 约 138KB，需回到 120KB 目标内（见 §10.3）。

新增能力不能把估算值冒充供应商真实额度，也不能绕过当前 Provider 请求作用域。
