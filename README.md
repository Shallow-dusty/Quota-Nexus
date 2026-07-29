# AI Quota Monitor

AI Quota Monitor 是一个面向 Windows 的本地只读额度监控项目，目标是在一个界面中查看
多个 OpenCode Go、Ollama Cloud 和 ClinePass 账号的额度窗口、重置时间和凭据健康状态。

## 产品边界

- 只读取额度，不切换账号、不修改其他客户端配置。
- 不代理模型请求，不记录提示词、回复或代码内容。
- 不提供账号注册、邀请奖励、自动续费或批量账号操作。
- 密钥和登录 Cookie 不写入普通配置文件或 SQLite 明文字段。

## 最终方案摘要

| 方面 | 已确认方案 |
| --- | --- |
| 产品形态 | Windows-only 的 Tauri 2 本地桌面应用 |
| 前后端 | React + TypeScript UI，Rust Core，SQLite |
| 账号模型 | 三家供应商、多账号；凭据与账号 N:1，可让一个登录态覆盖多个 Workspace |
| 数据采集 | 只调用额度 API 或读取 Dashboard，不调用模型推理接口 |
| 调度 | 默认 15 分钟；达到 Warning 后提高到 5 分钟，带迟滞、退避和供应商级熔断 |
| 凭据 | Windows Credential Manager；超长 Cookie 使用 CurrentUser DPAPI 文件后备 |
| 安全边界 | HTTPS allowlist、禁用 cookie jar 和自动重定向、秘密只允许 UI → Rust 单向提交 |
| 告警 | Warning / High / Critical、状态代次去重、静默时段不补发 |
| 历史 | 默认 30 天，可选 7 / 90 天或关闭；支持脱敏 JSON 导出 |
| 扩展 | 首版不开网络端口；后续本地只读 API 默认关闭且仅绑定 loopback |

详细设计、数据模型、安全要求、测试计划和验收门只以
[docs/DESIGN.md](docs/DESIGN.md) 为准。

## 文档入口

| 文件 | 职责 |
| --- | --- |
| [STATUS.md](STATUS.md) | 当前阶段、最后验证、下一动作 |
| [AGENTS.md](AGENTS.md) | Agent 协作、提案审计和实现约束 |
| [docs/DESIGN.md](docs/DESIGN.md) | 完整设计的单一事实来源（SSOT） |
| [docs/proposals/README.md](docs/proposals/README.md) | 设计提案与审计结果索引 |

当前已经完成双方设计审议，下一阶段是 Phase 0 只读探针；准确状态见 `STATUS.md`。
