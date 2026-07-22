/**
 * Per-protocol fetch adapters for Home's Wallet section.
 *
 * Each function resolves to a single USD value for that protocol's account
 * row (issue #237 scope: total + mix bar only — per-row rendering, chips,
 * and pills are #238/#239). Every adapter is independent: it does its own
 * fetch against the already-existing client for that protocol and either
 * resolves a number or throws, so `useProtocolAccounts` can isolate
 * failures per source (PRD "fetch orchestration").
 */
import { SpotDataApiClient } from '@myboon/shared/spot';
import { meteoraClient } from '@/features/meteora/meteora.client';
import { fetchPhoenixTraderState } from '@/features/perps/phoenix.api';
import { fetchPerpsAccount } from '@/features/perps/perps.public-api';

const spotClient = new SpotDataApiClient();

export async function fetchSpotValueUsd(walletAddress: string): Promise<number> {
  const result = await spotClient.getWalletBalances(walletAddress);
  return result.data.totalValueUsd ?? 0;
}

export async function fetchMeteoraValueUsd(walletAddress: string): Promise<number> {
  const result = await meteoraClient.getOpenPortfolio(walletAddress);
  const total = result.data.totalBalanceUsd;
  return total !== null ? Number.parseFloat(total) || 0 : 0;
}

export async function fetchPhoenixValueUsd(walletAddress: string): Promise<number> {
  const state = await fetchPhoenixTraderState(walletAddress);
  return sumPhoenixPortfolioValue(state.traders);
}

export async function fetchPacificaValueUsd(walletAddress: string): Promise<number> {
  const account = await fetchPerpsAccount(walletAddress);
  return account.equity;
}

/**
 * Phoenix equity (collateral + unrealized PnL) is reported per-trader-PDA as
 * `portfolioValue` on each record in `traders`. Mirrors the same field name
 * and USD-lots convention PhoenixProfileScreen's own (unexported) summary
 * uses, summed across every trader record for this authority.
 */
function sumPhoenixPortfolioValue(traders: unknown[]): number {
  const values = traders
    .map((trader) => toUsd(asRecord(trader)?.portfolioValue))
    .filter((value): value is number => value !== null);
  return values.reduce((sum, value) => sum + value, 0);
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function toNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const record = asRecord(input);
  if (record) {
    const ui = toNumber(record.ui);
    if (ui !== null) return ui;

    const rawValue = toNumber(record.value);
    const decimals = toNumber(record.decimals);
    if (rawValue !== null && decimals !== null) {
      const scaled = rawValue / (10 ** decimals);
      return Number.isFinite(scaled) ? scaled : null;
    }
  }
  if (typeof input !== 'string' || input.trim() === '') return null;
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUsd(input: unknown): number | null {
  const value = toNumber(input);
  if (value === null) return null;
  if (
    ((typeof input === 'string' && !input.includes('.')) || typeof input === 'number')
    && Math.abs(value) >= 1_000_000
  ) {
    return value / 1_000_000;
  }
  return value;
}
