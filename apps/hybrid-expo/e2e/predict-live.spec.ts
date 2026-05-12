import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { Keypair } from '@solana/web3.js';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';
const API_BASE = process.env.PREDICT_E2E_API_BASE_URL ?? 'http://76.13.249.127:3000';
const LIVE_AMOUNT = Number.parseFloat(process.env.PREDICT_E2E_LIVE_AMOUNT ?? '3');
const PLACE_ORDER = process.env.PREDICT_E2E_LIVE_PLACE_ORDER === '1';

type Sport = 'ipl' | 'epl' | 'ucl';

type LiveOutcome = {
  label: string;
  price: number | null;
  clobTokenIds: string[];
  acceptingOrders?: boolean | null;
};

type LiveMarket = {
  sport: Sport;
  slug: string;
  title: string;
  active: boolean | null;
  negRisk: boolean;
  outcomes: LiveOutcome[];
};

type LiveAuth = {
  polygonAddress: string;
  depositWalletAddress: string;
  tradingAddress: string;
};

type LivePortfolio = {
  positions?: { asset?: string; slug?: string; outcome?: string }[];
  redeemablePositions?: { asset?: string; slug?: string; outcome?: string }[];
  closedPositions?: { asset?: string; slug?: string; outcome?: string }[];
};

type BackendPickState = {
  matchingOpenOrders: { id?: string; orderID?: string; asset_id?: string }[];
  matchingPositions: { asset?: string; slug?: string; outcome?: string }[];
  portfolio: LivePortfolio;
};

function parseSolanaPrivateKey(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('PREDICT_E2E_POLYMARKET_PRIVATE_KEY is empty');
  if (trimmed.startsWith('[')) return Uint8Array.from(JSON.parse(trimmed) as number[]);
  if (trimmed.includes(',')) return Uint8Array.from(trimmed.split(',').map((part) => Number.parseInt(part.trim(), 10)));
  return bs58.decode(trimmed);
}

function deriveLiveIdentity() {
  const privateKey = process.env.PREDICT_E2E_POLYMARKET_PRIVATE_KEY;
  if (!privateKey) throw new Error('Missing PREDICT_E2E_POLYMARKET_PRIVATE_KEY in .predict-e2e.local');
  const secret = parseSolanaPrivateKey(privateKey);
  const keypair = secret.length === 32
    ? Keypair.fromSeed(secret)
    : Keypair.fromSecretKey(secret);
  const signature = nacl.sign.detached(new TextEncoder().encode(DERIVE_MESSAGE), keypair.secretKey);
  const signatureHex = Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const polygonAddress = new Wallet(keccak256(`0x${signatureHex}`)).address;
  return {
    solanaAddress: keypair.publicKey.toBase58(),
    polygonAddress,
    signatureHex,
  };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) as T & { error?: string; detail?: string } : {} as T;
  if (!response.ok) {
    const detail = data.detail ?? data.error ?? `${response.status} ${response.statusText}`;
    throw new Error(`${path} failed: ${detail}`);
  }
  return data;
}

async function authenticate(): Promise<LiveAuth> {
  const identity = deriveLiveIdentity();
  const auth = await apiJson<LiveAuth>('/clob/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature: identity.signatureHex }),
  });
  expect(auth.polygonAddress.toLowerCase()).toBe(identity.polygonAddress.toLowerCase());
  return auth;
}

async function findLiveMarket(): Promise<{ market: LiveMarket; outcome: LiveOutcome }> {
  for (const sport of ['ipl', 'epl', 'ucl'] as Sport[]) {
    const markets = await apiJson<LiveMarket[]>(`/predict/sports/${sport}`);
    for (const row of markets) {
      if (!row.slug || row.active === false) continue;
      const detail = await apiJson<LiveMarket>(`/predict/sports/${sport}/${encodeURIComponent(row.slug)}`).catch(() => null);
      if (!detail?.outcomes?.length) continue;
      const outcome = detail.outcomes.find((entry) => {
        const price = entry.price ?? 0;
        return entry.clobTokenIds?.[0]
          && entry.acceptingOrders !== false
          && price >= 0.05
          && price <= 0.6;
      });
      if (outcome) return { market: { ...detail, sport }, outcome };
    }
  }
  throw new Error('No active live sport market with a placeable outcome was found.');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const stableDir = resolve(process.cwd(), 'test-results', 'predict-live-checkpoints');
  mkdirSync(stableDir, { recursive: true });
  const stablePath = resolve(stableDir, `${name}.png`);
  const body = await page.screenshot({
    fullPage: true,
    path: stablePath,
  });
  await testInfo.attach(name, {
    body,
    contentType: 'image/png',
  });
}

async function readBackendPickState(auth: LiveAuth, market: LiveMarket, tokenId: string): Promise<BackendPickState> {
  const [open, portfolio] = await Promise.all([
    apiJson<{ orders: { id?: string; orderID?: string; asset_id?: string }[] }>(
      `/clob/positions/${encodeURIComponent(auth.polygonAddress)}`,
    ),
    apiJson<LivePortfolio>(`/predict/portfolio/${encodeURIComponent(auth.depositWalletAddress ?? auth.tradingAddress)}`),
  ]);
  const matchingOpenOrders = open.orders.filter((order) => order.asset_id === tokenId);
  const allPositions = [
    ...(portfolio.positions ?? []),
    ...(portfolio.redeemablePositions ?? []),
  ];
  const matchingPositions = allPositions.filter((position) =>
    position.asset === tokenId || position.slug === market.slug,
  );
  return { matchingOpenOrders, matchingPositions, portfolio };
}

async function waitForBackendPick(auth: LiveAuth, market: LiveMarket, tokenId: string): Promise<BackendPickState> {
  let latest: BackendPickState | null = null;
  await expect.poll(async () => {
    latest = await readBackendPickState(auth, market, tokenId);
    return latest.matchingOpenOrders.length + latest.matchingPositions.length;
  }, {
    timeout: 30_000,
    intervals: [1_000, 2_000, 3_000],
    message: 'Expected the live order to appear as an open order or active/redeemable position.',
  }).toBeGreaterThan(0);
  return latest!;
}

async function enterAmount(page: Page, amount: number) {
  await page.getByLabel('Delete digit').click();
  await page.getByLabel('Delete digit').click();
  for (const char of String(amount)) {
    if (char === '.') {
      await page.getByLabel('Decimal point').click();
    } else {
      await page.getByLabel(`Digit ${char}`).click();
    }
  }
}

test.describe('Predict live Polymarket E2E', () => {
  test.skip(process.env.PREDICT_E2E_LIVE !== '1', 'Set PREDICT_E2E_LIVE=1 to run live Polymarket E2E.');

  test('authenticates, places a guarded order, reloads profile, and returns to the market', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    const auth = await authenticate();
    await page.addInitScript((liveAuth: LiveAuth) => {
      const target = globalThis as typeof globalThis & {
        __PREDICT_E2E_POLYGON_ADDRESS?: string;
        __PREDICT_E2E_DEPOSIT_WALLET_ADDRESS?: string;
      };
      target.__PREDICT_E2E_POLYGON_ADDRESS = liveAuth.polygonAddress;
      target.__PREDICT_E2E_DEPOSIT_WALLET_ADDRESS = liveAuth.depositWalletAddress ?? liveAuth.tradingAddress;
    }, auth);

    const balance = await apiJson<{ balance: number }>(`/clob/balance/${encodeURIComponent(auth.polygonAddress)}`);
    expect(balance.balance).toBeGreaterThanOrEqual(0);

    const { market, outcome } = await findLiveMarket();
    await page.goto(`/predict-sport/${market.sport}/${market.slug}`);

    await expect(page.getByText(outcome.label).first()).toBeVisible();
    await expect(page.getByLabel(new RegExp(`^Back ${escapeRegExp(outcome.label)} at`))).toBeVisible();
    await attachScreenshot(page, testInfo, '01-live-market-loaded');

    if (!PLACE_ORDER) {
      test.info().annotations.push({
        type: 'live-order-skipped',
        description: 'Set PREDICT_E2E_LIVE_PLACE_ORDER=1 to submit a real CLOB order.',
      });
      return;
    }

    expect(balance.balance).toBeGreaterThanOrEqual(LIVE_AMOUNT);

    await page.getByLabel(new RegExp(`^Back ${escapeRegExp(outcome.label)} at`)).click();
    await enterAmount(page, LIVE_AMOUNT);

    const orderResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/clob/order') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: new RegExp(`^Back .+ \\$${LIVE_AMOUNT}(?:\\.00)? get`, 'u') }).click();
    const orderResponse = await orderResponsePromise;
    expect(orderResponse.ok()).toBe(true);

    await expect(
      page.getByText(/Waiting to match|Syncing with market|entry ->/u).first(),
    ).toBeVisible();
    await attachScreenshot(page, testInfo, '02-after-live-order-submit');

    const tokenId = outcome.clobTokenIds[0];
    const backendPick = await waitForBackendPick(auth, market, tokenId);

    await page.reload();
    await expect(
      page.getByText(/Waiting to match|Syncing with market|entry ->/u).first(),
    ).toBeVisible({ timeout: 20_000 });
    await attachScreenshot(page, testInfo, '03-market-after-reload');

    await page.goto('/predict-profile');
    await expect(page.getByText('Profile')).toBeVisible();
    await expect(page.getByText(/\$\d/u).first()).toBeVisible();
    await expect(page.getByText('No picks yet')).toHaveCount(0);
    await expect(page.getByText(outcome.label).first()).toBeVisible({ timeout: 20_000 });
    await attachScreenshot(page, testInfo, '04-profile-after-live-order');

    await page.goto(`/predict-sport/${market.sport}/${market.slug}`);
    await expect(page.getByText('No picks here yet')).toHaveCount(0);
    await expect(page.getByText(outcome.label).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Waiting to match|Syncing with market|entry ->/u).first(),
    ).toBeVisible({ timeout: 20_000 });
    await attachScreenshot(page, testInfo, '05-market-after-profile-return');

    for (const order of backendPick.matchingOpenOrders) {
      const orderId = order.id ?? order.orderID;
      if (!orderId) continue;
      await apiJson(`/clob/order/${encodeURIComponent(orderId)}?address=${encodeURIComponent(auth.polygonAddress)}`, {
        method: 'DELETE',
      });
    }
  });
});
