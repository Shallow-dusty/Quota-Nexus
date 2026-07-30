# ClinePass 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 账号验证（2026-07-30） |
| 契约来源 | CodexBar `ClinePassUsageFetcher.swift`（MIT）+ 本仓库探针实测 |
| 最后验证 | 2026-07-30（真实 API Key，当前 TUN 路由） |

## 端点

| # | 用途 | Method | Host | Path | 认证 |
| --- | --- | --- | --- | --- | --- |
| 1 | 额度窗口查询 | GET | `api.cline.bot` | `/api/v1/users/me/plan/usage-limits` | `Authorization: Bearer <api_key>` |

## 认证

- 凭据形态：ClinePass API Key（具备推理权限，严禁发往 allowlist 外的主机/路径）。
- 请求头：`Authorization: Bearer <key>`；`Accept: application/json`。
- 失效信号：HTTP 401/403。匿名实测 401 响应体为 JSON：
  `{"error": "Unauthorized: ..."}`（端点存在且鉴权生效，已验证）。

## 网络出口

- Credential 未绑定 NetworkProfile 时禁用 reqwest 自动系统/环境代理，使用普通 socket，
  由当前系统网络栈/TUN 接管。
- ClinePass API Key 可按用户实际 API 使用环境绑定固定 HTTP(S)/SOCKS5(H) 出口。
- 本机不可达显式代理负向实测：分类为 `network_error` 且未回退；若发生回退，本次假 Key
  会直达 Provider 并返回 401，而实测未发生。快照只记录 `explicit_fixed_proxy`，不含
  profile、端点、认证或实际 IP。

## 响应契约（真实账号实测）

- 顶层结构：`{ "success": bool, "data": { "limits": [...] } }`。
- 窗口字段：`limits[].type` ∈ `five_hour` / `weekly` / `monthly`；
  `limits[].percentUsed: number`；`limits[].resetsAt: ISO8601 string | null`。
- 百分比方向与量级：`percentUsed` = **0–100 已用百分比**；本次实测 five-hour = 0、
  weekly = 0、monthly = 99。越界不得静默截断，记 schema error。
- 重置语义：`resetsAt` 为**绝对** ISO8601 时间戳（可空；空时 UI 显示"重置时间未知"）。
  本次三个窗口均为非空字符串。

## 绝对用量观察（P-023 取证）

- 真实响应除百分比外未发现绝对额度、已用量或剩余量字段；在出现新证据前不扩展领域模型。

## 证据

- 快照：`snapshots/clinepass-20260730T043519Z.json`（匿名 401）
- 快照：`snapshots/clinepass-20260730T053328Z.json`（不可达显式代理；不回退负向证据）
- 快照：`snapshots/clinepass-20260730T094427Z.json`（真实账号 200，三个额度窗口）
- 原始响应（gitignored）：`data/probe-raw/clinepass/`

## 待验证清单

- [x] 真实 API Key 返回 200 且 `success=true`。
- [x] 三个窗口同时存在；`percentUsed` 为 0–100 已用百分比。
- [x] 本次三个 `resetsAt` 均非空，合同语义为绝对 ISO8601 时间戳。
- [x] 绝对用量字段取证：当前未观察到（P-023）。
- [x] 不可达显式代理不回退默认/TUN 出口（无真实凭据负向验证）。
- [x] 当前默认 TUN 完成真实读取；证据只记录路由模式。
