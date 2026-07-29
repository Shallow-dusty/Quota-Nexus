# AI Quota Monitor 详细设计

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Implementation baseline |
| 设计版本 | 0.3.0 |
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

### 2.2 首期范围与后续演进

首个版本把开发资源集中在额度采集、统一展示、历史和告警。以下能力不作为 MVP 验收前提，
但属于允许评估的后续方向，而非永久禁止：

- 账号选择、切换、轮换和负载均衡。
- 与 OpenCode、Cline、Ollama 或其他客户端联动。
- OpenAI-compatible 代理、路由和请求链路观测。
- 使用量分析；如确需处理提示词、回复、项目路径或代码内容，必须由用户明确开启并说明
  保留策略。
- 经用户授权的浏览器凭据导入、跨设备同步和远程面板。
- 订阅、账单和其他账号管理能力。

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

## 4. 演进原则与信任模型

### 4.1 渐进能力

Phase 0 的额度探针只访问额度查询所需的 GET 或等价只读请求，以便先确认真实接口合同。
这是一种开发顺序，不是产品永久边界。后续功能可以增加账号操作、客户端写入、代理或推理
请求，但应：

- 与额度采集适配器分离，避免副作用混入后台刷新。
- 由用户明确启用，并在执行前说明会修改或发送什么。
- 为相关 host、path、method 和凭据作用域建立可测试的权限策略。
- 对可撤销操作提供恢复方式，对不可撤销操作增加确认。

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
│  Overview · Accounts · Alerts · History · Diagnostics        │
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
       │ Ollama Cloud    │     │ SQLite                │
       │ ClinePass       │     │ Windows Notifications │
       └────────┬────────┘     └───────────────────────┘
                │
       allowlisted HTTPS requests
                │
       ┌────────▼──────────────────────────────┐
       │ opencode.ai · ollama.com · cline.bot │
       └───────────────────────────────────────┘
```

### 5.1 技术选型

- 桌面壳：Tauri 2。
- 后端：Rust。
- 前端：React + TypeScript + Vite；使用 pnpm、Tailwind CSS 和 shadcn/ui。
- 首版 UI 文案采用简体中文；国际化后置。Phase 2 可以先实现结构占位，但发布前应满足
  §11 和 §18 的完整验收标准；用户提供概念图后直接同步细化设计。
- 本地数据库：SQLite。
- 凭据存储：Windows Credential Manager；必要时使用 CurrentUser 范围的 DPAPI 作为后备。
- 通知：Windows Toast。
- HTTP：Rust `reqwest`；首版 Windows 构建优先采用 `native-tls` 以使用系统证书库，
  禁用自动重定向并由应用逐跳校验目标。
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

UI 只接收脱敏后的领域对象，不直接接触 API Key 或 Cookie。凭据输入框提交后立即清空，
秘密通过一次性 Tauri command 传给后端并写入安全存储。

主要页面：

1. `Overview`
   - 所有账号的紧凑额度卡片。
   - 支持按供应商、状态、最高使用率筛选。
   - 默认把最接近耗尽的窗口放在账号卡片顶部。
2. `Accounts`
   - 添加、编辑标签、更新凭据、暂停监控、删除本地配置。
   - 不显示完整秘密；只显示是否已配置及最后验证时间。
3. `Alerts`
   - 全局阈值和账号级覆盖规则。
   - 通知静默时段。
4. `History`
   - 查看最近 7/30/90 天快照趋势。
   - 历史只保存百分比和时间，不保存请求内容。
5. `Diagnostics`
   - 适配器版本、最后请求状态、解析错误分类、数据新鲜度。
   - 提供脱敏诊断导出。

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
#[async_trait]
pub trait QuotaProvider {
    fn id(&self) -> ProviderId;
    fn credential_kind(&self) -> CredentialKind;
    fn capabilities(&self) -> ProviderCapabilities;

    async fn validate_credentials(
        &self,
        account: &AccountRef,
        secret: &SecretMaterial,
    ) -> Result<CredentialHealth, ProviderError>;

    async fn fetch_quota(
        &self,
        account: &AccountRef,
        secret: &SecretMaterial,
    ) -> Result<ProviderSnapshot, ProviderError>;
}
```

适配器返回供应商原生窗口，Normalizer 再转换为统一模型。适配器不得直接写数据库、发通知
或更新 UI。

### 6.4 当前额度模块的 HTTP 与进程策略

- 当前额度 client 不启用 cookie store；每次请求在通过适配器 allowlist 后才从秘密类型中
  手工注入 Cookie/API Key。未来浏览器登录或代理功能使用独立 client 和权限配置。
- 自动重定向设为 `none`。需要跟随时最多 3 跳，每跳重新校验 HTTPS、host、path 和
  origin；只有新目标与该凭据声明的 origin 完全匹配时才重新注入秘密。
- 当前 HTTP client 默认跟随 Windows 系统代理设置，首期不要求账号级代理；未来可以增加
  账号级代理或路由，但不能隐式扩大凭据发送范围。
- 应用使用单实例插件。第二次启动只唤起已有窗口并转发无秘密的启动意图，避免两个进程
  同时调度和写 SQLite。
- 当前凭据录入 IPC 采用 UI → Rust 单向提交；未来如增加凭据管理界面，也只返回必要的
  脱敏状态，不回显完整秘密。

## 7. 供应商适配器

### 7.1 ClinePass

#### 认证

- 用户输入 ClinePass API Key。
- 后端把 API Key 保存到 Windows Credential Manager。
- 数据库仅保存对应的 credential reference。

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

额度查询不要求应用持有 Go 推理 API Key。首版不收集 API Key，以落实最小权限。

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

### 8.2 Credential

```ts
interface Credential {
  id: string;                 // 本地 UUID
  providerId: ProviderId;
  label: string;
  credentialRef: string;      // wcm:<target> 或 dpapi:<absolute-path>
  createdAt: string;
  updatedAt: string;
}
```

同一凭据可以关联多个账号。例如同一个 OpenCode 登录 Cookie 可读取多个 Workspace，
每个 Workspace 仍作为独立 `ProviderAccount` 展示和调度。删除账号不得自动删除仍被其他
账号引用的凭据；凭据只在引用数为零且用户确认删除时从安全存储移除。

### 8.3 QuotaWindow

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

### 8.4 Snapshot

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

### 8.5 Error

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

- Cookie、API Key 或 Authorization header。
- 完整 HTML/JSON 响应中的账号身份信息。
- 请求 header 原文。

## 9. 本地持久化

### 9.1 SQLite 表

```text
credentials
  id TEXT PRIMARY KEY
  provider_id TEXT NOT NULL
  label TEXT NOT NULL
  credential_ref TEXT NOT NULL UNIQUE
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
- 外键删除行为必须在 migration 中显式声明。
- SQLite 每次连接启用 `foreign_keys=ON`、WAL 和 5 秒 `busy_timeout`；schema 只通过
  `sqlx migrate` 演进。

### 9.2 历史保留

默认保留 30 天；用户可选择 7、90 天或不保存历史。启用历史时：

- 最近 24 小时：保留每次成功快照。
- 第 2 天至保留上限：每小时保留一条。
- 选择 90 天时，第 31–90 天每天保留一条。

清理只涉及监控快照，不删除账号或凭据。

### 9.3 凭据

秘密存储分两级：

```text
wcm:   AIQuotaMonitor/<credential-uuid>
dpapi: <absolute-path-to-encrypted-secret-file>
```

首期存储策略：

- Windows Credential Manager 的 Generic Credential blob 上限为 2560 bytes。序列化秘密
  不超过 2400 bytes 时可保存到 WCM；超过阈值时使用 CurrentUser 范围 DPAPI 加密后写入
  应用数据目录，并采用同目录临时文件 + 原子替换以及仅当前用户可读的 ACL。
- 业务数据库默认只保存带 `wcm:` / `dpapi:` 前缀的 opaque reference，不保存明文秘密。
- UI、日志和普通导出不回显完整秘密。
- 更新凭据采用覆盖写，旧值不进入历史。
- 删除最后一个账号引用时，由用户确认是否同时删除安全存储条目。
- 诊断包默认不包含秘密；未来如提供用户主动选择的加密备份，应作为独立导出类型。
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

### 11.1 Overview 卡片

```text
┌ ClinePass · 主账号                         Fresh · 14:32 ┐
│ 5 小时   ███████████░░░░░  68% used   2h 14m 后重置     │
│ 周       ███████░░░░░░░░░  41% used   4d 08h 后重置     │
│ 月       ████░░░░░░░░░░░░  24% used   21d 后重置        │
└──────────────────────────────────────────────────────────┘
```

颜色不是唯一状态信号：

- 正常：图标 + 文本 `正常`。
- 接近阈值：图标 + 文本 `接近上限`。
- 认证失效：图标 + 文本 `需要重新认证`。
- 陈旧：图标 + 文本 `数据已过期`。

### 11.2 隐私显示

- 默认不展示邮箱；账号使用用户自定义标签。
- Workspace ID 默认部分遮挡。
- 截图模式可一键隐藏所有账号标签和外部 ID。

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
- 完整 Workspace ID。
- 邮箱、用户名和组织名称。
- 上游完整响应正文。
- 未脱敏的用户目录绝对路径。

默认可以记录：

- 本地账号 UUID 的短前缀。
- HTTP 状态码。
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

- Credential Manager 写入、读取、覆盖和删除。
- 超长 Cookie 的 DPAPI fallback、ACL、原子替换和引用计数删除。
- SQLite migration。
- SQLite 外键、WAL、busy timeout、唯一约束和级联删除。
- 多账号并发和失败隔离。
- 休眠/恢复。
- Windows Toast 去重。
- 单实例启动及第二次启动时唤起已有窗口。

### 14.5 UI 测试

- 0、1、10、50 个账号的布局。
- 长标签、中文标签和高 DPI。
- 键盘导航。
- 色弱模式下状态可辨识。
- 截图隐私模式。

## 15. 当前额度模块的安全检查清单

进入发布前，对当前实现中适用的项目进行验证；未来新增代理、客户端写入或内容分析能力时，
应为新增能力补充相应检查，而不是把本清单解释为禁止扩展：

- [ ] 所有上游请求使用 HTTPS。
- [ ] 每个适配器有独立主机和路径 allowlist。
- [ ] HTTP client 未启用 cookie jar；Cookie/Authorization 只在请求发送前按凭据作用域注入。
- [ ] 自动重定向关闭；手动跟随不超过 3 跳，每一跳重新执行 HTTPS、host、path 和 origin
      校验，只有目标 origin 与凭据作用域完全匹配时才可重新注入秘密。
- [ ] 系统代理不能绕过 allowlist；Phase 0 在 Windows 系统代理开启/关闭两种状态下验证。
- [ ] 日志和错误对象通过统一 redactor。
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
- 验证 Windows 系统代理开启/关闭时的请求行为、证书信任和 allowlist 不变量。
- 记录每个供应商的重置语义：绝对周期、滑动窗口或未知；未知时不得臆造周期 ID。

退出条件：

- 每个供应商至少一个真实账号成功返回额度。
- 探针本身没有模型推理请求。
- 能可靠区分认证失效、网络失败和解析失败。

### Phase 1：Core

交付：

- Provider trait。
- 三个 Adapter。
- Normalizer。
- SQLite schema/migration。
- Credential Manager。
- 调度器和缓存。

退出条件：

- 多账号并发刷新通过。
- 单个 Adapter 故障不会阻塞其他 Adapter。
- SQLite 和日志秘密扫描通过。

### Phase 2：桌面面板

交付：

- Overview、Accounts、Diagnostics。
- 手动和周期刷新。
- 托盘入口。
- 截图隐私模式。

退出条件：

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

## 18. MVP 验收标准

功能：

- [ ] 支持至少 5 个 OpenCode Go 账号。
- [ ] 支持至少 5 个 Ollama Cloud 账号。
- [ ] 支持至少 5 个 ClinePass 账号。
- [ ] 所有账号可在同一 Overview 中刷新。
- [ ] 正确展示各供应商实际存在的窗口。
- [ ] 展示重置时间和最后成功时间。
- [ ] 支持账号级暂停和凭据更新。
- [ ] 支持 Warning/High/Critical 通知。
- [ ] 支持导出脱敏后的最新快照 JSON。
- [ ] 支持开机自启开关，默认关闭。

可靠性：

- [ ] 一家供应商不可用时另外两家继续刷新。
- [ ] Cookie 失效不会覆盖最后成功快照。
- [ ] 429 不导致紧密重试。
- [ ] 应用重启后保留账号配置、历史和告警去重状态。
- [ ] 第二次启动只唤起已有实例，不产生并行调度器。

安全：

- [ ] SQLite 业务表、默认日志和普通诊断包中找不到明文秘密。
- [ ] MVP 未启用的客户端写入、外部监听和推理请求不会被后台额度刷新意外触发。
- [ ] 将来新增有副作用的能力时具备显式开关、权限说明和对应测试。

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
8. 账号切换、客户端联动、代理/路由和使用分析不属于首期验收项，但保留为正式演进方向。

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
