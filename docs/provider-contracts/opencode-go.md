# OpenCode Go 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 匿名验证（2026-07-30） |
| 契约来源 | CodexBar `OpenCodeGoUsageFetcher.swift`（MIT）+ 本仓库探针实测 |
| 最后验证 | 2026-07-30（匿名） |

## 端点

| # | 用途 | Method | Host | Path | 认证 |
| --- | --- | --- | --- | --- | --- |
| 1 | workspace 枚举 | GET | `opencode.ai` | `/_server?id=<fn-id>` | Cookie + RPC 头 |
| 2 | Go 用量页 | GET | `opencode.ai` | `/workspace/{wrk_…}/go` | Cookie |

请求 1 的 RPC 头（SolidStart server-fn 约定）：`X-Server-Id: <fn-id>`、
`X-Server-Instance: server-fn:<uuid>`、`Origin: https://opencode.ai`、
`Referer: https://opencode.ai/`、浏览器 UA、
`Accept: text/javascript, application/json;q=0.9, */*;q=0.8`。
已知 fn-id：`workspaces = def399…234f`（64 hex；全值见探针源码常量）。

## 认证

- 凭据形态：`opencode.ai` 完整 Cookie header（关键 cookie 名为 `auth`）。
- 失效信号（**不能只看状态码**）：匿名实测 RPC 返回 **HTTP 200**，响应体内嵌
  `actor of type "public" is not associated with an account` 错误对象。
  判定标记（小写）：`login`、`sign in`、`auth/authorize`、
  `not associated with an account`、`actor of type "public"`，或 401/403。
- 响应格式：SolidStart devalue JS 序列化（`text/javascript`），
  响应 key 由请求方 `X-Server-Instance` UUID 决定（匿名实测确认）。

## 响应契约（社区来源，待真实账号复核）

- 窗口字段：`rollingUsage` / `weeklyUsage` / `monthlyUsage` 各自包含
  `usagePercent: number` 与 `resetInSec: number`；rolling 必需，weekly/monthly 可选。
- 百分比方向：`usagePercent` = 已用；**原始值可能是 0-1 分数或 0-100 百分比**
  （社区实现含 `≤1 → ×100` 启发式），真实账号运行时必须记录原值判定。
- 重置语义：`resetInSec` 为**相对秒数（滑动）**，重置时刻 = `now + resetInSec`
  由客户端现算——与 DESIGN.md 状态代次去重决策一致，不得把 resetsAt 当周期身份。

## 绝对用量观察（P-023 取证）

- 匿名响应不含额度字段，无法观察；待真实账号运行（页面含 `quota/credits/tokens`
  等 key 的存在性扫描由探针记录）。

## 证据

- 快照：`snapshots/opencode-go-20260730T043523Z.json`（匿名：RPC 200 + 未登录标记）
- 原始响应（gitignored）：`data/probe-raw/opencode-go/`

## 待验证清单

- [ ] 真实 Cookie 下 workspaces RPC 返回 `wrk_…` 列表（多 workspace 场景枚举完整）。
- [ ] Go 用量页命中 rollingUsage（必需）及 weekly/monthly（记录存在性）。
- [ ] `usagePercent` 原值量级（0-1 / 0-100）与方向。
- [ ] `resetInSec` 相邻轮询漂移形态（验证滑动推断）。
- [ ] 绝对用量字段存在性（P-023）。
- [ ] 页面重定向行为与 allowlist 不变量；系统代理开/关两态（Windows）。
