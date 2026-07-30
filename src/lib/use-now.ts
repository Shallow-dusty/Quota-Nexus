import { useEffect, useState } from "react";

/** 轻量时钟：驱动倒计时文本更新（默认 30s 一跳，不动画） */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
