# Provider Contracts — 供应商接口契约记录

本目录保存 Phase 0 探针验证后的**脱敏**接口契约，是适配器实现（Phase 1）的依据。

## 目录结构

```text
provider-contracts/
├─ README.md            ← 本文件
├─ TEMPLATE.md          ← 契约文档模板
├─ clinepass.md         ← ClinePass 契约（探针验证后填写）
├─ opencode-go.md       ← OpenCode Go 契约
├─ ollama-cloud.md      ← Ollama Cloud 契约
└─ snapshots/           ← 探针自动生成的脱敏快照（机器产物，可提交）
```

## 脱敏规则（DESIGN.md §13.2 / §14.2）

允许出现在契约与快照中：HTTP 状态码、allowlist 路径、响应结构指纹（key 树 + 类型）、
百分比数值、重置时间语义、窗口类型枚举、套餐枚举（Free/Pro/Max）。

禁止出现：Cookie / API Key / Authorization 值、完整 workspace ID（`wrk_` 全值）、
邮箱 / 用户名 / 组织名、订阅标识、上游完整响应原文。

原始响应只存在于 `data/probe-raw/`（gitignored），整理 fixture 时必须另行脱敏。

## 状态约定

每份契约文档头部标注验证状态：

- `匿名验证`：仅验证了端点可达性与鉴权行为（无凭据）。
- `账号验证`：至少一个真实账号成功返回额度（Phase 0 退出门）。
