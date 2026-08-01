import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { quotaClient } from "./quota-client";

/** 用户告警阈值（Core 数据）：仅供进度条刻度等展示参照；档位判断一律用 DTO 的 tone。 */
export interface Thresholds {
  warning: number;
  high: number;
  critical: number;
}

const DEFAULTS: Thresholds = { warning: 70, high: 85, critical: 95 };

const ThresholdsContext = createContext<{
  thresholds: Thresholds;
  apply: (next: Thresholds) => void;
}>({ thresholds: DEFAULTS, apply: () => undefined });

export function ThresholdsProvider({ children }: { children: ReactNode }) {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULTS);

  useEffect(() => {
    let active = true;
    void quotaClient
      .getSettings()
      .then((settings) => {
        if (!active) return;
        setThresholds({
          warning: settings.warningThreshold,
          high: settings.highThreshold,
          critical: settings.criticalThreshold,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const apply = useCallback((next: Thresholds) => setThresholds(next), []);
  const value = useMemo(() => ({ thresholds, apply }), [thresholds, apply]);
  return (
    <ThresholdsContext.Provider value={value}>
      {children}
    </ThresholdsContext.Provider>
  );
}

export function useThresholds(): Thresholds {
  return useContext(ThresholdsContext).thresholds;
}

export function useApplyThresholds(): (next: Thresholds) => void {
  return useContext(ThresholdsContext).apply;
}
