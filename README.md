# AI Quota Monitor

AI Quota Monitor 是一个 Windows 优先的本地额度面板，用同一套界面监控多个 OpenCode Go、
Ollama Cloud 和 ClinePass 账号。当前版本聚焦额度采集、历史、告警和账号健康；架构保留继续
扩展账号操作、客户端联动或请求路由的空间。

## 当前版本

功能型 MVP 已完成：

- 三家供应商、多账号统一 Overview，展示真实额度窗口、重置时间、数据新鲜度和错误状态。
- Rust 唯一调度器：15 分钟基础周期、Warning 后 5 分钟、自适应迟滞、稳定抖动、并发限制、
  退避、429 等待、认证暂停和 Provider 解析熔断。
- 手工录入或更新凭据（支持直接粘贴 Firefox 请求头 JSON）、同 Provider 凭据复用、
  OpenCode Workspace 自动发现、账号暂停/恢复、
  本地删除，以及 Credential 级固定 HTTP(S)/SOCKS5(H) 出口。
- 7/30/90 天历史趋势、Warning/High/Critical Windows 通知、成功投递确认与失败重试、脱敏快照 JSON
  和诊断 ZIP 导出。
- 托盘运行、开机自启、截图隐私、浅色/深色/实色/高对比/减少动态适配。
- Windows Credential Manager 保存 Provider 秘密和代理认证；SQLite 只保存业务元数据、额度、
  历史、调度和告警状态。

当前代码数据库版本为 schema 5，已有本机数据会在下次启动时无损迁移。Ollama Cloud 默认使用 API Key 查询
`/api/usage`，同时保留设置页 Cookie 兼容路径；ClinePass 和两个 OpenCode Go
账号均完成真实后台刷新验证。自动验收覆盖三家各 5 个账号、50 卡片渲染、告警去重、历史、
退避、熔断、凭据共享删除、代理失败不回退、诊断脱敏和视觉矩阵。

## 技术方案

| 层 | 实现 |
| --- | --- |
| 桌面 | Tauri 2，Windows WebView2，NSIS 安装包 |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4、React Aria、Lucide |
| 后端 | Rust、reqwest、sqlx/SQLite、Tauri plugins |
| 凭据 | Windows Credential Manager |
| 网络 | 默认普通 socket/TUN；可按 Credential 固定 HTTP(S)/SOCKS5(H) 出口 |
| 视觉 | 稳定数据面 + 玻璃控制层/浮层；透明关闭和高对比模式完整回退 |

## 开发与构建

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm visual:check
pnpm desktop:dev
pnpm desktop:build
```

`pnpm desktop:build` 生成 Windows NSIS 安装包。当前本机构建用于开发和内部使用，并生成
SHA-256 校验文件；公开分发前仍需配置发布者代码签名证书。

本地数据位于 `%APPDATA%\com.aiquotamonitor.desktop\`。卸载与彻底清理方法见
[docs/SECURITY.md](docs/SECURITY.md)。

## 文档

- [docs/DESIGN.md](docs/DESIGN.md)：当前架构、数据模型、实现状态和验收基线。
- [docs/SECURITY.md](docs/SECURITY.md)：凭据、导出、本地数据与发布说明。
- [docs/provider-contracts/](docs/provider-contracts/)：三个供应商的脱敏接口合同。
- [AGENTS.md](AGENTS.md)：仓库协作约定。

早期设计审议已归档在 `docs/archive/`，不作为当前实现入口。
