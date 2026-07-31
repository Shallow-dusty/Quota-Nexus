# Ollama Cloud 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 账号验证（2026-07-31） |
| 契约来源 | opencode-quota Ollama Cloud provider（MIT）、CodexBar Cookie 兼容实现 + 本仓库实测 |
| 最后验证 | 2026-07-31（真实 API Key，当前 TUN 路由） |

## 端点

| # | 用途 | Method | Host | Path | 认证 |
| --- | --- | --- | --- | --- | --- |
| 1 | Cloud Usage API（主路径） | GET | `ollama.com` | `/api/usage` | `Authorization: <api_key>` |
| 2 | 设置页解析（兼容路径） | GET | `ollama.com` | `/settings` | Cookie |

## 认证

- 主凭据形态：Ollama API Key；请求头是原始 `Authorization: <api_key>`，不是 Bearer。
  2026-07-31 真实 Key 实测返回 HTTP 200。
- 兼容凭据形态：`ollama.com` 完整 Cookie header。社区观察到 `wos-session`
  （WorkOS AuthKit，现行）与 `__Secure-session` 等名称；**适配器不挑选 cookie 名**，
  完整发送用户提供的 header（DESIGN.md §7.3 决策）。
- API Key 失效信号：HTTP 401/403。Cookie 失效信号：HTTP 303 重定向到 `/signin`
  （或 WorkOS AuthKit 授权页）。
  **匿名实测确认：303 → Location: `/signin`**——必须识别为认证失效，
  不得误报解析错误（DESIGN.md §7.3 风险项）。

## 网络出口

- NetworkProfile 绑定在 Credential。API Key 不依赖浏览器登录会话出口；Cookie 兼容路径仍
  建议使用创建 ollama.com 登录会话时的 HTTP(S)/SOCKS5(H) 出口。
- 未绑定时使用普通 socket，由当前系统网络栈/TUN 接管；显式出口失败不得回退。
- 快照只记录路由模式，不记录 profile、端点、认证或实际 IP。

## API 响应契约（真实账号实测）

- 顶层含 `limits.session.usage`、`limits.weekly.usage`，值为 **0–1 已用比例**；适配器乘以
  100 后进入统一领域模型。
- 本次实测 session = 0.036、weekly = 0.693；响应未观察到窗口重置时间，因此 UI 显示
  “重置时间未知”，不从客户端推算。
- 响应还包含 models 列表；额度监控不使用该字段。

## Cookie 设置页兼容契约

- 当前页面标题为 `Usage · Settings`；不含字面量 `Cloud Usage` 也能成功解析，不能把该
  文本作为唯一存在性门槛。
- 套餐徽章当前实测命中 `Pro`；`Free` / `Max` 等枚举仍保留兼容。
- 窗口字段实测：
  - `Session usage`：`0.6% used`；
  - `Weekly usage`：`48.3% used`。
- 百分比方向与量级已确认：页面直接提供 **0–100 的已用百分比**。
- 两个窗口的 "Resets in …" 元素均含 **`data-time` ISO 绝对时间戳**；相邻轮询是否
  保持稳定仍待复测。

## 绝对用量观察（P-023 取证）

- 当前账号页面未展示绝对 token/请求数或分母；暂记录“当前未观察到”，在出现新证据前
  不扩展领域模型。

## 证据

- 快照：`snapshots/ollama-cloud-20260730T043521Z.json`（匿名 303 → /signin）
- 快照：`snapshots/ollama-cloud-20260730T092016Z.json`（真实账号 200，脱敏窗口证据）
- 原始响应（gitignored）：`data/probe-raw/ollama-cloud/`

## 待验证清单

- [x] 真实 API Key 访问 `/api/usage` 返回 200。
- [x] `limits.session.usage` / `limits.weekly.usage` 为 0–1 已用比例。
- [x] 真实 Cookie 返回 200 且命中 Usage 页面（兼容路径）。
- [x] Session / Weekly 百分比元素及 0–100 已用方向。
- [ ] `data-time` 值语义与稳定性（绝对还是滑动）。
- [x] 当前套餐徽章 `Pro` 可解析；未知新层级仍应进入 `unsupported_plan`。
- [x] 绝对用量字段取证：当前未观察到（P-023）。
- [x] 使用用户指定的常驻 TUN 完成真实读取；显式出口失败不回退已有独立负向证据。
