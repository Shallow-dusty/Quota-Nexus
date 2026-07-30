/** zh-CN 时间与数值格式化（数据库 UTC → 本地时区展示，DESIGN.md §5.1） */

export function formatPercent(value: number): string {
  const clamped = Math.min(100, Math.max(0, value));
  return clamped % 1 === 0 ? clamped.toFixed(0) : clamped.toFixed(1);
}

/** "17:44"；无效值 → "未知" */
export function formatTime(value: string | null): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "今天 17:44" / "7月30日 17:44"；无效值 → "未知" */
export function formatDateTime(value: string | null): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未知";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = formatTime(value);
  if (sameDay) return `今天 ${time}`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * 重置倒计时："12 分钟后重置" / "约 5 小时后重置" / "约 3 天后重置"；
 * null 或无效 → null（调用方显示"重置时间未知"，不臆造倒计时，§11.3）。
 */
export function formatResetCountdown(
  resetsAt: string | null,
  now: number = Date.now(),
): string | null {
  if (!resetsAt) return null;
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return "即将重置";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟后重置`;
  const hours = diffMs / 3_600_000;
  if (hours < 48) return `约 ${Math.round(hours)} 小时后重置`;
  return `约 ${Math.round(hours / 24)} 天后重置`;
}

/** "x 分钟前" / "x 小时前"，用于诊断区 */
export function formatRelativePast(
  value: string | null,
  now: number = Date.now(),
): string {
  if (!value) return "从未";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "未知";
  const diffMs = now - t;
  if (diffMs < 60_000) return "刚刚";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
