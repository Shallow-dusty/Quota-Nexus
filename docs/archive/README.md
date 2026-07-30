# 归档：设计评审记录

本目录保存 AI Quota Monitor 设计阶段的两轮双 Agent 评审记录（2026-07-30），仅用于
追溯决策来源，**不再作为现行约束**。当前设计基线以 [`../DESIGN.md`](../DESIGN.md)
为准；与归档内容冲突时，以 DESIGN.md 为准。

## 辩论历程摘要

### 第一轮：后端设计评审 → [round-1-backend/](round-1-backend/)

| 项目 | 内容 |
| --- | --- |
| 基线变迁 | `DESIGN.md` v0.1.0 → v0.2.1 |
| 提案方 | pi（PROPOSAL-001：P-001~P-022；PROPOSAL-002：P-023） |
| 审计方 | Codex |
| 结果 | 20 条接受（7 条修订合并）、2 条驳回（提案方接受驳回）、P-023 修订合并 |

关键产出：账号级健康表 `account_health`、freshness 派生化、WCM 2560 字节上限的
DPAPI 后备策略、告警三档行式 schema、状态代次去重、调度器熔断退避、凭据一等实体
（账号 N:1）、IPC 秘密单向流、SQLite 工程基线、15 分钟基础 + 阈值自适应刷新。

著名交锋：

- **P-005（resetsAt 去重键）被驳回**：滑动窗口下链式漂移容忍会使去重键永久不变，
  导致再次逼近阈值时漏报；Codex 以"状态代次 + 迟滞重新武装"替代，pi 推演后认输。
- **P-008（绝对用量字段）被驳回**：违反"未经探针验证不固化上游合同"原则；以
  P-023（Phase 0 取证义务）保留复活通道，否决措辞从"永久关闭"修正为"出现新证据前
  不扩展"。

### 第二轮：前端设计评审 → [round-2-frontend/](round-2-frontend/)

| 项目 | 内容 |
| --- | --- |
| 基线变迁 | `DESIGN.md` v0.3.0 → v0.4.0 |
| 提案方 | Codex（UI-P01~P18，Liquid Glass 风格 / 信息架构 / 组件 / 技术栈 / 验收门） |
| 审计方 | pi（13 接受 / 5 修订接受 / 0 拒绝，修订编号 R-01~R-05） |
| 结果 | R-01/02/05 直接接受；R-03/R-04 经 Codex 二次修订后由 pi 终审确认，全部闭环 |

关键产出：三层材质体系 + 材质参数表（WCAG AA 硬门槛）、MVP 三页面 + 抽屉承载
诊断、五数据状态矩阵、React Aria 唯一行为层、TanStack Query 仅作 DTO 缓存
（Rust 调度器为唯一刷新时钟）、图表 ≤120KB gz 预算、添加账号支持复用已有凭据、
ClinePass 首切片（Phase 0 实证为前提）。

著名交锋：

- **R-03**：pi 断言"shadcn 必然封装 Radix、双行为库必然分裂"，Codex 以官方文档
  证伪（shadcn 已支持 React Aria first-class base）；pi 经 Context7 核实后撤回断言，
  结论收敛为"React Aria 唯一行为层 + shadcn 仅 `aria` base 源码脚手架"。
- **R-04**：pi 建议的"脱敏尾缀"被指出违反秘密片段禁令（§15"无可逆片段"），pi 接受
  更严方案：已有凭据只显示标签、关联账号数、最后验证时间。

## 文件索引

| 路径 | 内容 |
| --- | --- |
| [round-1-backend/PROPOSAL-001.md](round-1-backend/PROPOSAL-001.md) | 第一轮提案全文 + Codex 审计 + pi 认输回应 |
| [round-1-backend/PROPOSAL-002.md](round-1-backend/PROPOSAL-002.md) | P-023 补证提案 + 审计 + 终审确认 |
| [round-2-frontend/review.md](round-2-frontend/review.md) | 第二轮提案、pi 审计、Codex 答辩、终审确认（全在一文） |
| [STATUS-design-consensus-2026-07-30.md](STATUS-design-consensus-2026-07-30.md) | 第一轮闭环时的状态快照（历史） |

## 使用约束

- 归档文件不随实现演进更新；新的重大取舍直接写入 `DESIGN.md` 并简述理由。
- 引用归档内容时必须注明其为历史记录。
