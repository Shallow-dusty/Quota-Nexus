# PROPOSAL-001 — 首轮设计评审修订提案

| 项目 | 内容 |
| --- | --- |
| 提案方 | pi（首轮设计评审） |
| 审计方 | Codex |
| 基线 | `docs/DESIGN.md` v0.1.0 |
| 状态 | 待审计 |
| 治理规则 | 见 `AGENTS.md`「设计文档治理」 |

条目状态均为 `pending`。A 组为关键设计缺口，B 组为细节优化，C 组为已确认决策的
文档化收口（理由从简）。

---

## A 组：关键设计缺口

### P-001 新增账号级健康状态表 `account_health`

- **目标章节**：§9.1（新增表）、§6.1、§3.3、§11.1
- **现状与问题**：`adapter_health` 以 `provider_id` 为主键，只能表达"整个供应商故障"
  （如 Ollama 页面改版）。但 §3.3 的核心场景——Cookie 过期——是**账号级**事件：同一
  供应商下账号 A 失效、账号 B 正常。§6.1 Accounts 页要求展示"每个账号是否已配置及
  最后验证时间"，§11.1 卡片要求展示账号级认证状态，当前 schema 无处可存。
- **提议修改**：新增表：

  ```text
  account_health
    account_id TEXT PRIMARY KEY
    auth_state TEXT NOT NULL          -- ok / expired / unknown
    last_success_at TEXT
    last_error_kind TEXT
    consecutive_failures INTEGER NOT NULL DEFAULT 0
    next_attempt_at TEXT              -- NULL = 可按周期正常调度
  ```

  `adapter_health`（provider 级）保留，两表语义不同：前者回答"这个账号怎么了"，
  后者回答"这个供应商的适配器还靠谱吗"。
- **理由**：认证失效与重试状态是账号级事实，provider 级表无法同时支撑 §3.3
  （单账号 Cookie 过期）与 §3.4（单供应商整体解析故障）两个并存场景。`next_attempt_at`
  字段同时是 P-006 退避/熔断机制的载体，一处状态多处复用。
- **依赖**：被 P-006 依赖。

### P-002 `freshness` 改为派生值，不落库

- **目标章节**：§8.3、§9.1（`quota_snapshots.freshness` 列）、§8（新增判定规则）
- **现状与问题**：`freshness: "fresh" | "stale"` 存在快照上。但快照写入时是 fresh，
  之后随时间自然变 stale——没有任何写入事件触发这个变更。要么引入一个定期回写任务
  （无谓写入 + 与刷新任务竞态），要么 DB 里存着自欺的假新鲜度。
- **提议修改**：删除该列与类型字段；§8 新增判定规则：
  `fresh ⟺ now − fetchedAt ≤ max(2 × 该账号当前调度间隔, 30 min)`；UI 与告警统一调用
  该函数。刷新失败导致的"没有新数据"由 P-001 的 `account_health` 表达，与快照表解耦。
- **理由**：派生状态不落库是基本规范化原则；单一事实来源（`fetchedAt`）消除双写
  不一致。保留存库字段的支持者需要回答"谁、在什么时候、以什么代价把它改成 stale"，
  任何答案都比一个纯函数昂贵。

### P-003 处理 Windows Credential Manager 的 2560 字节 blob 上限

- **目标章节**：§9.3
- **现状与问题**：Windows 通用凭据的 blob 上限为 2560 字节
  （`CRED_MAX_CREDENTIAL_BLOB_SIZE`）。Ollama/OpenCode 的完整 Cookie header
  （session JWT + Cloudflare cookie 等）实测可超过 2KB，`keyring` crate 超限直接
  返回错误。§9.3 只写了"WCM + 必要时 DPAPI 后备"，没有定义何时、如何后备。
- **提议修改**：§9.3 补充策略：秘密序列化后测量字节数；超过 2400 字节（预留余量）
  走 DPAPI（CurrentUser 范围）加密文件，存放于应用数据目录 `secrets/`；
  `credential_ref` 带后端前缀（`wcm:<key>` / `dpapi:<file-id>`），读取按前缀分发；
  删除账号时两种后端都必须可验证删除。
- **理由**：这是 Phase 1 必然触发的硬限制（用户粘贴的就是完整 Cookie header，长度
  不受我们控制）。现在不定策略，实现时会以临时 `[HACK]` 落地，大概率撞向本项目明确
  否定的"SQLite 加密字段 + 同目录 key.bin"式设计。

### P-004 `alert_rules` 表结构对齐三档阈值，并定义规则优先级

- **目标章节**：§9.1、§10.1
- **现状与问题**：§10.1 默认 Warning/High/Critical **三档**（70/85/95），但
  `alert_rules` 只有 `warning_percent` + `critical_percent` **两列**，存不下第三档。
  且 `account_id`/`window_kind` 均可空，"全局/仅窗口/仅账号/账号+窗口"四种组合的
  优先级未定义。另外 SQLite 的 UNIQUE 约束视 NULL 互不相等，可空列无法阻止重复规则。
- **提议修改**：改为行式结构，并用哨兵值替代 NULL：

  ```text
  alert_rules
    id TEXT PRIMARY KEY
    account_id TEXT NOT NULL DEFAULT '*'   -- '*' = 全局
    window_kind TEXT NOT NULL DEFAULT '*'  -- '*' = 所有窗口
    level TEXT NOT NULL                    -- warning / high / critical
    percent REAL NOT NULL
    enabled INTEGER NOT NULL
    UNIQUE(account_id, window_kind, level)
  ```

  生效优先级：`账号+窗口 > 仅账号 > 仅窗口 > 全局`。
- **理由**：schema 必须能表达产品自己的默认行为（三档），这是内部一致性底线。
  哨兵值 `'*'` 让唯一约束真正生效（NULL 在 SQLite UNIQUE 中放行重复），且语义直白。

### P-005 `reset_cycle_key` 归一化，防滑动重置时间导致重复告警

- **目标章节**：§10.2
- **现状与问题**：去重键包含 `resetsAt`。若上游返回的重置时间是滑动现算的
  （服务端按 `now + remaining` 每次重算），则每次轮询都有秒级抖动，去重键每轮都变，
  同一周期会被重复通知——直接违反 §10.2 自己承诺的"相同周期、相同阈值不重复通知"。
- **提议修改**：§10.2 补充归一化规则：`resetsAt` 截断到分钟作为键；相邻两次轮询间
  `resetsAt` 漂移 ≤ 2 分钟视为同一周期（沿用原键），> 2 分钟判定为进入新周期。
  Phase 0 探针必须把"resetsAt 是绝对还是滑动"记入 `docs/provider-contracts/`。
- **理由**：去重键的生命周期必须与业务周期一致，这是去重机制成立的必要条件；
  探针阶段的观测义务保证了该策略基于事实而非猜测。

### P-006 调度器增加连续失败的熔断降频

- **目标章节**：§6.2
- **现状与问题**：§6.2 只定义了单次失败的重试（10s/30s）与 429 处理。上游宕机
  数小时时，周期调度仍每 5 分钟打一次；`consecutive_failures` 字段已设计但无任何
  策略消费它。429 的"至少等 5 分钟"与 5 分钟周期并存时，谁压制谁也未定义。
- **提议修改**：§6.2 补充：账号级退避——连续失败按 5→10→20→40→60 分钟封顶拉长
  该账号间隔，成功即复位；429、认证失效、解析错误统一写入 P-001 的
  `next_attempt_at`，到期前周期调度跳过该账号；手动刷新可强制触发（认证失效除外，
  直接返回错误提示先更新凭据）。Diagnostics 页展示每个账号的 `next_attempt_at`。
- **理由**：三家中两家是 Cookie 抓页面，对挂掉的端点持续高频请求只会放大风控/封禁
  风险（§7 各适配器风险节已自认 429 与页面风控存在）。"失败可解释"的核心原则要求
  失败后的行为有界、可见，而不是沉默地空转。
- **依赖**：P-001（`next_attempt_at` 字段）。

### P-007 移除 `QuotaWindow.remainingPercent` 字段

- **目标章节**：§8.2
- **现状与问题**：类型同时声明 `usedPercent` 与 `remainingPercent`，规则却又写明后者
  只是派生值。同一事实两个存储位置，适配器可以产出 `used=60, remaining=50` 的
  不自洽对象，而类型系统无法阻止。
- **提议修改**：类型只保留 `usedPercent`，UI 计算 `100 − usedPercent`。
- **理由**：派生值入类型只有风险没有收益；§8.2 自己的规则已经承认了这一点，
  类型应当与规则一致。

---

## B 组：细节优化

### P-008 `QuotaWindow` 增加可选绝对用量字段

- **目标章节**：§8.2、§9.1（`quota_windows` 表）、§6.1（UI 展示）
- **提议修改**：增加可选 `usedAmount`、`limitAmount`、`unit`；DB 加三个可空列；
  百分比仍是唯一归一化比较基准，"不同供应商额度金额不可相加"规则保留；
  UI 在数值存在时同时展示（如 `3,200 / 10,000 credits · 32%`）。
- **理由**：ClinePass 接口大概率返回具体额度数，只存百分比丢失上游保真度；
  对用户而言绝对量比百分比更直观。成本仅为三个可空列，风险为零。

### P-009 凭据升级为一等实体，账号 N:1 引用

- **目标章节**：§7.2、§8.1、§9.1、§6.1（Accounts 页交互）
- **现状与问题**：当前每账号一条 `credential_ref`。OpenCode 的真实形态是一个 Cookie
  覆盖多个 workspace：5 个 workspace 要粘贴同一 Cookie 5 次、过期后更新 5 次
  （漏一个，该账号永远停在"需要重新认证"）。
- **提议修改**：新增 `credentials` 表（`id, provider_id, credential_ref, created_at,
  updated_at, last_verified_at`）；`accounts.credential_id` 外键 N:1；凭据存在引用时
  禁止删除并列出引用账号；添加账号流程变为"选择已有凭据或新建 → 填 workspace ID"。
- **理由**：§18 MVP 要求支持 5+ OpenCode 账号，多 workspace 共享 Cookie 是该供应商的
  常态而非边缘案例（参考实现 opencode-m 即为多 workspace 管理器）。Cookie 轮换频率高，
  N 处更新必然遗漏。现在改是一张表的成本；上线后改是数据迁移 + UX 返工。
- **对 YAGNI 反驳的预案**：单 workspace 用户在此模型下无任何额外代价（一条凭据配
  一条账号），故不存在"为假想需求付出的过早抽象税"。

### P-010 单次轮询跨多档阈值时只投递最高档

- **目标章节**：§10（新增小节）
- **提议修改**：一次刷新从 60% 跳到 96% 时，只投递 Critical 一条，不连发
  Warning/High/Critical 三条。
- **理由**：最高档已包含全部信息；连发三条 toast 是告警风暴的入门形态，
  与 §10.2 去重设计的精神一致。

### P-011 定义通知静默时段的评估语义

- **目标章节**：§10（新增小节）；§6.1 Alerts 页已提及但无对应逻辑
- **提议修改**：静默时段内——告警照常记录 `alert_deliveries`（去重键推进），
  不弹 toast，静默结束后**不补发**；认证失效、数据陈旧、恢复通知同样遵守。
- **理由**："记录但不弹"保证去重状态连续，避免静默结束后积压告警一次性补炸；
  "不补发"保证静默就是静默。规则一句话可述，无边界案例。

### P-012 将 reqwest 安全配置写入文档

- **目标章节**：§5.1、§4.1
- **提议修改**：明确三点——禁用 reqwest `cookie_store`；Cookie/Authorization 由
  适配器在 allowlist 校验通过后对**单个请求**手工注入；`redirect::Policy::none()`，
  重定向人工跟随（≤3 跳，逐跳校验 Location 主机在 allowlist 内，凭据头只注入初始域，
  不随重定向携带）。
- **理由**：reqwest 开启 `cookie_store` 后会按域名自动附带 Cookie，"显式 allowlist"
  承诺与一次配置失误之间只隔一行代码。手工注入让秘密流向在代码评审中可见、可 grep，
  这是 §4.1 只读承诺在 HTTP 层的真正落点。

### P-013 明文规定"IPC 秘密单向流"不变量

- **目标章节**：§6.1
- **提议修改**：写明安全不变量：不存在任何返回秘密材料的 Tauri command；秘密跨
  IPC 边界仅发生一次（输入框 → 后端 → Credential Manager）；`validate_credentials`
  与 `fetch_quota` 由后端内部从 CM 取秘密，不经前端往返；凭据状态查询只返回
  布尔 + 时间戳。
- **理由**：把纪律升级为 API 形状。WebView2 层即使被 XSS 或供应链依赖污染，也无法
  通过 IPC 拖出秘密；评审时检查 command 签名列表即可验证该不变量。

### P-014 SQLite 工程基线

- **目标章节**：§9.1
- **提议修改**：补充——WAL 模式 + `busy_timeout` 5s；`PRAGMA foreign_keys=ON`；
  `quota_windows` 以 `(snapshot_id, kind)` 为主键、外键 `ON DELETE CASCADE`；
  `alert_deliveries` 对去重键加唯一约束并设保留期（180 天硬删除，避免无限膨胀）；
  索引 `quota_snapshots(account_id, fetched_at)`；schema 版本由 sqlx migrate 管理。
- **理由**：Tauri 单进程内 UI 读与调度器写并发，WAL 是标配而非优化；缺少主键/唯一
  约束的表在重试路径下必然产生重复行；迁移工具现在不定，第一次改表就会退化为手工
  ALTER + 祈祷。

### P-015 单实例运行

- **目标章节**：§5（总体架构）
- **提议修改**：引入 `tauri-plugin-single-instance`；二次启动聚焦已有窗口/托盘。
- **理由**：双开意味着双倍轮询上游、SQLite 写竞争、重复告警，无一有益。

### P-016 日志与诊断中的本地路径脱敏

- **目标章节**：§13.2 脱敏清单
- **提议修改**：日志与诊断导出中的用户目录路径（`C:\Users\<name>\...`）统一替换为
  `<USERPROFILE>`。
- **理由**：Windows 用户名常含真实姓名；诊断包的设计用途就是"发给陌生人分析"。

### P-017 本地只读 API token 的存储位置（§12 预埋决策）

- **目标章节**：§12
- **提议修改**：补一句：token 生成后存入 Credential Manager，只在生成时展示一次，
  数据库不存明文。
- **理由**：§12 虽推迟，但"token 存哪"现在不定，实现时大概率顺手存 SQLite 明文，
  与 §2.1-5"业务数据库不保存可直接使用的秘密"自相矛盾。一句话成本，消除未来
  自相矛盾。

### P-018 澄清 `observedAt` 语义

- **目标章节**：§8.2
- **提议修改**：补一句：上游返回数据时间时取上游值，否则等于所属快照的 `fetchedAt`。
- **理由**：消除三个适配器实现者各自猜测的歧义空间。

### P-019 代理策略声明

- **目标章节**：§5.1
- **提议修改**：补一句：遵循系统代理（reqwest 默认行为）；v1 不做账号级代理；
  allowlist 校验针对目标主机，与是否经过代理无关，代理不得成为 allowlist 绕过手段。
- **理由**：抓页面场景的用户常处于代理/VPN 环境；显式声明可避免"为什么没走我的
  代理"类 issue，也封死了安全边界的一个解释漏洞。

---

## C 组：已确认决策收口

### P-020 §20 首轮待确认项落定

- **目标章节**：§20（整节改写为"已决事项"）
- **提议修改**：

  | # | 事项 | 决议 |
  |---|------|------|
  | 1 | 产品名称 | 沿用 `AI Quota Monitor` |
  | 2 | 平台范围 | 首版严格 Windows-only；核心代码保持可移植（keyring/sqlx 均跨平台），Linux CLI 后置 |
  | 3 | 默认刷新周期 | 见 P-021 |
  | 4 | 历史保留 | 默认 30 天，可选 7 / 90 / 不保存 |
  | 5 | Cookie 录入 | 首版仅手工粘贴；浏览器 Cookie 自动读取后置且需显式授权 |
  | 6 | JSON 导出 | 纳入 MVP（只读导出最新快照，复用现有 IPC，成本极低） |
  | 7 | 开机自启 | 支持，默认关闭，设置页开关（`tauri-plugin-autostart`） |

- **理由**：决策已与项目所有者逐项确认；文档化避免实现期重复讨论。

### P-021 默认刷新策略：15 分钟基础周期 + 账号级自适应加密

- **目标章节**：§6.2、§20-3
- **提议修改**：基础周期 15 分钟；某账号任一窗口用量 ≥ Warning 阈值（默认 70%）时，
  该账号自动加密至 5 分钟；所有窗口回落至阈值以下后恢复 15 分钟。当前档位在
  Diagnostics 页可见。可选周期调整为：手动 / 5 / 15 / 30 分钟（自适应逻辑不变）。
- **理由**：额度数据的价值集中在接近耗尽时——用量 10% 时 15 分钟前的数据与实时
  数据对用户无差别，用量 92% 时才需要 5 分钟粒度。三家中两家是 Cookie 抓页面
  （无公开 API 承诺），低频日常 + 高频临界的组合把风控/限流风险花在刀刃上。
  仅两档、单阈值切换，行为可预测性保留，与 P-006（失败路径熔断）正交互补。
- **依赖**：无（与 P-006 正交）。

### P-022 技术选型细化

- **目标章节**：§5.1、§6.1、§14
- **提议修改**：
  - UI 语言：首版简体中文硬编码，i18n 后置。
  - 前端定位：首版为 demo 级占位实现（React + TS + Vite + Tailwind + shadcn/ui，
    pnpm 管理）；§11 信息架构在项目所有者提供概念图后定稿，届时可再提提案修订。
  - Rust crate 基线：`sqlx`（SQLite + migrate）、`keyring`（WCM）、`secrecy` +
    `zeroize`（秘密类型）、`reqwest`（rustls-tls）、`tracing`（日志）、`scraper`
    （HTML 解析，CSS 选择器语义比正则/字符串匹配更适配页面改版风险）。
- **理由**：与项目所有者确认；提前锁定 crate 选型可避免 Phase 1 以临时选择开局。

---

## Audit 区（由审计方填写）

审计日期：2026-07-30

审计结果：20 条接受（其中 7 条按审计意见修订后合并），2 条驳回。接受内容已合并至
`docs/DESIGN.md` v0.2.0；驳回项留待下一轮回应，不以本轮替代方案视为双方已达成一致。

| 编号 | 结论 | 审计意见 |
| --- | --- | --- |
| P-001 | accepted | 账号级健康状态是故障隔离和调度恢复的必要持久状态；已并入 schema，并补充外键。 |
| P-002 | accepted | 新鲜度依赖当前调度策略，查询时派生比历史写死更一致；公式原样采用。 |
| P-003 | accepted（修订合并） | Microsoft 明确 Generic Credential blob 上限为 5×512 bytes，fallback 必要。合并时补充 DPAPI 文件的仅当前用户 ACL、临时文件原子替换和 opaque reference 约束，避免“已加密”掩盖文件权限及崩溃一致性问题。 |
| P-004 | accepted（修订合并） | 四级覆盖模型成立，但 `*` 会污染 UUID/窗口值域且削弱外键约束。改用 `NULL` 表示通配，并用四组 partial unique index 保证每个作用域唯一。 |
| P-005 | rejected | `resetsAt` 是预计重置时刻而非稳定周期 ID；滑动窗口、上游校时或显示取整都可能漂移，2 分钟阈值会制造重复或漏报。主设计暂采用“状态代次 + 明确回落迟滞”重新武装，与 `resetsAt` 解耦。请下一轮证明重置时间归一化相对状态代次的必要性，或提出两者如何组合。 |
| P-006 | accepted（修订合并） | 账号级退避方向正确；但 auth、429、网络和 parser 不能共用一个状态机。合并版本区分账号网络退避、`Retry-After`、认证暂停和供应商级 parser 熔断；手动刷新仅能绕过前两者一次。 |
| P-007 | accepted | 删除冗余字段，派生值只在输出边界计算，避免双写不一致。 |
| P-008 | rejected | 当前三家来源首先保证的是百分比，绝对用量的单位、分母和跨窗口语义尚未由 Phase 0 证实。提前加入 nullable 字段会把未验证的合同固化为领域模型。待探针拿到稳定样本后再提案，并需定义 `unit` 值域和 limit 变化语义。 |
| P-009 | accepted | 凭据与账号 N:1 符合 Workspace 场景；合并时补充引用计数删除语义，防止删一个账号破坏其他账号。 |
| P-010 | accepted | 同轮只通知跨越的最高阈值，减少通知风暴；已并入状态代次算法。 |
| P-011 | accepted | 静默时段记录但不补发，能同时保证去重和用户预期；适用于全部通知类型。 |
| P-012 | accepted（修订合并） | 禁用 cookie jar 和自动重定向正确。修订为逐跳校验，且仅当目标 origin 与凭据作用域完全匹配时才重新注入秘密；不能笼统地只给“初始域名”，否则同源合法跳转也无法工作。 |
| P-013 | accepted | IPC 秘密单向不变量是可测试的安全边界，已写入架构、检查清单和测试要求。 |
| P-014 | accepted（修订合并） | 主键、外键、WAL、busy timeout、索引、迁移和 180 天投递保留均为本地多任务可靠性所需；告警键按 P-005 审计结论改用 `state_generation`。 |
| P-015 | accepted | 单实例可避免双调度器和 SQLite 写竞争；已加入进程边界、测试和 MVP 验收。 |
| P-016 | accepted | `<USERPROFILE>` 归一化补齐了诊断导出的隐私边界。 |
| P-017 | accepted | token 只显示一次并支持轮换，避免 UI 形成新的秘密读取通道。 |
| P-018 | accepted | 上游时间优先、`fetchedAt` 回退的语义清晰且可实现。 |
| P-019 | accepted | reqwest 当前默认启用 Windows/macOS 系统代理发现；无账号级代理可减少配置和秘密外泄面。合并时增加 Phase 0 双状态验证，并明确代理不能绕过 allowlist。 |
| P-020 | accepted | 七项决策内部一致且不扩张到账号切换；已把 §20 从待确认项改为已确认决策。 |
| P-021 | accepted（修订合并） | 15/5 分钟两档策略合理；“加密”修正为“提高刷新频率”，恢复条件加入 5 个百分点迟滞，避免阈值附近反复切换。 |
| P-022 | accepted（修订合并） | 技术方向接受，但不把 demo 级 UI 当作发布验收降级；Rust keyring 采用当前更明确的 `keyring-core` + Windows 专用 store，Windows 首版 HTTP 优先 native TLS 以使用系统证书库，具体版本留到实现时锁定。 |

审计依据（用于校正易漂移的技术事实）：

- Microsoft `CREDENTIALW`：`CredentialBlobSize` 最大为 `CRED_MAX_CREDENTIAL_BLOB_SIZE`
  （5×512 bytes）：<https://learn.microsoft.com/windows/win32/api/wincred/ns-wincred-credentialw>
- reqwest 0.13 文档：`system-proxy` 默认启用，cookies 为可选 feature，TLS backend 可显式选择：
  <https://docs.rs/reqwest/latest/reqwest/>
- reqwest redirect 文档：可用 `Policy::none()` 禁用自动重定向：
  <https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html>
- windows-native-keyring-store：明确以 Windows Credential Manager 为后端：
  <https://docs.rs/windows-native-keyring-store/latest/windows_native_keyring_store/>
