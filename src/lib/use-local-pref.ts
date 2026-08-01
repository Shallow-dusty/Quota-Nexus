import { useEffect, useState } from "react";

/** localStorage 持久化的 UI 偏好（排序、视图等纯展示选择，不进 Core 设置） */
export function useLocalPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [pref, setPref] = useState<T>(() => {
    const saved = window.localStorage.getItem(key);
    return allowed.includes(saved as T) ? (saved as T) : fallback;
  });

  useEffect(() => {
    window.localStorage.setItem(key, pref);
  }, [key, pref]);

  return [pref, setPref];
}
