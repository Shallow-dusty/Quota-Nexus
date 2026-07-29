# AI Quota Monitor

AI Quota Monitor 是一个面向 Windows 的本地只读额度监控项目，目标是在一个界面中查看
多个 OpenCode Go、Ollama Cloud 和 ClinePass 账号的额度窗口、重置时间和凭据健康状态。

项目边界：

- 只读取额度，不切换账号、不修改其他客户端配置。
- 不代理模型请求，不记录提示词、回复或代码内容。
- 不提供账号注册、邀请奖励、自动续费或批量账号操作。
- 密钥和登录 Cookie 不写入普通配置文件或 SQLite 明文字段。

当前处于设计阶段。详细设计、接口边界、数据模型、验证计划和验收标准见：

- [docs/DESIGN.md](docs/DESIGN.md)

设计变更先进入提案并由另一方逐条审计；治理规则和当前提案入口见：

- [AGENTS.md](AGENTS.md)
- [docs/proposals/](docs/proposals/)
