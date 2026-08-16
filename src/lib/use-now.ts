import { useEffect, useState } from "react";

/**
 * 轻量时钟：驱动倒计时文本更新（默认 30s 一跳，不动画）。
 * 所有订阅者共享一个 interval——50 张卡片各自起 timer 的开销不再随账号数放大。
 */
const listeners = new Set<() => void>();
let timer: number | null = null;

function ensureTimer() {
  if (timer === null) {
    timer = window.setInterval(() => {
      for (const listener of listeners) listener();
    }, 30_000);
  }
}

function releaseTimer() {
  if (timer !== null && listeners.size === 0) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function useNow(intervalMs = 30_000): number {
  void intervalMs; // 共享时钟固定 30s 一跳；保留参数位以兼容既有调用
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    listeners.add(tick);
    ensureTimer();
    return () => {
      listeners.delete(tick);
      releaseTimer();
    };
  }, []);
  return now;
}
