import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/shell/app-shell";
import { ToastProvider, useToast } from "./components/ui/toast";
import { ThresholdsProvider } from "./lib/thresholds";
import { AccountsPage } from "./pages/accounts-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";
import type { PageId } from "./lib/quota-types";
import { useThemePreference } from "./lib/theme";
import { isTauriRuntime, quotaClient } from "./lib/quota-client";

/**
 * 调度器错误此前只 emit 无人收，后台刷新故障静默丢失。
 * 在 ToastProvider 内订阅，转换为可见反馈。
 */
function SchedulerErrorWatcher() {
  const toast = useToast();
  useEffect(() => {
    if (!isTauriRuntime) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<{ message?: string }>("scheduler-error", (event) => {
      toast.error(
        "后台刷新异常",
        event.payload?.message ?? "调度器执行失败，将在下个周期重试",
      );
    })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
    };
  }, [toast]);
  return null;
}

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useThemePreference();
  const [transparencyOff, setTransparencyOff] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void quotaClient.refreshAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    void quotaClient
      .getSettings()
      .then((settings) => {
        if (active) {
          document.documentElement.dataset.privacy = settings.privacyMode ? "on" : "off";
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const applyTransparency = useCallback((off: boolean) => {
    setTransparencyOff(off);
    document.documentElement.dataset.transparency = off ? "off" : "on";
  }, []);

  const applyPrivacy = useCallback((enabled: boolean) => {
    document.documentElement.dataset.privacy = enabled ? "on" : "off";
  }, []);

  return (
    <ToastProvider>
      <SchedulerErrorWatcher />
      <ThresholdsProvider>
        <AppShell
        page={page}
        collapsed={collapsed}
        onPageChange={setPage}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      >
        {page === "overview" && <OverviewPage onPageChange={setPage} />}
        {page === "accounts" && <AccountsPage />}
        {page === "settings" && (
          <SettingsPage
            theme={theme}
            onThemeChange={setTheme}
            transparencyOff={transparencyOff}
            onTransparencyChange={applyTransparency}
            onPrivacyChange={applyPrivacy}
          />
        )}
        </AppShell>
      </ThresholdsProvider>
    </ToastProvider>
  );
}
