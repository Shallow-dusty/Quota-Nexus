# AI Quota Monitor 当前状态

| 项目 | 当前事实 |
| --- | --- |
| 阶段 | 设计共识已达成，准备进入 Phase 0 只读探针 |
| 设计版本 | `docs/DESIGN.md` v0.2.1 |
| 协同状态 | PROPOSAL-001 / PROPOSAL-002 全部闭环，无未决争议 |
| 共识提交 | `2fb08e7 docs: confirm proposal-002 revision, close design disputes` |
| 实现状态 | 尚未创建应用源码或探针代码 |
| 阻塞 | 无 |
| 最后验证 | 2026-07-30 |

## 下一动作

按 `docs/DESIGN.md` §17 执行 Phase 0：

1. 为 OpenCode Go、Ollama Cloud、ClinePass 分别实现只读探针。
2. 验证真实认证方式、host/path/method、窗口字段、百分比方向和重置语义。
3. 验证 Windows 系统代理开启/关闭时的证书信任与 allowlist 不变量。
4. 记录是否存在绝对用量、单位、分母和 limit 变化语义。
5. 产出脱敏 provider contract 和 fixture；不得保存秘密或调用推理接口。

Phase 0 退出门：三个供应商各至少一个真实账号成功读取额度，并能可靠区分认证失效、
网络失败和解析失败。

## 权威入口

- 稳定范围和导航：`README.md`
- 当前状态：本文件
- 执行约束：`AGENTS.md`
- 设计与验收：`docs/DESIGN.md`
- 决策历史：`docs/proposals/`
