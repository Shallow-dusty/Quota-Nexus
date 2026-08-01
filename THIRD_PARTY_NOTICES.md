# Third-party notices

Quota Nexus 本身采用 MIT License。依赖的完整版本以 `Cargo.lock` 和
`pnpm-lock.yaml` 为准；发布前通过依赖许可证清单复核。

实现参考过以下社区项目公开描述和网络行为，但当前仓库没有直接复制其源文件：

- CodexBar（MIT）：Ollama Cloud、ClinePass Provider 行为参考。
- opencode-quota（MIT）：OpenCode Go Dashboard 行为参考。
- OpenCode Go Manager（AGPL-3.0-or-later）：多账号产品形态参考；未复制其实现。

主要运行时依赖包括 Tauri、React、React Aria、Lucide、sqlx、
reqwest、keyring、chrono 与 zip；各自版权与许可证归原作者所有。

前端生产依赖许可证经 `pnpm licenses list --prod` 复核，当前为 MIT、Apache-2.0、
Apache-2.0 OR MIT、ISC 和 0BSD。Rust 依赖版本与审计结论以 `Cargo.lock` 和
`docs/DESIGN.md` 的验收记录为准。
