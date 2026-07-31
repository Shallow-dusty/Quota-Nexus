import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  phase0Connections,
  phase0Overview,
} from "../data/phase0-fixtures";
import type {
  AccountConnectionView,
  OverviewView,
  QuotaWindowView,
} from "./quota-types";

export interface ValidateClinePassInput {
  apiKey: string;
}

export interface CreateClinePassAccountInput {
  accountLabel: string;
  credentialLabel: string;
  apiKey: string;
  routeMode: "default";
}

export interface QuotaClient {
  getOverview(): Promise<OverviewView>;
  getConnections(): Promise<AccountConnectionView[]>;
  validateClinePass(input: ValidateClinePassInput): Promise<QuotaWindowView[]>;
  createClinePassAccount(
    input: CreateClinePassAccountInput,
  ): Promise<AccountConnectionView[]>;
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

  async validateClinePass(
    _input: ValidateClinePassInput,
  ): Promise<QuotaWindowView[]> {
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    return structuredClone(
      phase0Overview.accounts.find((account) => account.provider === "clinepass")
        ?.windows ?? [],
    );
  }

  async createClinePassAccount(
    _input: CreateClinePassAccountInput,
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

  validateClinePass(input: ValidateClinePassInput): Promise<QuotaWindowView[]> {
    return invoke("validate_clinepass", { input });
  }

  createClinePassAccount(
    input: CreateClinePassAccountInput,
  ): Promise<AccountConnectionView[]> {
    return invoke("create_clinepass_account", { input });
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
