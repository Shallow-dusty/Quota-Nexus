# Ollama Cloud 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 匿名验证（2026-07-30） |
| 契约来源 | CodexBar `docs/ollama.md` / `OllamaUsageParser`（MIT）+ 本仓库探针实测 |
| 最后验证 | 2026-07-30（匿名） |

## 端点

| # | 用途 | Method | Host | Path | 认证 |
| --- | --- | --- | --- | --- | --- |
| 1 | Cloud Usage 解析 | GET | `ollama.com` | `/settings` | Cookie |

## 认证

- 凭据形态：`ollama.com` 完整 Cookie header。社区观察到 `wos-session`
  （WorkOS AuthKit，现行）与 `__Secure-session` 等名称；**适配器不挑选 cookie 名**，
  完整发送用户提供的 header（DESIGN.md §7.3 决策）。
- 失效信号（权威判定）：HTTP 303 重定向到 `/signin`（或 WorkOS AuthKit 授权页）。
  **匿名实测确认：303 → Location: `/signin`**——必须识别为认证失效，
  不得误报解析错误（DESIGN.md §7.3 风险项）。

## 网络出口

- NetworkProfile 绑定在完整 Cookie Credential；真实验证使用创建 ollama.com 登录会话时的
  HTTP(S)/SOCKS5(H) 出口。
- 未绑定时使用普通 socket，由当前系统网络栈/TUN 接管；显式出口失败不得回退。
- 快照只记录路由模式，不记录 profile、端点、认证或实际 IP。

## 响应契约（社区来源，待真实账号复核）

- 解析区块：**Cloud Usage**。
- 套餐徽章：`Free` / `Pro` / `Max` 文本。
- 窗口字段：`Session usage`、`Weekly usage` 百分比；重置时间在 "Resets in …"
  元素的 **`data-time`** 属性（ISO 时间戳）。
- 百分比方向：页面展示语义为已用（待真实账号复核数值方向与 0-100 假设）。
- 重置语义：`data-time` 属性（**绝对**时间戳，待复核相邻轮询稳定性）。

## 绝对用量观察（P-023 取证）

- 匿名 303 无页面内容，无法观察；待真实账号运行。

## 证据

- 快照：`snapshots/ollama-cloud-20260730T043521Z.json`（匿名 303 → /signin）
- 原始响应（gitignored）：`data/probe-raw/ollama-cloud/`

## 待验证清单

- [ ] 真实 Cookie 返回 200 且命中 Cloud Usage 区块。
- [ ] Session / Weekly 百分比元素的稳定选择器（记录 HTML 结构证据）。
- [ ] `data-time` 值语义与稳定性（绝对还是滑动）。
- [ ] 套餐徽章枚举完整性（Free/Pro/Max 之外的新层级 → `unsupported_plan`）。
- [ ] 绝对用量字段存在性（P-023）。
- [ ] Windows 上以创建登录会话时的固定出口完成真实读取；显式出口失败不回退。
