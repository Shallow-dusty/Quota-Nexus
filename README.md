# AI Quota Monitor

AI Quota Monitor 是一个统一管理 AI 服务额度的本地工具。首个里程碑是在一个界面中查看
多个 OpenCode Go、Ollama Cloud 和 ClinePass 账号的额度窗口、重置时间和凭据健康状态，
后续可以继续扩展账号操作、客户端联动和请求路由能力。

## 开发期望

- 先把多供应商、多账号额度监控做可靠，再按实际需求扩展其他能力。
- 架构为账号切换、客户端集成、模型请求代理/路由和使用分析预留空间，不把 MVP 范围写成永久禁令；额度采集固定出口已进入 MVP。
- 首版优先采用本地存储和手工录入凭据，后续可以增加经用户授权的浏览器导入或其他方式。
- 安全要求关注“避免意外泄露和越权”，而不是禁止未来功能；新增能力应有明确开关和数据说明。
- 设计是实现基线，可以根据真实接口、用户体验和开发证据持续调整。

## 当前方案

| 方面 | 当前选择 |
| --- | --- |
| 产品形态 | Windows 优先的 Tauri 2 本地桌面应用 |
| 前后端 | React + TypeScript UI，Rust Core，SQLite |
| 前端体验 | Windows Liquid Glass 风格；三层材质、三页面 MVP、React Aria 单一行为层 |
| 账号模型 | 三家供应商、多账号；凭据与账号 N:1，可让一个登录态覆盖多个 Workspace |
| 数据采集 | 首期通过额度 API 或 Dashboard；以后可接入客户端或请求链路数据 |
| 调度 | 默认 15 分钟；达到 Warning 后提高到 5 分钟，带迟滞、退避和供应商级熔断 |
| 凭据 | 首期使用 Windows Credential Manager；超长 Cookie 使用 CurrentUser DPAPI 后备 |
| 网络出口 | Credential 可选绑定固定 HTTP(S)/SOCKS5(H) 代理；缺省使用普通 socket/TUN，显式出口失败不回退 |
| 安全策略 | 当前额度适配器采用 HTTPS allowlist、受控重定向和脱敏日志 |
| 告警 | Warning / High / Critical、状态代次去重、静默时段不补发 |
| 历史 | 默认 30 天，可选 7 / 90 天或关闭；支持脱敏 JSON 导出 |
| 可演进方向 | 账号操作、客户端联动、浏览器凭据导入、模型请求代理/路由、本地 API、使用分析 |

## 文档

- [docs/DESIGN.md](docs/DESIGN.md)：当前设计、数据模型、阶段计划和验收标准。
- [AGENTS.md](AGENTS.md)：仓库内的简要协作规则。

当前状态：Phase 0 已完成。三个只读探针均已通过真实账号验证，匿名鉴权行为、显式代理
失败不回退、默认 TUN 路由和脱敏证据均已验证（见 `docs/provider-contracts/`）。
Phase 1 前端静态矩阵已重建：token 体系、三类材质（StableSurface/ControlGlass/
FloatingGlass）、Overview/Accounts/Settings 三页、五种数据状态与添加账号分步 Dialog，
当前由 Phase 0 脱敏样本驱动 UI 验收；下一步接入 Tauri Core、Windows Credential
Manager 与 ClinePass 实时刷新，完成首个前后端纵向切片。
已结束的评审记录保存在 `docs/archive/`（[历程索引](docs/archive/README.md)），日常开发无需读取。
