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
| 前端体验 | Web-first React UI、Tauri 桌面交付；稳定内容面 + SVG 折射控制层 + 浮层三层材质 |
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
Phase 1 的三供应商纵向链路已经落地：React 可在普通浏览器用 Phase 0 脱敏样本独立预览；
Tauri 桌面运行时使用 Rust Core、SQLite migration 和 Windows Credential Manager，统一
支持 ClinePass、OpenCode Go、Ollama Cloud 的凭据验证、添加账号、账号列表以及全局/单账号
手动刷新。OpenCode Go 可自动发现全部 Workspace，并以一份凭据建立多个账号。每份新凭据
可使用默认 TUN/系统路由、复用已有固定出口或新建 HTTP(S)/SOCKS5(H) 固定代理；代理认证
保存在 WCM，显式出口失败不回退。三家正式桌面适配器已通过真实账号验证，SQLite、WCM 和
前端构建/视觉矩阵也已通过自动验证。Rust 调度器现已成为唯一刷新时钟，支持周期刷新、
自适应 5 分钟刷新、稳定抖动、账号级退避、认证暂停、429 等待和供应商解析器熔断；
账号页已接入凭据复用、凭据更新、暂停/恢复及调度诊断，设置页已接入刷新、历史、隐私和
通知策略的持久化。现有四个真实账号已完成无损数据库迁移并通过后台刷新。下一阶段是
Windows 通知、历史趋势、快照导出、托盘/自启动和发布收口。

常用命令：

- `pnpm dev`：浏览器预览（Phase 0 脱敏样本）。
- `pnpm desktop:dev`：启动 Tauri 桌面开发版。
- `pnpm desktop:build`：生成 Windows release EXE。
已结束的评审记录保存在 `docs/archive/`（[历程索引](docs/archive/README.md)），日常开发无需读取。
