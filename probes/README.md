# Phase 0 只读探针运行手册

三个独立 CLI 探针，用于验证 ClinePass / OpenCode Go / Ollama Cloud 的真实额度接口
契约（DESIGN.md §17 Phase 0）。

## 安全模型

- **只读**：仅 allowlist 内的 host/path/method（`src/allowlist.rs`），非 HTTPS 直接拒绝；
  不调用任何模型推理接口。
- **无 cookie store**：reqwest 未编译 `cookies` feature，不可能自动按域名附带 Cookie；
  凭据仅在单个请求上手工注入。
- **不跟随重定向**：3xx 只记录脱敏后的 Location（query/fragment 剥离）。
- **凭据不出本机**：凭据文件 gitignored；原始响应写入 `data/probe-raw/`（gitignored，
  含 `DO-NOT-COMMIT.txt` 警示）；只有经 Redactor 处理的快照进入
  `docs/provider-contracts/snapshots/`（可提交）。

## 凭据获取

复制 `credentials.example.json` 为 `credentials.local.json` 并填写（**禁止提交**）：

| 供应商 | 字段 | 获取方式 |
| --- | --- | --- |
| ClinePass | `api_key` | ClinePass 账户的 API Key |
| OpenCode Go | `cookie` | 浏览器登录 opencode.ai → DevTools → Network → 任一 opencode.ai 请求 → 复制完整 `Cookie` 请求头（关键名 `auth`） |
| OpenCode Go | `workspace_id`（可选） | workspace 页面 URL 中的 `wrk_…`；留空则探针自动发现第一个 |
| Ollama Cloud | `cookie` | 浏览器登录 ollama.com/settings → DevTools → 复制完整 `Cookie` 请求头（`wos-session` 或 `__Secure-session`） |

## 运行

```bash
# 构建
cargo build -p aiqm-probes

# 匿名验证（不需要凭据；验证端点可达性与鉴权行为）
./target/debug/probe_clinepass --anonymous
./target/debug/probe_ollama_cloud --anonymous
./target/debug/probe_opencode_go --anonymous

# 真实账号验证（读取 probes/credentials.local.json）
./target/debug/probe_clinepass
./target/debug/probe_opencode_go
./target/debug/probe_ollama_cloud
```

结论（verdict）含义：`success` 至少一个请求成功解析；`endpoint_reachable_auth_required`
匿名按预期被拒；`auth_expired` 凭据失效；`parse_error` 结构变化；
`network_or_unexpected` 网络/未知；`skipped` 未提供凭据。

## Windows 系统代理两态验证（Phase 0 必做）

探针使用 native-tls（Windows 上即 schannel 系统证书库）与 reqwest 系统代理发现。
在 Windows 上分别执行：

1. 系统代理**开启**：运行三个探针，确认请求成功且证书信任无异常；
2. 系统代理**关闭**：重复一次，结果应一致；
3. 两次运行的快照都保留，差异记入对应 `docs/provider-contracts/<provider>.md`。

allowlist 针对目标主机校验，与是否经过代理无关；代理不得改变请求目标。

## 运行后动作

1. 对照探针输出更新 `docs/provider-contracts/<provider>.md` 的"响应契约"、
   "绝对用量观察"小节，勾选"待验证清单"。
2. 从 `data/probe-raw/` 整理 parser fixture 时**必须另行脱敏**（DESIGN.md §14.2）。
3. 三家均完成真实账号验证后，Phase 0 退出。

## Phase 0 退出检查清单（DESIGN.md §17）

- [ ] 每个供应商至少一个真实账号成功返回额度（verdict=success）。
- [ ] 没有模型推理请求（allowlist 与代码评审保证）。
- [ ] 能可靠区分认证失效、网络失败和解析失败（分类已有真实证据）。
- [ ] 重置语义已记录（绝对 / 滑动 / 未知）。
- [ ] 绝对用量取证完成（P-023：存在则记录语义，不存在则记录"当前未观察到"）。
- [ ] Windows 系统代理开/关两态验证通过。
