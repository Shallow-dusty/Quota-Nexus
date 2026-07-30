# ClinePass 契约

| 项目 | 内容 |
| --- | --- |
| 验证状态 | 匿名验证（2026-07-30） |
| 契约来源 | CodexBar `ClinePassUsageFetcher.swift`（MIT）+ 本仓库探针实测 |
| 最后验证 | 2026-07-30（匿名） |

## 端点

| # | 用途 | Method | Host | Path | 认证 |
| --- | --- | --- | --- | --- | --- |
| 1 | 额度窗口查询 | GET | `api.cline.bot` | `/api/v1/users/me/plan/usage-limits` | `Authorization: Bearer <api_key>` |

## 认证

- 凭据形态：ClinePass API Key（具备推理权限，严禁发往 allowlist 外的主机/路径）。
- 请求头：`Authorization: Bearer <key>`；`Accept: application/json`。
- 失效信号：HTTP 401/403。匿名实测 401 响应体为 JSON：
  `{"error": "Unauthorized: ..."}`（端点存在且鉴权生效，已验证）。

## 响应契约（社区来源，待真实账号复核）

- 顶层结构：`{ "success": bool, "data": { "limits": [...] } }`。
- 窗口字段：`limits[].type` ∈ `five_hour` / `weekly` / `monthly`；
  `limits[].percentUsed: number`；`limits[].resetsAt: ISO8601 string | null`。
- 百分比方向：`percentUsed` = 已用百分比（字段名直证；数值范围待真实账号复核，
  越界不得静默截断，记 schema error）。
- 重置语义：`resetsAt` 为**绝对** ISO8601 时间戳（可空；空时 UI 显示"重置时间未知"）。

## 绝对用量观察（P-023 取证）

- 匿名 401 响应不含额度字段，无法观察。
- 待真实账号运行后由探针 `absolute_amount_field_candidates` 扫描确认。

## 证据

- 快照：`snapshots/clinepass-20260730T043519Z.json`（匿名 401）
- 原始响应（gitignored）：`data/probe-raw/clinepass/`

## 待验证清单

- [ ] 真实 API Key 返回 200 且 `success=true`。
- [ ] 三个窗口是否同时存在；`percentUsed` 数值方向与范围（0-100 / 0-1）。
- [ ] `resetsAt` 是否恒非空；相邻轮询间是否漂移（绝对还是滑动现算）。
- [ ] 绝对用量字段存在性（P-023）。
- [ ] 系统代理开/关两态下请求行为一致（Windows）。
