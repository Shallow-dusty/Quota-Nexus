# OpenCode Go 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 账号验证（2026-07-30） |
| 契约来源 | CodexBar `OpenCodeGoUsageFetcher.swift`（MIT）+ 本仓库探针实测 |
| 最后验证 | 2026-07-30（真实 Cookie，当前 TUN 路由） |

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

## 网络出口

- NetworkProfile 绑定在 OpenCode Cookie Credential，不绑定 Workspace；一个 Cookie 枚举出的
  多个 Workspace 必须共享同一出口。
- 真实 Cookie 验证应固定使用创建该 opencode.ai 登录会话时的 HTTP(S)/SOCKS5(H) 出口。
- 未绑定时使用普通 socket，由当前系统网络栈/TUN 接管；显式出口失败不得回退。
- 快照只记录路由模式，不记录 profile、端点、认证或实际 IP。

## 响应契约（真实账号实测）

- 窗口字段：`rollingUsage` / `weeklyUsage` / `monthlyUsage` 各自包含
  `usagePercent: number` 与 `resetInSec: number`；本次三类窗口均存在。
- 百分比方向与量级已确认：`usagePercent` = 已用，当前账号原始值为 **0–100 百分比**：
  rolling 5h = 3、weekly = 84、monthly = 42。仍保留社区实现的 `≤1 → ×100`
  兼容逻辑，以应对服务端不同版本。
- 重置语义：`resetInSec` 为**相对秒数（滑动）**，重置时刻 = `now + resetInSec`
  由客户端现算——与 DESIGN.md 状态代次去重决策一致，不得把 resetsAt 当周期身份；
  相邻轮询的递减形态仍待复测。

## 绝对用量观察（P-023 取证）

- 页面存在 `credits` / `balance` key，但本次探针未提取到可归属当前账号的绝对额度值；
  暂不扩展领域模型，等待定向取证。

## 证据

- 快照：`snapshots/opencode-go-20260730T043523Z.json`（匿名：RPC 200 + 未登录标记）
- 快照：`snapshots/opencode-go-20260730T093234Z.json`（真实账号 200，workspace 已脱敏）
- 原始响应（gitignored）：`data/probe-raw/opencode-go/`

## 待验证清单

- [x] 真实 Cookie 下 workspaces RPC 返回 1 个 `wrk_…` workspace。
- [x] Go 用量页命中 rollingUsage、weeklyUsage 与 monthlyUsage。
- [x] `usagePercent` 原值为 0–100 已用百分比。
- [ ] `resetInSec` 相邻轮询漂移形态（验证滑动推断）。
- [x] 绝对用量字段初步取证：存在 key，未提取到账号绝对值（P-023）。
- [x] 当前 TUN 下页面直返 200；allowlist 不变量与显式出口失败不回退已有独立证据。
