import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { GlassSurface } from "./glass";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastApi {
  push: (tone: ToastTone, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={15} />,
  error: <AlertCircle size={15} />,
  info: <Info size={15} />,
};

/** 轻量 toast 反馈系统：动作结果的瞬时反馈，替代常驻横幅与静默失败。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, title: string, message?: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, tone, title, message }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push("success", title, message),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="通知">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      toast.tone === "error" ? 6500 : 4200,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <GlassSurface radius={14} blur={8} className={`toast toast-${toast.tone}`} role="status">
      <span className="toast-icon" aria-hidden="true">
        {ICONS[toast.tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink-1">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 break-all text-[11px] text-ink-3">{toast.message}</p>
        )}
      </div>
      <Button
        className="btn btn-icon toast-close"
        aria-label="关闭通知"
        onPress={() => onDismiss(toast.id)}
      >
        <X size={13} />
      </Button>
    </GlassSurface>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
