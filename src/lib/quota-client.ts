import { phase0Overview } from "../data/phase0-fixtures";
import type { OverviewView } from "./quota-types";

export interface QuotaClient {
  getOverview(): Promise<OverviewView>;
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

export const quotaClient: QuotaClient = new Phase0FixtureClient();