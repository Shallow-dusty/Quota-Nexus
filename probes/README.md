# Phase 0 只读探针运行手册

三个独立 CLI 探针，用于验证 ClinePass / OpenCode Go / Ollama Cloud 的真实额度接口
契约（DESIGN.md §17 Phase 0）。

## 安全模型

- **只读**：仅 allowlist 内的 host/path/method（`src/allowlist.rs`），非 HTTPS 直接拒绝；
  不调用任何模型推理接口。
- **无 cookie store**：reqwest 未编译 `cookies` feature，不可能自动按域名附带 Cookie；
  凭据仅在单个请求上手工注入。
- **固定网络出口**：每份凭据可绑定一个命名代理；显式代理失败直接报错，不会回退到
  默认/TUN 出口。未绑定时使用普通 socket，由本机 TUN/系统网络栈处理。
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

## 固定出口配置

`network_profiles` 保存探针使用的命名代理，Provider 凭据通过 `network_profile` 引用：

```json
{
  "network_profiles": {
    "opencode-login-ip": {
      "proxy_url": "socks5h://127.0.0.1:1080",
      "username": "",
      "password": ""
    }
  },
  "opencode_go": {
    "cookie": "<本机填写>",
    "workspace_id": "",
    "network_profile": "opencode-login-ip"
  }
}
```

- 支持 `http://`、`https://`、`socks5://`、`socks5h://`；推荐 SOCKS 时使用
  `socks5h`，由代理端解析目标域名。
- `proxy_url` 只能包含 scheme/host/port，不接受 path、query、fragment；用户名和密码必须
  使用独立字段，禁止写进 URL。
- `network_profile` 留空或 `null`：不使用 reqwest 自动代理，普通连接继续由当前 TUN
  或系统路由接管。
- 指定命名代理：该 Credential 的所有额度请求固定走该代理；代理不可达时返回
  `network_or_unexpected`，绝不回退到默认/TUN 出口。
- OpenCode Go / Ollama Cloud 使用网页登录 Cookie，建议绑定到创建该登录会话时使用的
  固定出口；ClinePass 可按实际 API 使用方式决定是否绑定。
- 本地探针暂把代理认证放在 gitignored 的 `credentials.local.json`；正式应用会把代理
  用户名/密码放入 Windows Credential Manager，SQLite 只保存非秘密路由元数据。

### 从 Firefox 请求头快速导入

在 Firefox DevTools 的 Network 请求上复制请求头 JSON 后，运行：

```powershell
.\probes\import-request-headers.ps1 -Provider ollama_cloud
.\probes\import-request-headers.ps1 -Provider opencode_go -NetworkProfile opencode-login-ip
```

脚本只接受匹配 Provider 域名的请求头，提取 Cookie 后原子更新 gitignored 的
`credentials.local.json`，不回显 Cookie，并保留其他 Provider 与代理配置。

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

Windows PowerShell 原生命令使用 `.\target\debug\probe_<provider>.exe`；本地代理若只监听
Windows loopback，优先原生运行，避免把 WSL2 与 Windows 的 `127.0.0.1` 误认为同一端点。

结论（verdict）含义：`success` 至少一个请求成功解析；`endpoint_reachable_auth_required`
匿名按预期被拒；`auth_expired` 凭据失效；`parse_error` 结构变化；
`network_or_unexpected` 网络/未知；`skipped` 未提供凭据。

## 网络路由验证（Phase 0 必做）

探针使用 native-tls（Windows 上即 schannel 系统证书库）。当前机器通过 TUN 接管普通
socket，因此 Windows“系统代理”开关不代表真实直连，也不作为 Phase 0 验收条件。

1. 未绑定 `network_profile`：验证请求能通过当前日常 TUN 出口，并正确分类网络/TLS 错误；
2. OpenCode Go / Ollama Cloud 绑定各自网页登录时的固定代理：验证 Cookie 请求走固定
   出口，代理不可达时不会回退；
3. ClinePass 按实际 API 使用方式选择默认 TUN 或固定代理；
4. 快照只记录 `default_tun_or_process_route` / `explicit_fixed_proxy`，不记录代理端点、
   用户名、密码或实际出口 IP。

allowlist 始终针对最终 Provider URL 校验；网络出口选择不能改变目标 host/path/method
或扩大凭据发送范围。

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
- [ ] 默认 TUN 路由与显式固定代理的行为已验证；显式代理失败不回退。
