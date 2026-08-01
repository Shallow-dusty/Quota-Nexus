# 安全与本地数据

Quota Nexus 的额度采集通过供应商 allowlist 上的只读 HTTPS 请求完成。默认网络路径
由当前 Windows 网络栈或 TUN 接管；显式固定出口失败时不会回退到默认路径。

供应商秘密和代理认证保存在当前 Windows 用户的 Credential Manager。SQLite 保存账号标签、
供应商、额度快照、历史、调度与告警状态，不保存 Cookie、API Key 或代理密码。普通快照导出
会移除账号标签、账号 ID、凭据引用和固定出口信息；诊断包在导出前展示文件清单，且只包含
版本、系统、schema、脱敏设置、供应商健康和脱敏最新快照。

本地数据目录为：

`%APPDATA%\com.quotanexus.desktop\`

卸载应用不会擅自删除额度历史或 Windows Credential Manager 项。若要彻底清理，应先在应用
内移除本地账号与未使用出口，再退出应用并删除上述数据目录。当前用户会话已被完全控制时，
Credential Manager 不能抵御同一用户权限下的恶意程序。

发布包提供 SHA-256 校验文件。尚未配置发布者代码签名证书的公开构建会在文件名和 Release
说明中明确标注 `UNSIGNED`，用户应只从本仓库 Release 下载并核对校验值。签名会在后续版本
中加入，不会用重新上传资产的方式替换已经发布的版本。
