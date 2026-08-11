import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  phase0Connections,
  phase0Overview,
  phase0ProviderHealth,
} from "../data/phase0-fixtures";
import type {
  AccountConnectionView,
  AppSettingsView,
  CredentialOptionView,
  HistoryPointView,
  NetworkProfileView,
  OverviewView,
  ProviderKind,
  QuotaWindowView,
} from "./quota-types";

export type RouteSelectionInput =
  | { mode: "default" }
  | { mode: "existing"; profileId: string }
  | {
      mode: "new";
      label: string;
      proxyUrl: string;
      username?: string;
      password?: string;
    };

export interface ValidateProviderInput {
  provider: ProviderKind;
  secret: string;
  existingCredentialId?: string;
  workspaceId?: string;
  route: RouteSelectionInput;
}

export interface UpdateCredentialInput {
  credentialId: string;
  secret: string;
}

export interface UpdateAccountInput {
  id: string;
  label: string;
  enabled: boolean;
}

export interface UpdateNetworkProfileInput {
  id: string;
  label: string;
  proxyUrl: string;
  username?: string;
  password?: string;
  clearAuth: boolean;
}

export interface CreateProviderAccountInput {
  provider: ProviderKind;
  accountLabel: string;
  credentialLabel: string;
  secret: string;
  existingCredentialId?: string;
  workspaceId?: string;
  route: RouteSelectionInput;
}

export interface ProviderValidationView {
  windows: QuotaWindowView[];
  discoveredAccountCount: number;
}

export interface QuotaClient {
  getOverview(): Promise<OverviewView>;
  getConnections(): Promise<AccountConnectionView[]>;
  getNetworkProfiles(): Promise<NetworkProfileView[]>;
  updateNetworkProfile(input: UpdateNetworkProfileInput): Promise<NetworkProfileView[]>;
  deleteNetworkProfile(id: string): Promise<NetworkProfileView[]>;
  getCredentials(): Promise<CredentialOptionView[]>;
  getSettings(): Promise<AppSettingsView>;
  updateSettings(input: AppSettingsView): Promise<AppSettingsView>;
  getProviderHealth(): Promise<import("./quota-types").ProviderHealthView[]>;
  getHistory(days: 7 | 30 | 90): Promise<HistoryPointView[]>;
  exportLatestSnapshot(): Promise<string>;
  getDiagnosticManifest(): Promise<string[]>;
  exportDiagnostics(): Promise<string>;
  sendTestNotification(): Promise<void>;
  validateProvider(input: ValidateProviderInput): Promise<ProviderValidationView>;
  validateExistingCredential(
    credentialId: string,
    workspaceId?: string,
  ): Promise<ProviderValidationView>;
  createProviderAccount(input: CreateProviderAccountInput): Promise<AccountConnectionView[]>;
  updateCredential(input: UpdateCredentialInput): Promise<AccountConnectionView[]>;
  updateAccount(input: UpdateAccountInput): Promise<AccountConnectionView[]>;
  deleteAccount(id: string): Promise<AccountConnectionView[]>;
  refreshAll(): Promise<OverviewView>;
  refreshAccount(id: string): Promise<OverviewView>;
  onOverviewUpdated(handler: (overview: OverviewView) => void): Promise<() => void>;
}

function cloneFixture(): OverviewView {
  const fixture = structuredClone(phase0Overview);
  const requested = Number(new URLSearchParams(window.location.search).get("accounts"));
  if (!Number.isInteger(requested) || requested <= fixture.accounts.length) return fixture;
  fixture.accounts = Array.from({ length: Math.min(requested, 50) }, (_, index) => {
    const source = fixture.accounts[index % fixture.accounts.length];
    return {
      ...structuredClone(source),
      id: `scale-account-${index + 1}`,
      accountLabel: `${source.accountLabel} ${index + 1}`,
    };
  });
  return fixture;
}

class Phase0FixtureClient implements QuotaClient {
  async getOverview(): Promise<OverviewView> {
    await new Promise((resolve) => window.setTimeout(resolve, 380));
    return cloneFixture();
  }

  async getConnections(): Promise<AccountConnectionView[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    return structuredClone(phase0Connections);
  }

  async getNetworkProfiles(): Promise<NetworkProfileView[]> {
    return [];
  }

  async updateNetworkProfile(_input: UpdateNetworkProfileInput): Promise<NetworkProfileView[]> {
    return [];
  }

  async deleteNetworkProfile(_id: string): Promise<NetworkProfileView[]> {
    return [];
  }

  async getCredentials(): Promise<CredentialOptionView[]> {
    return [
      {
        id: "fixture-opencode",
        provider: "opencode-go",
        label: "OpenCode · 主 Cookie",
        sharedAccountCount: 2,
        routeModeLabel: "固定代理 · 登录出口",
        lastValidatedAt: new Date().toISOString(),
      },
    ];
  }

  async getSettings(): Promise<AppSettingsView> {
    return {
      refreshIntervalMinutes: 15,
      adaptiveRefresh: true,
      warningThreshold: 70,
      highThreshold: 85,
      criticalThreshold: 95,
      historyDays: 30,
      trayEnabled: true,
      autostartEnabled: false,
      privacyMode: false,
      notifyAuth: true,
      notifyStale: true,
      notifyRecovery: false,
      notifyQuota: true,
    };
  }

  async updateSettings(input: AppSettingsView): Promise<AppSettingsView> {
    return structuredClone(input);
  }

  async getProviderHealth(): Promise<import("./quota-types").ProviderHealthView[]> {
    return structuredClone(phase0ProviderHealth);
  }

  async getHistory(_days: 7 | 30 | 90): Promise<HistoryPointView[]> {
    return phase0Overview.accounts.flatMap((account) =>
      account.windows.flatMap((window) =>
        Array.from({ length: 7 }, (_, index) => ({
          accountId: account.id,
          provider: account.provider,
          accountLabel: account.accountLabel,
          windowKind: window.kind,
          windowLabel: window.label,
          usedPercent: Math.max(0, window.usedPercent - (6 - index) * 2.5),
          observedAt: new Date(Date.now() - (6 - index) * 86_400_000).toISOString(),
        })),
      ),
    );
  }

  async exportLatestSnapshot(): Promise<string> {
    return "浏览器预览不写入本机文件";
  }

  async getDiagnosticManifest(): Promise<string[]> {
    return [
      "manifest.json（应用版本、系统、数据库 schema）",
      "provider-health.json（供应商健康）",
      "settings.json（应用设置）",
      "latest-snapshot.json（脱敏额度）",
    ];
  }

  async exportDiagnostics(): Promise<string> {
    return "浏览器预览不写入本机文件";
  }

  async sendTestNotification(): Promise<void> {}

  async validateProvider(
    input: ValidateProviderInput,
  ): Promise<ProviderValidationView> {
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    const windows =
      phase0Overview.accounts.find((account) => account.provider === input.provider)
        ?.windows ?? [];
    return {
      windows: structuredClone(windows),
      discoveredAccountCount: input.provider === "opencode-go" ? 2 : 1,
    };
  }

  async validateExistingCredential(
    _credentialId: string,
    _workspaceId?: string,
  ): Promise<ProviderValidationView> {
    return {
      windows: structuredClone(phase0Overview.accounts[0]?.windows ?? []),
      discoveredAccountCount: 1,
    };
  }

  async createProviderAccount(
    _input: CreateProviderAccountInput,
  ): Promise<AccountConnectionView[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    return structuredClone(phase0Connections);
  }

  async updateCredential(
    _input: UpdateCredentialInput,
  ): Promise<AccountConnectionView[]> {
    return structuredClone(phase0Connections);
  }

  async updateAccount(_input: UpdateAccountInput): Promise<AccountConnectionView[]> {
    return structuredClone(phase0Connections);
  }

  async deleteAccount(_id: string): Promise<AccountConnectionView[]> {
    return structuredClone(phase0Connections);
  }

  async refreshAll(): Promise<OverviewView> {
    await new Promise((resolve) => window.setTimeout(resolve, 640));
    return { ...cloneFixture(), refreshedAt: new Date().toISOString() };
  }

  async refreshAccount(id: string): Promise<OverviewView> {
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    const data = cloneFixture();
    const account = data.accounts.find((a) => a.id === id);
    if (account) account.lastSuccessAt = new Date().toISOString();
    data.refreshedAt = new Date().toISOString();
    return data;
  }

  async onOverviewUpdated(_handler: (overview: OverviewView) => void): Promise<() => void> {
    return () => {};
  }
}

class TauriQuotaClient implements QuotaClient {
  getOverview(): Promise<OverviewView> {
    return invoke("get_overview");
  }

  getConnections(): Promise<AccountConnectionView[]> {
    return invoke("get_connections");
  }

  getNetworkProfiles(): Promise<NetworkProfileView[]> {
    return invoke("get_network_profiles");
  }

  updateNetworkProfile(input: UpdateNetworkProfileInput): Promise<NetworkProfileView[]> {
    return invoke("update_network_profile", { input });
  }

  deleteNetworkProfile(id: string): Promise<NetworkProfileView[]> {
    return invoke("delete_network_profile", { id });
  }

  getCredentials(): Promise<CredentialOptionView[]> {
    return invoke("get_credentials");
  }

  getSettings(): Promise<AppSettingsView> {
    return invoke("get_settings");
  }

  updateSettings(input: AppSettingsView): Promise<AppSettingsView> {
    return invoke("update_settings", { input });
  }

  getProviderHealth(): Promise<import("./quota-types").ProviderHealthView[]> {
    return invoke("get_provider_health");
  }

  getHistory(days: 7 | 30 | 90): Promise<HistoryPointView[]> {
    return invoke("get_history", { days });
  }

  exportLatestSnapshot(): Promise<string> {
    return invoke("export_latest_snapshot");
  }

  getDiagnosticManifest(): Promise<string[]> {
    return invoke("get_diagnostic_manifest");
  }

  exportDiagnostics(): Promise<string> {
    return invoke("export_diagnostics");
  }

  sendTestNotification(): Promise<void> {
    return invoke("send_test_notification");
  }

  validateProvider(input: ValidateProviderInput): Promise<ProviderValidationView> {
    return invoke("validate_provider", { input });
  }

  validateExistingCredential(
    credentialId: string,
    workspaceId?: string,
  ): Promise<ProviderValidationView> {
    return invoke("validate_existing_credential", { credentialId, workspaceId });
  }

  createProviderAccount(
    input: CreateProviderAccountInput,
  ): Promise<AccountConnectionView[]> {
    return invoke("create_provider_account", { input });
  }

  updateCredential(input: UpdateCredentialInput): Promise<AccountConnectionView[]> {
    return invoke("update_credential", { input });
  }

  updateAccount(input: UpdateAccountInput): Promise<AccountConnectionView[]> {
    return invoke("update_account", { input });
  }

  deleteAccount(id: string): Promise<AccountConnectionView[]> {
    return invoke("delete_account", { id });
  }

  refreshAll(): Promise<OverviewView> {
    return invoke("refresh_all");
  }

  refreshAccount(id: string): Promise<OverviewView> {
    return invoke("refresh_account", { id });
  }

  async onOverviewUpdated(handler: (overview: OverviewView) => void): Promise<() => void> {
    return listen<OverviewView>("overview-updated", (event) => handler(event.payload));
  }
}

export const isTauriRuntime = isTauri();

export const quotaClient: QuotaClient = isTauriRuntime
  ? new TauriQuotaClient()
  : new Phase0FixtureClient();

export function commandErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  if (typeof error === "string") return error;
  return "操作失败，请稍后重试";
}
