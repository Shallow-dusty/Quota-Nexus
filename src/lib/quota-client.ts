import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  phase0Connections,
  phase0Overview,
} from "../data/phase0-fixtures";
import type {
  AccountConnectionView,
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
  workspaceId?: string;
  route: RouteSelectionInput;
}

export interface CreateProviderAccountInput {
  provider: ProviderKind;
  accountLabel: string;
  credentialLabel: string;
  secret: string;
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
  validateProvider(input: ValidateProviderInput): Promise<ProviderValidationView>;
  createProviderAccount(input: CreateProviderAccountInput): Promise<AccountConnectionView[]>;
  refreshAll(): Promise<OverviewView>;
  refreshAccount(id: string): Promise<OverviewView>;
}

function cloneFixture(): OverviewView {
  return structuredClone(phase0Overview);
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

  async createProviderAccount(
    _input: CreateProviderAccountInput,
  ): Promise<AccountConnectionView[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
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

  validateProvider(input: ValidateProviderInput): Promise<ProviderValidationView> {
    return invoke("validate_provider", { input });
  }

  createProviderAccount(
    input: CreateProviderAccountInput,
  ): Promise<AccountConnectionView[]> {
    return invoke("create_provider_account", { input });
  }

  refreshAll(): Promise<OverviewView> {
    return invoke("refresh_all");
  }

  refreshAccount(id: string): Promise<OverviewView> {
    return invoke("refresh_account", { id });
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
