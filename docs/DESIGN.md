# AI Quota Monitor 详细设计

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Implementation baseline |
| 设计版本 | 0.5.0 |
| 最后更新 | 2026-07-30 |
| 首要平台 | Windows 11 |
| 产品形态 | 本地桌面应用 |
| 核心原则 | 额度优先、渐进扩展、本地优先、多账号统一、失败可解释 |

## 1. 背景

OpenCode Go、Ollama Cloud 和 ClinePass 都提供订阅制模型额度，但额度展示和认证方式并不统一：

- OpenCode Go 在工作区 Dashboard 中展示 5 小时、周、月三个窗口。
- Ollama Cloud 在 Settings 页面展示套餐、Session 和 Weekly 窗口。
- ClinePass 可通过 API Key 查询 5 小时、周、月三个窗口。

现有社区工具通常只覆盖单个供应商、单个账号或特定操作系统；也有工具同时处理额度查看、
账号轮换、代理路由和模型请求日志。本项目先解决统一额度可见性，再根据实际使用需要逐步
吸收账号操作、客户端联动和请求链路能力。

本项目首先提供一个本地、可审计的统一额度层。首期不要求进入模型请求链路或接管现有
客户端，但架构不把这些能力永久排除。

## 2. 产品目标

### 2.1 核心目标

1. 在一个面板中展示三个供应商下的多个账号。
2. 统一展示不同形态的额度窗口和重置时间。
3. 定时刷新，并在额度接近耗尽或凭据失效时发送 Windows 通知。
4. 网络或上游页面失败时保留最后一次成功结果，并明确标记数据是否过期。
5. 默认使用操作系统安全存储保护凭据，避免秘密因普通配置、日志或导出而意外泄露。
6. 每个供应商适配器独立演进，单个适配器失败不影响其他供应商。
7. Provider Credential 可选绑定固定额度采集出口，使网页会话查询延续登录时的网络环境；
   显式出口失败时不得静默回退。

### 2.2 首期范围与后续演进

首个版本把开发资源集中在额度采集、统一展示、历史和告警。以下能力不作为 MVP 验收前提，
但属于允许评估的后续方向，而非永久禁止：

- 账号选择、切换、轮换和负载均衡。
- 与 OpenCode、Cline、Ollama 或其他客户端联动。
- 模型请求侧的 OpenAI-compatible 代理、路由和请求链路观测。
- 使用量分析；如确需处理提示词、回复、项目路径或代码内容，必须由用户明确开启并说明
  保留策略。
- 经用户授权的浏览器凭据导入、跨设备同步和远程面板。
- 订阅、账单和其他账号管理能力。

额度采集所需的 Credential 级固定网络出口属于 MVP 网络隔离能力：它只改变只读额度请求的
传输路径，不接管模型流量，也不提供账号轮换、代理池或负载均衡。模型请求侧代理/路由仍是
后续方向。

任何扩展都应遵守供应商条款、明确副作用，并与当前额度数据区分来源，不能把估算值冒充为
上游真实额度。

## 3. 用户场景

### 3.1 快速检查

用户打开应用后，在一个页面中看到：

- 每个账号所属供应商和自定义标签。
- 当前套餐（供应商能返回时）。
- 每个额度窗口的已用百分比、剩余百分比和重置倒计时。
- 上次成功更新时间。
- 当前认证状态和数据新鲜度。

### 3.2 后台监控

应用在托盘运行，默认每 15 分钟刷新；接近阈值时提高到 5 分钟。某个账号的周额度达到
85% 时，只针对该状态代次发送一次通知；达到 95% 时再次通知。额度明显回落后可以重新通知。

### 3.3 凭据过期

如果 OpenCode Go 或 Ollama Cloud 的 Cookie 过期，应用显示 `需要重新认证`，保留最后一次
成功额度，但不再把旧数据显示为实时结果。用户可以更新该账号凭据，不影响历史记录。

### 3.4 部分故障

如果 Ollama 页面结构变化，而 ClinePass 和 OpenCode Go 正常，主界面仍展示后两者；Ollama
账号显示适配器解析错误和最后成功时间，而不是让整个刷新任务失败。

### 3.5 固定额度采集出口

用户可将创建浏览器 Cookie 会话时使用的固定 HTTP/HTTPS 或 SOCKS5 出口绑定到对应
Credential。一个 OpenCode Cookie 即使覆盖多个 Workspace，也始终共享同一出口。未绑定时
使用普通 socket，由当前系统网络栈或 TUN 接管；显式代理不可达、认证失败或配置错误时，
应用解释为该出口失败，绝不回退到默认/TUN 出口后继续携带该凭据。

## 4. 演进原则与信任模型

### 4.1 渐进能力

Phase 0 的额度探针只访问额度查询所需的 GET 或等价只读请求，以便先确认真实接口合同。
这是一种开发顺序，不是产品永久边界。后续功能可以增加账号操作、客户端写入、模型请求
代理或推理请求，但应：

- 与额度采集适配器分离，避免副作用混入后台刷新。
- 由用户明确启用，并在执行前说明会修改或发送什么。
- 为相关 host、path、method 和凭据作用域建立可测试的权限策略。
- 对可撤销操作提供恢复方式，对不可撤销操作增加确认。

MVP 的额度采集固定出口仍遵守 Phase 0 只读边界：NetworkProfile 绑定在 Credential，
Provider allowlist 校验最终 HTTPS 目标；代理不扩大 host/path/method 权限，也不代理模型请求。

### 4.2 本地攻击边界

默认防护目标包括：

- 避免秘密意外出现在普通 JSON、明文业务表、日志、崩溃报告和 UI 调试输出中。
- 降低其他普通用户账户直接读取凭据的风险。
- 防止上游重定向或配置错误把凭据发送到非预期域名。
- 后续若增加请求内容分析，默认只记录元数据；正文采集需要用户明确开启、可关闭并可清理。

本项目不能防御已经获得当前 Windows 用户会话完全控制权的恶意软件。Windows Credential
Manager 或 DPAPI 的保护范围仍然是当前用户边界。

### 4.3 账号合法性

应用面向用户有权使用的账号和工作区。新增账号管理、共享或自动化能力时，应单独核对
供应商条款和风险，不把规避限制作为产品目标。

## 5. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│                     Tauri Desktop UI                         │
│              Overview · Accounts · Settings                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ typed commands/events
┌──────────────────────────────▼───────────────────────────────┐
│                         Rust Core                            │
│  Scheduler · Normalizer · Snapshot Store · Alert Evaluator   │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
       ┌────────▼────────┐     ┌────────▼──────────────┐
       │ Provider Layer  │     │ Local Infrastructure  │
       │ OpenCode Go     │     │ Credential Manager    │
       │ Ollama Cloud    │     │ Network Profiles      │
       │ ClinePass       │     │ SQLite · Notifications│
       └────────┬────────┘     └───────────────────────┘
                │
       allowlisted HTTPS · credential-bound route
                │
       ┌────────▼──────────────────────────────┐
       │ opencode.ai · ollama.com · cline.bot │
       └───────────────────────────────────────┘
```

### 5.1 技术选型

- 桌面壳：Tauri 2。
- 后端：Rust。
- 前端：React + TypeScript + Vite，使用 pnpm；Tailwind CSS 4 + CSS variables 承载
  设计 token 和布局。
- 行为组件：React Aria Components 是唯一行为原语库。shadcn CLI 只允许使用 `aria`
  base 按需生成由项目拥有的源码，不引入同功能的 Radix/Base UI 版本，也不继承
  shadcn 默认视觉。
- 前端数据与表单：TanStack Query、React Hook Form、Zod；图标使用 Lucide。Query
  只缓存 Rust Core 返回的脱敏 DTO，不承担业务调度或领域新鲜度判断。
- 动效：Motion for React 仅用于必要状态过渡，并遵守减少动态设置。
- 图表：实现期通过 spike 选择；要求 SVG、等效文本/表格、动态加载，实际 production
  build 的增量 chunk 目标不超过 120KB gzip，不提前把某个图库写成永久合同。
- 视觉方向：受 Liquid Glass 启发的 Windows 桌面半透明层级与微交互。这是 UI 风格，
  不代表采用 macOS/iOS 平台、窗口布局或原生 API；系统 Mica 只作为后期渐进增强。
- 首版 UI 文案采用简体中文；国际化后置。页面、组件、状态和视觉验收以 §11、§14.5
  和 §18 为准。
- 本地数据库：SQLite。
- 凭据存储：Windows Credential Manager；必要时使用 CurrentUser 范围的 DPAPI 作为后备。
- 通知：Windows Toast。
- HTTP：Rust `reqwest`；首版 Windows 构建使用 `native-tls`（reqwest 0.13 的
  `default-tls` 已是 rustls）以接入系统证书库。额度 client 禁用自动重定向和
  系统/环境代理发现；缺省发出普通 socket，由当前系统网络栈/TUN 接管，或按 Credential
  固定使用单一 HTTP/HTTPS CONNECT、SOCKS5/SOCKS5H 代理。
- 时间：数据库统一保存 UTC，UI 按本地时区显示。
- Rust 基线依赖：`sqlx`（SQLite/migrate）、`keyring-core` +
  `windows-native-keyring-store`（WCM）、`secrecy` + `zeroize`、`reqwest`、
  `tracing`、`scraper`。具体版本在实现时锁定并由依赖审计验证。

选择 Tauri 而不是 Electron 的原因：

- 常驻托盘场景下内存占用更低。
- Rust 适合实现严格的秘密类型、域名 allowlist 和解析边界。
- Windows WebView2 已是本机常见依赖。
- 后续仍可构建 Linux/macOS 版本，而不影响 Windows 优先策略。

## 6. 模块设计

### 6.1 UI 层

UI 只接收脱敏后的 View Model，不直接读取已保存的 API Key、Cookie 或代理认证。Provider
秘密与代理用户名/密码只存在于添加/更新 Dialog 的局部内存，通过一次性 Tauri command
交给后端；成功、取消、关闭或切换为已有凭据时清空。验证失败时可在未关闭的 Dialog 内暂存，以免重复粘贴，
但不得进入 Query cache、URL、日志、持久化 store 或诊断信息。

MVP 只保留三个一级页面：

1. `Overview`
   - 状态摘要、全部账号额度卡片、筛选/排序和可折叠趋势区。
   - 不计算跨供应商总 token、总余额或其他伪统一指标。
2. `Accounts`
   - 添加账号、复用已有凭据、编辑标签、更新凭据、管理固定出口、暂停监控和删除本地配置。
   - 新 Credential 可选择默认网络栈或绑定 NetworkProfile；复用 Credential 时沿用其出口，
     不能按 Account/Workspace 单独覆盖。
   - 账号详情展示下次重试、最近错误类别、连续失败次数和最后验证时间。
3. `Settings`
   - 刷新周期、托盘、自启动、通知阈值、历史保留和隐私显示。
   - 诊断区展示 Provider 健康、熔断状态、最后成功和下一次探测时间。

简单告警配置进入 Settings，历史趋势先嵌入 Overview，账号诊断进入详情；内容复杂度增长后
才提升为独立页面。预算/成本、全局搜索、工作区切换和纯装饰 3D 内容不进入 MVP。

Rust Core 输出页面专用 DTO，并用 `availableActions` 告诉 UI 当前是否允许刷新、更新凭据
或查看诊断；UI 不解析错误字符串推断动作。TanStack Query 关闭窗口聚焦、网络重连和自身
轮询刷新，默认 `staleTime: Infinity`；Rust 调度器是唯一刷新时钟，Tauri 事件只通过
`setQueryData` / `invalidateQueries` 汇入同一 cache。Query 的 `stale` 不等于领域
`freshness`，后者只能由 Core 派生。

### 6.2 调度器

调度器负责：

- 应用启动后的延迟刷新。
- 周期刷新。
- 手动刷新。
- 单账号重试和指数退避。
- 并发上限。
- 应用休眠恢复后的补偿刷新。

默认策略：

- 基础周期：15 分钟。
- 可选周期：手动、5、15、30 分钟。
- 自适应周期：账号任一窗口达到 Warning 阈值时切换到 5 分钟；仅当所有窗口均低于
  Warning 阈值 5 个百分点时恢复基础周期，避免阈值附近抖动。当前有效周期在
  Diagnostics 中可见。用户选择“手动”时关闭所有周期与自适应刷新。
- 每个账号增加 0–15 秒稳定随机抖动，避免所有账号同一时刻请求。
- 全局最大并发：4。
- 同一供应商最大并发：2。
- 成功请求不自动重试。
- 账号级网络/超时/5xx 连续失败按 5、10、20、40、60 分钟退避，成功后归零。
- 401/403：暂停该账号自动刷新，直到凭据被更新或用户显式重新验证。
- 429：优先尊重 `Retry-After`；没有该头时至少等待 5 分钟，并沿用账号级退避上限。
- 解析/schema 错误：触发供应商级适配器熔断，避免同一失效 parser 逐账号重复请求；
  保留响应结构指纹用于脱敏诊断。
- 手动刷新可绕过网络/429 退避一次，但不得绕过认证暂停或供应商级 parser 熔断。

### 6.3 Provider Adapter 接口

```rust
pub struct ProviderRequestContext<'a> {
    pub account: &'a AccountRef,
    pub secret: &'a SecretMaterial,
    pub http: &'a ScopedQuotaHttpClient,
}

#[async_trait]
pub trait QuotaProvider {
    fn id(&self) -> ProviderId;
    fn credential_kind(&self) -> CredentialKind;
    fn capabilities(&self) -> ProviderCapabilities;

    async fn validate_credentials(
        &self,
        ctx: &ProviderRequestContext<'_>,
    ) -> Result<CredentialHealth, ProviderError>;

    async fn fetch_quota(
        &self,
        ctx: &ProviderRequestContext<'_>,
    ) -> Result<ProviderSnapshot, ProviderError>;
}
```

Core 根据 Credential 解析 NetworkProfile，并构造同时绑定 Provider allowlist 与唯一网络出口
的 `ScopedQuotaHttpClient`；Adapter 不读取代理认证，也不能自行选择 fallback。适配器返回
供应商原生窗口，Normalizer 再转换为统一模型。适配器不得直接写数据库、发通知或更新 UI。

### 6.4 当前额度模块的 HTTP、网络出口与进程策略

- 当前额度 client 不启用 cookie store；每次请求在通过适配器 allowlist 后才从秘密类型中
  手工注入 Cookie/API Key。浏览器登录自动化或模型请求代理使用独立 client 和权限配置。
- `reqwest` 自动系统/环境代理发现始终关闭，路由只有两种：
  1. Credential 未绑定 NetworkProfile：发出普通 socket，由当前系统网络栈/TUN 接管；
  2. Credential 绑定 NetworkProfile：所有额度请求固定使用唯一 HTTP/HTTPS CONNECT、
     SOCKS5 或 SOCKS5H 代理。显式代理配置错误、认证失败或不可达时直接失败，不回退默认路由。
- SOCKS5 默认在本机解析目标 DNS；需要代理端解析时必须显式选择 SOCKS5H。首期不实现
  代理池、轮换、负载均衡、失败自动切换、浏览器代理接管或模型流量代理。
- Provider allowlist 始终校验最终请求的 HTTPS host/path/method；网络路由不能扩大凭据
  发送范围，也不得为显示出口 IP 擅自增加第三方 IP echo host。
- 自动重定向设为 `none`。需要跟随时最多 3 跳，每跳重新校验 HTTPS、host、path 和
  origin；只有新目标与该凭据声明的 origin 完全匹配时才重新注入秘密。
- 应用使用单实例插件。第二次启动只唤起已有窗口并转发无秘密的启动意图，避免两个进程
  同时调度和写 SQLite。
- 当前凭据与代理认证录入 IPC 采用 UI → Rust 单向提交；管理界面只返回必要的脱敏状态和
  NetworkProfile 非秘密元数据，不回显完整秘密。

## 7. 供应商适配器

### 7.1 ClinePass

#### 认证

- 用户输入 ClinePass API Key。
- 后端把 API Key 保存到 Windows Credential Manager。
- 数据库仅保存对应的 credential reference。
- Credential 默认可走当前 TUN/系统网络栈，也允许用户主动绑定固定出口。

#### 数据源

社区实现已验证的额度入口：

```text
GET https://api.cline.bot/api/v1/users/me/plan/usage-limits
```

适配器使用 API Key 认证，读取 5 小时、周、月额度窗口。实现前的探针阶段必须确认当前认证
Header、字段名称、百分比方向以及重置时间格式，不能仅根据第三方代码固化假设。

#### 归一化

| 上游概念 | 统一类型 |
| --- | --- |
| 5-hour limit | `rolling_5h` |
| Weekly limit | `weekly` |
| Monthly limit | `monthly` |

#### 风险

- 接口尚未作为长期公共合同单独承诺，字段可能变化。
- API Key 可能同时具备推理权限，因此必须严格限制发送域名和路径。

### 7.2 OpenCode Go

#### 认证

每个账号需要：

- Workspace ID。
- `opencode.ai` 登录 Auth Cookie。

额度查询不要求应用持有 Go 推理 API Key。首版不收集 API Key，以落实最小权限。同一登录
Cookie 覆盖多个 Workspace 时共享同一 Credential 和 NetworkProfile；真实验证应绑定到创建
该网页登录会话时使用的出口。

#### 数据源

适配器访问对应 workspace 的 Go/Usage Dashboard，只读取：

- 5 小时使用率和重置时间。
- 周使用率和重置时间。
- 月使用率和重置时间。
- 可选套餐标识。

探针阶段应优先寻找页面使用的结构化服务端数据；只有没有稳定结构化返回时才解析 HTML。
Phase 0 不通过额外模型请求反推额度，以免探针本身改变被测额度；这不限制未来独立的请求
路由或使用分析功能。

#### 归一化

| 上游概念 | 统一类型 |
| --- | --- |
| 5 hour | `rolling_5h` |
| Weekly | `weekly` |
| Monthly | `monthly` |

#### 风险

- 目前没有公开稳定的 Go 用量 API。
- Cookie 会过期或因用户退出登录而失效。
- 页面/服务端组件结构变化可能破坏解析。
- 一个账号可能包含多个 workspace，必须以 Workspace ID 隔离，不能按邮箱合并额度。

### 7.3 Ollama Cloud

#### 认证

- 使用 `ollama.com` 登录会话 Cookie。
- 初版为加快接口验证，采用用户手动粘贴完整 `Cookie` header。
- 后续可以增加经用户授权的浏览器 Cookie 导入，并清楚展示读取范围。
- 真实 Cookie 的额度查询应绑定到创建该网页登录会话时使用的固定出口。

#### 数据源

```text
GET https://ollama.com/settings
```

解析：

- Free/Pro/Max 套餐。
- Session usage 百分比。
- Weekly usage 百分比。
- 对应重置时间。

当前社区实现识别 `wos-session` 以及历史会话 Cookie 名称。应用内部不应依赖单一 Cookie
名称，而应保存用户提供的最小化 Cookie header，并在认证失败时要求用户更新。

#### 归一化

| 上游概念 | 统一类型 |
| --- | --- |
| Session usage | `session` |
| Weekly usage | `weekly` |

#### 风险

- Ollama Cloud API Key 当前不能返回真实套餐额度。
- Settings 页面 HTML 改版会影响解析。
- 页面重定向到登录页必须识别为认证失效，不能误报解析错误。

## 8. 统一领域模型

### 8.1 Account

```ts
type ProviderId = "clinepass" | "opencode-go" | "ollama-cloud";

interface ProviderAccount {
  id: string;                 // 本地 UUID
  providerId: ProviderId;
  label: string;
  externalScope?: string;     // 例如 Workspace ID；不存秘密
  credentialId: string;       // 指向可被多个账号复用的本地 Credential
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 8.2 NetworkProfile

```ts
type ProxyScheme = "http" | "https" | "socks5" | "socks5h";

interface NetworkProfile {
  id: string;                 // 本地 UUID
  label: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  proxyCredentialRef?: string; // WCM opaque reference；用户名/密码不进 SQLite
  createdAt: string;
  updatedAt: string;
}
```

NetworkProfile 只描述额度采集固定出口。完整代理 URL、用户名和密码不得进入普通日志、快照
或 Rust → UI 额度 DTO；UI 配置页只按需读取 scheme/host/port 等非秘密元数据。删除仍被
Credential 引用的 NetworkProfile 必须失败关闭。

### 8.3 Credential

```ts
interface Credential {
  id: string;                 // 本地 UUID
  providerId: ProviderId;
  label: string;
  credentialRef: string;      // wcm:<target> 或 dpapi:<absolute-path>
  networkProfileId?: string;  // null/缺省 = 普通 socket，由当前系统网络栈/TUN 接管
  createdAt: string;
  updatedAt: string;
}
```

同一凭据可以关联多个账号。例如同一个 OpenCode 登录 Cookie 可读取多个 Workspace，
每个 Workspace 仍作为独立 `ProviderAccount` 展示和调度，但共享该 Credential 的唯一
NetworkProfile。删除账号不得自动删除仍被其他账号引用的凭据；凭据只在引用数为零且用户
确认删除时从安全存储移除。NetworkProfile 绑定只能在 Credential 层修改，不能被某个
Account/Workspace 覆盖。

### 8.4 QuotaWindow

```ts
type WindowKind =
  | "session"
  | "rolling_5h"
  | "weekly"
  | "monthly"
  | "unknown";

interface QuotaWindow {
  kind: WindowKind;
  label: string;
  usedPercent: number;
  resetsAt?: string;
  observedAt: string;
  source: "remote_api" | "dashboard";
}
```

规则：

- 数据库统一保存 `usedPercent`，范围为 0–100。
- `remainingPercent = 100 - usedPercent`，仅在 UI/API 输出边界计算，不进入持久化领域对象。
- 超出范围的上游值不得静默截断，应作为 schema error。
- 缺失 `resetsAt` 不使整个快照失败，但 UI 必须显示“重置时间未知”。
- `observedAt` 优先采用可信的上游观测时间；上游未提供时使用本次 `fetchedAt`。
- 不同供应商的额度金额或请求数不可直接相加。

### 8.5 Snapshot

```ts
interface QuotaSnapshot {
  id: string;
  accountId: string;
  plan?: string;
  windows: QuotaWindow[];
  fetchedAt: string;
  adapterVersion: string;
}
```

`freshness` 是查询时派生状态，不持久化：当
`now - fetchedAt <= max(2 × 当前有效刷新周期, 30 分钟)` 时为 `fresh`，否则为 `stale`。
手动模式按 30 分钟界限判断。修改刷新周期会立即改变新鲜度判定，不需要回写历史快照。

### 8.6 Error

```ts
type ProviderErrorKind =
  | "network"
  | "timeout"
  | "rate_limited"
  | "auth_expired"
  | "permission_denied"
  | "upstream_changed"
  | "invalid_response"
  | "unsupported_plan"
  | "internal";
```

错误对象可以保存 HTTP 状态、适配器阶段和脱敏摘要，但不得保存：

- Cookie、API Key、Authorization header 或代理认证。
- 完整代理端点、NetworkProfile 标签/ID 或实际出口 IP。
- 完整 HTML/JSON 响应中的账号身份信息。
- 请求 header 原文。

## 9. 本地持久化

### 9.1 SQLite 表

```text
network_profiles
  id TEXT PRIMARY KEY
  label TEXT NOT NULL
  scheme TEXT NOT NULL CHECK (scheme IN ('http', 'https', 'socks5', 'socks5h'))
  host TEXT NOT NULL
  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535)
  proxy_credential_ref TEXT UNIQUE
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

credentials
  id TEXT PRIMARY KEY
  provider_id TEXT NOT NULL
  label TEXT NOT NULL
  credential_ref TEXT NOT NULL UNIQUE
  network_profile_id TEXT REFERENCES network_profiles(id) ON DELETE RESTRICT
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

accounts
  id TEXT PRIMARY KEY
  provider_id TEXT NOT NULL
  label TEXT NOT NULL
  external_scope TEXT
  credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT
  enabled INTEGER NOT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

quota_snapshots
  id TEXT PRIMARY KEY
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  fetched_at TEXT NOT NULL
  plan TEXT
  adapter_version TEXT NOT NULL

quota_windows
  snapshot_id TEXT NOT NULL REFERENCES quota_snapshots(id) ON DELETE CASCADE
  kind TEXT NOT NULL
  label TEXT NOT NULL
  used_percent REAL NOT NULL
  resets_at TEXT
  observed_at TEXT NOT NULL
  source TEXT NOT NULL
  PRIMARY KEY (snapshot_id, kind)

alert_rules
  id TEXT PRIMARY KEY
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE
  window_kind TEXT
  warning_percent REAL NOT NULL
  high_percent REAL NOT NULL
  critical_percent REAL NOT NULL
  enabled INTEGER NOT NULL

alert_deliveries
  id TEXT PRIMARY KEY
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  window_kind TEXT NOT NULL
  threshold REAL NOT NULL
  state_generation INTEGER NOT NULL
  delivered_at TEXT NOT NULL

alert_window_state
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  window_kind TEXT NOT NULL
  state_generation INTEGER NOT NULL
  highest_triggered_percent REAL
  last_used_percent REAL
  PRIMARY KEY (account_id, window_kind)

adapter_health
  provider_id TEXT PRIMARY KEY
  last_success_at TEXT
  last_error_kind TEXT
  consecutive_failures INTEGER NOT NULL
  circuit_state TEXT NOT NULL
  next_probe_at TEXT

account_health
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE
  last_success_at TEXT
  last_error_kind TEXT
  consecutive_failures INTEGER NOT NULL
  next_attempt_at TEXT
```

约束和索引：

- `alert_rules` 以 `NULL` 表示“全部账号/窗口”；通过四组 partial unique index 保证全局、
  账号、窗口、账号+窗口四种作用域各只有一条规则，避免使用伪 UUID 或 `*` 哨兵值。
- 规则优先级固定为：账号+窗口 > 账号 > 窗口 > 全局。
- 告警阈值满足 `0 <= warning < high < critical <= 100`，通过数据库 `CHECK` 和领域校验
  双重保证。
- `alert_deliveries(account_id, window_kind, threshold, state_generation)` 唯一。
- `quota_snapshots(account_id, fetched_at DESC)` 建索引。
- `network_profiles` 只保存 label/scheme/host/port 和 opaque proxy credential reference；
  URL 不允许内嵌认证，Credential 引用存在时删除 NetworkProfile 必须被 `RESTRICT` 拒绝。
- 外键删除行为必须在 migration 中显式声明。
- SQLite 每次连接启用 `foreign_keys=ON`、WAL 和 5 秒 `busy_timeout`；schema 只通过
  `sqlx migrate` 演进。

### 9.2 历史保留

默认保留 30 天；用户可选择 7、90 天或不保存历史。启用历史时：

- 最近 24 小时：保留每次成功快照。
- 第 2 天至保留上限：每小时保留一条。
- 选择 90 天时，第 31–90 天每天保留一条。

清理只涉及监控快照，不删除账号或凭据。

### 9.3 Provider 凭据与代理认证

Provider 秘密存储分两级，代理认证在 MVP 中固定使用 WCM：

```text
wcm:   AIQuotaMonitor/Credential/<credential-uuid>
wcm:   AIQuotaMonitor/NetworkProfile/<network-profile-uuid>
dpapi: <absolute-path-to-encrypted-provider-secret-file>
```

首期存储策略：

- Windows Credential Manager 的 Generic Credential blob 上限为 2560 bytes。序列化秘密
  不超过 2400 bytes 时可保存到 WCM；超过阈值时使用 CurrentUser 范围 DPAPI 加密后写入
  应用数据目录，并采用同目录临时文件 + 原子替换以及仅当前用户可读的 ACL。
- 业务数据库默认只保存带 `wcm:` / `dpapi:` 前缀的 opaque reference，不保存明文秘密。
- 代理用户名和密码序列化后保存到 NetworkProfile 专用 WCM Generic Credential；SQLite 只
  保存 label、scheme、host、port 和 opaque reference。代理认证不使用 Provider 的 DPAPI
  文件，也不能与 Provider Cookie/API Key 混存。
- UI、日志和普通导出不回显 Provider 秘密、代理用户名/密码或完整代理端点。
- 更新凭据采用覆盖写，旧值不进入历史。
- 删除最后一个账号引用时，由用户确认是否同时删除 Provider 安全存储条目；删除
  NetworkProfile 前必须先解除所有 Credential 引用，并确认删除其代理认证条目。
- 诊断包默认不包含秘密或 NetworkProfile 端点；未来如提供用户主动选择的加密备份，应
  作为独立导出类型。
- 首期不采用“SQLite 加密字段 + 同目录 key.bin”的设计。以后若需要跨平台 vault 或
  账号迁移，可以重新评估经过审计的加密存储方案。

## 10. 告警设计

### 10.1 默认阈值

| 级别 | 已用额度 |
| --- | --- |
| Warning | 70% |
| High | 85% |
| Critical | 95% |

用户可以全局修改，也可以按账号和窗口覆盖。

### 10.2 去重

告警使用“状态代次 + 阈值”去重，不把可能漂移的 `resetsAt` 当作周期身份：

```text
account_id + window_kind + state_generation + threshold
```

规则如下：

1. 每个账号窗口持久化当前 `state_generation` 和已触发的最高阈值。
2. 用量向上跨越一个或多个阈值时，同一轮只投递最高级别，避免从 60% 跳到 96% 时连续
   弹出三条通知。
3. 用量降至 Warning 阈值以下至少 5 个百分点后，递增 `state_generation` 并重新武装。
   这同时覆盖窗口正常重置及没有可靠 `resetsAt` 的供应商。
4. 异常小幅回落不重新武装；Parser 必须保留上一成功值供判断。
5. `alert_deliveries` 至少保留 180 天，以避免应用重启或历史快照清理导致短期重复通知。

### 10.3 特殊通知

- 认证失效：首次检测时通知，之后每 24 小时最多提醒一次。
- 数据陈旧：连续 3 次失败且最后成功数据超过 30 分钟时通知。
- 恢复：认证或适配器从失败恢复时可选通知。
- 静默时段仍写入 `alert_deliveries`，但不显示 Toast，静默结束后不补发。额度、认证、
  陈旧和恢复通知都遵循同一静默规则。

## 11. UI 信息架构

### 11.1 材质系统

Liquid Glass 只表达空间层级，不改变 Windows 平台定位。所有表面归入三类：

| 表面 | 用途 | 规则 |
| --- | --- | --- |
| `StableSurface` | 额度卡、趋势图、表格、表单和长文本 | 低透明或不透明，以可读性为先 |
| `ControlGlass` | 侧栏、工具栏、筛选条和分段选择器 | 中等透明、柔和高光 |
| `FloatingGlass` | Tooltip、Popover、菜单、Toast、Dialog | 玻璃感最强，但面积小、停留短 |

Layer-1 必须交付每种 surface × 浅/深色的材质参数表，包含 blur、saturate、背景不透明度
下限、1px 内高光、渐变边缘、阴影层级和 fallback。对浅/深色、聚焦/失焦、系统透明
开/关组合，以应用允许透出的最亮/最暗背景样本测试最终合成结果；正文至少满足 4.5:1。
不能满足时提高表面不透明度或启用 `GlassFallback`。不在长列表、图表主体或大面积数据区
使用 Acrylic；Mica 放到发布前视觉硬化阶段，关闭透明、旧系统或远程桌面时必须无损回退。

### 11.2 Overview 布局

```text
┌────────侧栏────────┬──────────────────内容───────────────────┐
│ 概览               │ 页面标题       筛选/排序       刷新      │
│ 账号与连接         ├─────────────────────────────────────────┤
│ 设置               │ 健康摘要 · 最高风险 · 最近重置 · 刷新态 │
│                    ├─────────────────────────────────────────┤
│                    │ 账号卡网格（2–3 列，自适应）             │
│                    ├─────────────────────────────────────────┤
│                    │ 历史趋势（有数据时出现，可折叠）          │
└────────────────────┴─────────────────────────────────────────┘
```

摘要只展示可以跨账号比较的状态：

- 正常账号数 / 已启用账号数，并以次级 badge 显示 Warning 及以上窗口数。
- 当前最高使用率窗口及所属账号。
- 最近一次重置及倒计时。
- 最后一次全局刷新和失败数。

不同供应商、不同周期以及 token / 金额 / 请求数不可相加。只有上游明确返回同口径绝对值
时，才在对应账号的对应窗口内展示。宽屏账号卡采用 2–3 列，窄窗退为单列，侧栏折叠为
图标栏；初始最小支持窗口为 `960 × 640`，实现验证后再锁定。

### 11.3 ServiceQuotaCard

账号卡是首个领域组件，包含：

- Provider 图标、账号标签、可选套餐和健康徽标。
- 上次成功时间、数据新鲜度、卡片刷新和更多操作。
- 1–3 个 `QuotaWindowRow`，账号卡与卡内窗口均按最危险状态优先排序。
- 每个窗口固定展示窗口名、已用/剩余百分比、线性进度、重置倒计时和状态文本。
- 重置时间缺失时显示“重置时间未知”，不臆造倒计时。
- 刷新失败时保留最后成功值，同时明确显示陈旧状态、错误类别和最后成功时间。

圆环不进入 MVP，避免为不同窗口数建立特例视觉路径；固定排序与卡片重排进入增强层。
Provider 品牌色只用于图标或装饰，不承担健康语义。正常、提示、警告、危险、陈旧均采用
图标 + 文本 + 颜色，不让颜色成为唯一信号。

### 11.4 状态与刷新

组件从第一版覆盖五种数据状态：

1. `initial-loading`：骨架屏，不显示伪造数字。
2. `ready`：成功数据。
3. `refreshing`：保留现有数据，只显示局部进度。
4. `stale-with-error`：保留最后成功值并解释失败。
5. `empty`：解释下一步并提供添加账号入口。

认证失效直接提供“更新凭据”；解析器变化提供诊断而不要求用户反复录入。顶部全局刷新
展示完成进度，单卡可独立刷新；能力与禁用原因完全来自 `availableActions`。现有卡片在
刷新时不消失，普通成功不弹 Toast，跨页面结果或需要行动的问题才使用 Toast。“刷新中”
不暗示尚未实现的请求取消能力。

### 11.5 添加账号与凭据复用

添加账号使用分步 Dialog：

1. 选择 Provider。
2. 展示所需字段和最小获取说明。
3. 选择凭据来源：
   - 使用已有凭据：只显示同 Provider 的凭据标签、关联账号数、网络出口模式和最后验证时间；
   - 新建凭据：填写凭据标签和秘密。
4. 新建凭据选择网络出口：默认网络栈、已有 NetworkProfile，或新建固定出口；新建出口只
   显示 scheme/host/port，代理用户名/密码使用一次性秘密输入。
5. 填写账号标签及 Workspace 等非秘密作用域。
6. 使用选定出口验证连接，成功后保存并返回 Overview。

复用已有凭据时只提交 `credential_id`，不传输秘密，也不显示 API Key/Cookie 派生尾缀；
其 NetworkProfile 随 Credential 复用，若修改必须明确提示会影响所有关联账号。帮助说明在
宽窗口使用右侧面板，在窄窗口退为 Dialog 内的可折叠区域。认证、固定出口和 Provider
解析错误使用不同文案与动作。

### 11.6 组件层级

组件按实际页面需求、自下而上实现，不提前生成未使用空壳：

1. 设计基础：tokens、`StableSurface`、`ControlGlass`、`FloatingGlass`、
   `GlassFallback`。
2. 通用控件：Button、IconButton、表单控件、SegmentedControl、Tooltip、Popover、
   Dialog、Toast、StatusBadge、ProgressBar、Skeleton、EmptyState、ErrorState。
3. 额度领域：ServiceQuotaCard、QuotaWindowRow、AccountHealthBadge、RefreshControl、
   AccountEditor、CredentialField、ProviderConnectionTest、TrendChart。
4. 体验增强：截图隐私模式、命令面板、卡片重排、预测/热力图/成本图和装饰性 3D 内容。

### 11.7 交互、无障碍与隐私

- 所有控件具有可见焦点环和正确 Tab 顺序；Dialog/Popover 关闭后焦点回到触发点。
- `Esc` 关闭最上层浮层；如使用 `Ctrl+R` 刷新额度，必须阻止 WebView 重载。
- Tooltip 不承载唯一信息，键盘聚焦同样可以触发。
- 遵守 `prefers-reduced-motion`：取消位移、弹性和背景漂移，只保留短淡入淡出。
- 默认不展示邮箱；账号使用自定义标签，Workspace ID 默认部分遮挡。
- 截图模式可一键隐藏账号标签和外部 ID。
- 图表提供同等信息的文本摘要或表格。

## 12. 本地接口与扩展

首版桌面应用不需要开放网络端口，以减少 MVP 实现面；后续可按集成需求增加本地接口。

后续可选本地只读接口：

```text
GET /v1/health
GET /v1/accounts
GET /v1/snapshots/latest
```

MVP 同时提供“导出最新快照为 JSON”操作，复用脱敏后的领域 DTO，不包含凭据引用、账号
身份字段或历史原始响应；该导出不要求启用本地 HTTP 接口。

约束：

- 默认关闭。
- 仅绑定 `127.0.0.1`。
- 拒绝非 loopback Host。
- 返回额度数据，不返回 credential reference。
- 如允许其他本机程序访问，使用高熵随机本地 token；token 写入 Windows Credential
  Manager，创建时只显示一次，之后只能轮换，不能从 UI 回显。

这样可以支持 Rainmeter、命令行、Grafana Agent 或个人脚本，而不把桌面应用演变为代理网关。

## 13. 诊断与日志

### 13.1 日志等级

- `INFO`：刷新开始/结束、账号本地 UUID、窗口数量、耗时。
- `WARN`：认证失效、429、数据陈旧、缺少非关键字段。
- `ERROR`：解析失败、数据库失败、安全边界拒绝。

### 13.2 默认脱敏

当前额度模块的默认日志不记录：

- API Key、Cookie 值或 Authorization header。
- 代理用户名、密码、完整代理端点、NetworkProfile 标签/ID 或实际出口 IP。
- 完整 Workspace ID。
- 邮箱、用户名和组织名称。
- 上游完整响应正文。
- 未脱敏的用户目录绝对路径。

Release 日志过滤器不得开启 `reqwest` / `hyper` 等依赖的 debug/trace 输出；依赖内部诊断
可能包含代理 URI，不能依赖事后字面量替换兜底。显式代理底层错误统一转换为固定安全摘要。

默认可以记录：

- 本地账号 UUID 的短前缀。
- HTTP 状态码。
- 网络路由模式（`default_tun_or_process_route` / `explicit_fixed_proxy`）和粗粒度失败类别，
  不记录具体 profile 或端点。
- allowlist 路径 ID。
- 响应 schema 指纹。
- 适配器版本和解析阶段。
- 用户目录路径统一替换为 `<USERPROFILE>` 后的相对形式。

如果未来的请求分析功能需要记录更多内容，应使用独立数据模型和设置项，明确采集范围、
保存时间与清理入口，不能悄悄复用诊断日志。

### 13.3 诊断导出

导出 ZIP 可以包含：

- 应用版本和 OS 版本。
- 适配器健康表。
- 脱敏日志。
- 数据库 schema 版本。
- 用户主动选择的、经过二次脱敏的响应结构摘要。

导出前显示文件清单，不自动上传。

## 14. 测试策略

### 14.1 单元测试

- 百分比归一化。
- 重置时间解析和时区转换。
- 告警阈值、状态代次、跨多阈值合并和静默时段投递。
- 日志脱敏。
- allowlist 和跨域重定向拒绝。
- NetworkProfile 协议/URL/认证字段校验、安全 Debug、默认路由与显式代理不回退。
- 新鲜度派生与自适应刷新迟滞。
- 账号退避、认证暂停和供应商级 parser 熔断。

### 14.2 Parser Fixture

每个适配器维护：

- 正常响应。
- 缺失可选字段。
- 登录页/认证失效响应。
- 页面结构变化响应。
- 非法百分比。
- 未知套餐。

Fixture 必须从真实响应脱敏后生成，不提交 Cookie、API Key、邮箱、Workspace ID 或订阅标识。

### 14.3 Contract Test

Live contract test 默认跳过，只在本地显式提供凭据时运行：

```text
AIQM_LIVE_TEST_CLINEPASS=1
AIQM_LIVE_TEST_OPENCODE_GO=1
AIQM_LIVE_TEST_OLLAMA=1
```

Live test 只验证：

- 身份认证成功。
- 至少返回一个预期窗口。
- 百分比处于 0–100。
- 测试本身不触发推理请求，避免为了测量而消耗额度。

### 14.4 集成测试

- Provider Credential Manager 写入、读取、覆盖和删除。
- NetworkProfile 代理认证的 WCM 写入/覆盖/删除、Credential 引用约束和秘密扫描。
- 超长 Cookie 的 DPAPI fallback、ACL、原子替换和引用计数删除。
- SQLite migration。
- SQLite 外键、WAL、busy timeout、唯一约束和级联删除。
- 多账号并发和失败隔离。
- 休眠/恢复。
- Windows Toast 去重。
- 单实例启动及第二次启动时唤起已有窗口。
- 默认普通 socket/TUN 路由、HTTP/HTTPS CONNECT、SOCKS5/SOCKS5H，以及显式代理不可达、
  认证失败时不回退；所有路由下 Provider allowlist 保持不变。

### 14.5 UI 测试

- 0、1、10、50 个账号的布局。
- 1、2、3 个额度窗口、未知窗口和不同窗口组合。
- 加载、刷新、陈旧、认证失效、固定出口失败、解析失败、暂停和空状态。
- 默认出口、已有 NetworkProfile、新建固定出口及复用 Credential 时不可按 Workspace 覆盖。
- 长标签、中文标签、`960 × 640` 最小窗口和 100%–200% DPI。
- 仅键盘完成添加账号、更新凭据、刷新、筛选和打开诊断。
- 浅色、深色、高对比、减少动态、系统透明开/关和远程桌面 fallback。
- 受控最亮/最暗背景下的最终合成对比度。
- 色弱模式下状态仍可由图标和文本辨识。
- 截图隐私模式。
- 50 张账号卡时滚动和状态更新无明显卡顿，静止页面没有持续昂贵动画。
- 图表增量 chunk、动态加载和文本/表格替代。

## 15. 当前额度模块的安全检查清单

进入发布前，对当前实现中适用的项目进行验证；未来新增模型请求代理、客户端写入或内容分析
能力时，应为新增能力补充相应检查，而不是把本清单解释为禁止扩展：

- [ ] 所有上游请求使用 HTTPS。
- [ ] 每个适配器有独立主机和路径 allowlist。
- [ ] HTTP client 未启用 cookie jar；Cookie/Authorization 只在请求发送前按凭据作用域注入。
- [ ] 自动重定向关闭；手动跟随不超过 3 跳，每一跳重新执行 HTTPS、host、path 和 origin
      校验，只有目标 origin 与凭据作用域完全匹配时才可重新注入秘密。
- [ ] `reqwest` 自动系统/环境代理发现关闭；未绑定 NetworkProfile 时只使用普通 socket，
      由当前系统网络栈/TUN 接管。
- [ ] 显式 HTTP/HTTPS/SOCKS5/SOCKS5H 代理命中后，配置、连接或认证失败绝不回退默认路由。
- [ ] 无论路由模式如何，代理都不能绕过最终 HTTPS host/path/method allowlist。
- [ ] 代理认证只在 Windows Credential Manager；SQLite、快照、普通日志和错误不含代理
      用户名、密码、完整端点、profile 标识或实际出口 IP。
- [ ] 日志和错误对象通过统一 redactor；显式代理底层错误使用固定安全摘要。
- [ ] SQLite 业务表不含明文 Cookie/API Key。
- [ ] 凭据删除可验证。
- [ ] 凭据录入 IPC 不回显秘密、`credentialRef` 或可逆片段。
- [ ] DPAPI fallback 文件仅当前用户可读，写入采用原子替换。
- [ ] 单实例锁生效，第二个进程不能同时写 SQLite。
- [ ] 应用卸载说明包含本地数据和 Credential Manager 清理入口。
- [ ] 更新包具备签名和校验信息。
- [ ] 依赖安全审计无高危未处理项。
- [ ] 诊断导出经过秘密扫描。

## 16. 开源与许可证策略

建议项目本身采用 MIT 或 Apache-2.0。

可参考：

- `CodexBar`：MIT，已有 Ollama Cloud 和 ClinePass 额度读取实现。
- `opencode-quota`：MIT，已有 OpenCode Go、Ollama Cloud Dashboard 解析思路。
- `opencode-m`：AGPL-3.0-or-later，已有 Windows OpenCode Go 多账号界面和解析实现。

如果直接复制或改编 AGPL 覆盖的实现，需要遵守其许可证义务。为了保持许可证简单，建议：

1. 以公开网络行为和用户自有响应为依据独立实现 OpenCode Go Adapter。
2. 优先复用 MIT 项目中可明确归属的通用解析思路。
3. 在 `THIRD_PARTY_NOTICES.md` 中记录实际复用的代码、提交和许可证。
4. 不把“看过某项目”误写成代码来源；只有实际复制或改编时才登记。

## 17. 实施阶段

### Phase 0：额度接口探针

交付：

- 三个独立命令行探针。
- 脱敏响应结构记录。
- 字段映射和认证方式验证。
- 若上游响应包含绝对用量，记录字段名、单位、分母语义以及 limit 是否随套餐或周期变化；
  若未包含，也明确记录“当前未观察到”。结果写入 `docs/provider-contracts/`，作为是否
  扩展领域模型的证据；不得为完成记录而调用推理接口或保存未脱敏原始响应。
- 明确每个请求的 host、path、method。
- 验证两类可解释路由：未绑定 NetworkProfile 时由当前系统网络栈/TUN 接管；绑定显式
  HTTP/HTTPS/SOCKS5/SOCKS5H 时固定走该出口。目标在本地网络中无法裸直连不构成失败。
- 使用本地不可达代理做无真实凭据负向测试：必须报告网络错误且不回退默认/TUN 出口。
- 真实 OpenCode/Ollama Cookie 验证使用创建网页登录会话时的出口；证据只记录路由模式，
  不记录代理端点、认证或实际 IP。
- 记录每个供应商的重置语义：绝对周期、滑动窗口或未知；未知时不得臆造周期 ID。

退出条件：

- 每个供应商至少一个真实账号成功返回额度。
- 探针本身没有模型推理请求。
- 能可靠区分认证失效、网络失败和解析失败。
- 显式代理失败不回退的负向验证通过，快照/终端秘密扫描不含代理信息。

Phase 0 进行期间可以并行建立与供应商无关的 tokens、三类 surface 和静态状态矩阵，
但在 Phase 0 退出前不得冻结 `QuotaWindowView` 等 Provider 相关 DTO。

### Phase 1：Core 与首个纵向切片

交付：

- Provider trait 与 route-bound `ScopedQuotaHttpClient`。
- Normalizer。
- SQLite schema/migration（含 NetworkProfile 与 Credential 引用）。
- Provider/代理认证的 Credential Manager 存储。
- 调度器和缓存。
- React/Tauri 基础、设计 tokens、三类 surface 和最少通用控件。
- 第一个已验证合同最稳定的 Adapter；默认选择 ClinePass。
- 添加账号 → 凭据安全存储 → 验证连接 → DTO → 单张额度卡 → 手动刷新的完整链路。

ClinePass 只有在 Phase 0 实证当前 host、path、认证 Header 和响应字段后才作为首切片；
若合同已变化或不可用，改选 Phase 0 证据中最稳定的 Provider。

退出条件：

- 一个真实账号完成端到端闭环。
- IPC、秘密流向、SQLite、DTO、状态矩阵和卡片渲染均可验证。
- SQLite 和日志秘密扫描通过。

### Phase 2：多供应商桌面面板

交付：

- 其余两个 Adapter。
- Overview、Accounts、Settings 三个一级页面。
- 账号详情诊断和 Settings Provider 诊断区。
- 手动和周期刷新。
- 多账号筛选、风险排序、部分失败、凭据复用和 NetworkProfile 管理。
- 托盘入口。
- 截图隐私模式。

退出条件：

- 多账号并发刷新通过，单个 Adapter 故障不会阻塞其他 Adapter。
- 10 个账号持续运行 24 小时无明显资源泄漏。
- 休眠恢复后能重新调度。

### Phase 3：通知与历史

交付：

- Windows Toast。
- 阈值规则。
- 告警状态代次去重。
- 7/30/90 天趋势。

退出条件：

- 同一状态代次不重复轰炸。
- 窗口重置或明确回落后正确重新武装。

### Phase 4：发布硬化

交付：

- 安装包和升级机制。
- 签名/校验。
- 脱敏诊断导出。
- 隐私说明、许可证和第三方通知。
- Mica 渐进增强、GlassFallback、完整材质参数表和视觉回归。

## 18. MVP 验收标准

功能：

- [ ] 支持至少 5 个 OpenCode Go 账号。
- [ ] 支持至少 5 个 Ollama Cloud 账号。
- [ ] 支持至少 5 个 ClinePass 账号。
- [ ] 所有账号可在同一 Overview 中刷新。
- [ ] 正确展示各供应商实际存在的窗口。
- [ ] 展示重置时间和最后成功时间。
- [ ] 支持账号级暂停和凭据更新。
- [ ] 添加账号时可复用同 Provider 的已有凭据，不回显秘密或秘密派生片段。
- [ ] Credential 可选择默认网络栈或绑定固定 NetworkProfile；同一 Credential 覆盖多个
      Workspace 时共用同一出口。
- [ ] 支持 Warning/High/Critical 通知。
- [ ] 支持导出脱敏后的最新快照 JSON。
- [ ] 支持开机自启开关，默认关闭。
- [ ] MVP 只有 Overview、Accounts、Settings 三个一级页面，诊断和趋势按 §6.1 内嵌。
- [ ] Overview 不合计异构供应商或不同窗口的 token、金额、请求数和百分比。

可靠性：

- [ ] 一家供应商不可用时另外两家继续刷新。
- [ ] Cookie 失效不会覆盖最后成功快照。
- [ ] 429 不导致紧密重试。
- [ ] 应用重启后保留账号配置、历史和告警去重状态。
- [ ] 第二次启动只唤起已有实例，不产生并行调度器。
- [ ] 显式代理配置错误、不可达或认证失败时请求失败且不回退默认/TUN 出口。
- [ ] 加载、刷新、陈旧、认证失效、固定出口失败、解析失败、暂停和空状态均有明确表现。

安全：

- [ ] SQLite 业务表、默认日志和普通诊断包中找不到明文秘密。
- [ ] 代理用户名/密码只进入 WCM；日志、快照、错误和额度 DTO 不含完整代理端点或 profile
      标识，NetworkProfile 不能绕过 Provider allowlist。
- [ ] MVP 未启用的客户端写入、外部监听和推理请求不会被后台额度刷新意外触发。
- [ ] 将来新增有副作用的能力时具备显式开关、权限说明和对应测试。

体验：

- [ ] 键盘可完成添加账号、更新凭据、刷新、筛选和打开诊断。
- [ ] 状态不只依赖颜色，图表具有等效文本/表格。
- [ ] 浅色、深色、高对比、减少动态和透明效果关闭时均可用。
- [ ] 50 张账号卡无明显滚动卡顿，静止页面没有持续昂贵动画。

## 19. 建议的实现目录

目录只在进入实现阶段时按实际需要创建，避免设计期生成空壳：

```text
06.AI-Quota-Monitor/
├─ README.md
├─ docs/
│  ├─ DESIGN.md
│  ├─ SECURITY.md
│  └─ provider-contracts/
├─ src-tauri/
│  └─ src/
│     ├─ adapters/
│     ├─ domain/
│     ├─ scheduler/
│     ├─ storage/
│     ├─ network/
│     └─ notifications/
├─ src/
│  ├─ pages/
│  ├─ components/
│  └─ api/
├─ tests/
│  └─ fixtures/
├─ THIRD_PARTY_NOTICES.md
└─ package.json
```

## 20. 已确认的首版产品决策

1. 产品名称沿用 `AI Quota Monitor`。
2. Windows 是首要开发和发布平台；架构保留 Linux/macOS 适配空间。
3. 基础刷新周期 15 分钟，并按 §6.2 在接近阈值时自适应提高到 5 分钟。
4. 历史默认保留 30 天，可选 7、90 天或不保存。
5. Ollama Cloud 和 OpenCode Go Cookie 首版以手工输入作为最短实现路径；随后可以增加
   经用户授权的浏览器导入。
6. MVP 包含脱敏后的最新快照 JSON 导出。
7. 支持系统启动时自动运行，默认关闭。
8. 额度采集固定出口进入 MVP：NetworkProfile 绑定 Credential；缺省走普通 socket/TUN，
   显式代理失败不回退，也不增加第三方 IP echo 请求。
9. 模型请求侧的账号切换、客户端联动、代理/路由和使用分析不属于首期验收项，但保留为
   正式演进方向；不能与第 8 项额度采集网络隔离混为一谈。
10. Liquid Glass 只作为 Windows UI 风格；数据面保持稳定，玻璃集中在控制层和浮层。
11. MVP 只有 Overview、Accounts、Settings 三个一级页面；诊断、趋势和简单告警内嵌。
12. 不展示跨供应商总额度；账号卡使用多窗口线性信息，圆环移出 MVP。
13. React Aria 是唯一行为原语；shadcn 只使用 `aria` base 生成源码脚手架。
14. Rust 调度器是唯一刷新时钟，TanStack Query 只缓存 Core DTO。
15. 首个纵向切片默认选 Phase 0 验证通过的 ClinePass，再扩展其余 Provider。

## 21. 参考实现与外部依据

- OpenCode Go Manager：<https://github.com/a417707897/opencode-m>
- OpenCode Go 多账号社区发布：<https://linux.do/t/topic/2554358>
- OpenCode Go 公开用量 API 请求：<https://github.com/anomalyco/opencode/issues/16017>
- OpenCode Quota：<https://github.com/slkiser/opencode-quota>
- CodexBar：<https://github.com/steipete/CodexBar>
- CodexBar Ollama Provider：
  <https://github.com/steipete/CodexBar/blob/main/docs/ollama.md>
- CodexBar Provider 数据源：
  <https://github.com/steipete/CodexBar/blob/main/docs/providers.md>
- Ollama Cloud 额度 API 请求：
  <https://github.com/ollama/ollama/issues/15663>
