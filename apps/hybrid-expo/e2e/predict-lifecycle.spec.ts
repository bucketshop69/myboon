import { expect, type Page, test } from '@playwright/test';

const POLYGON_ADDRESS = process.env.EXPO_PUBLIC_PREDICT_E2E_POLYGON_ADDRESS
  ?? '0xe2e0000000000000000000000000000000000001';
const TRADING_ADDRESS = process.env.EXPO_PUBLIC_PREDICT_E2E_DEPOSIT_WALLET_ADDRESS
  ?? '0xe2e0000000000000000000000000000000000002';
const SOLANA_ADDRESS = process.env.EXPO_PUBLIC_PREDICT_E2E_SOLANA_ADDRESS
  ?? 'E2ePredict111111111111111111111111111111111';

type OrderPayload = {
  polygonAddress?: string;
  tokenID?: string;
  price?: number;
  size?: number;
  side?: 'BUY' | 'SELL';
  negRisk?: boolean;
  orderType?: string;
};

type ScenarioState = {
  cashBalance: number;
  depositStatusCalls: number;
  withdrawCount: number;
  stage: 'empty' | 'pending' | 'active' | 'cashed_out' | 'ready_to_collect' | 'closed_lost' | 'collected';
  orderCount: number;
  cashOutCount: number;
  redeemCount: number;
  lastBuyOrder: OrderPayload | null;
  lastSellOrder: OrderPayload | null;
  orderbookTokenIds: string[];
};

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function portfolio(state: ScenarioState) {
  const position = activeSportPosition();
  const positions = state.stage === 'active' ? [position] : [];
  const redeemablePositions = state.stage === 'ready_to_collect'
    ? [{ ...position, curPrice: 1, currentValue: 31.96, cashPnl: 22.59, percentPnl: 240.98 }]
    : [];
  const closedPositions = state.stage === 'closed_lost'
    ? [closedSportPosition(false)]
    : state.stage === 'collected'
      ? [closedSportPosition(true)]
      : [];
  const cashOutNow = positions.reduce((sum, item) => sum + item.currentValue, 0);
  const readyToCollect = redeemablePositions.reduce((sum, item) => sum + item.currentValue, 0);
  const totalCollected = state.stage === 'collected' ? 31.96 : 0;

  return {
    address: TRADING_ADDRESS,
    portfolioValue: state.cashBalance,
    positions,
    redeemablePositions,
    closedPositions,
    activity: [],
    profile: {
      name: 'E2E Predict',
      bio: null,
      profileImage: null,
      xUsername: null,
    },
    summary: {
      openPositions: positions.length,
      totalPnl: 0,
      cashOutNow,
      readyToCollect,
      activePickCount: positions.length,
      closedPickCount: closedPositions.length,
      activityCount: positions.length + redeemablePositions.length + closedPositions.length,
      hasActivity: positions.length + redeemablePositions.length + closedPositions.length > 0,
      hasAnyPicks: positions.length + redeemablePositions.length + closedPositions.length > 0,
      totalCollected,
    },
  };
}

function activeSportPosition() {
  return {
    proxyWallet: TRADING_ADDRESS,
    asset: 'token-dc',
    conditionId: 'condition-pk-dc',
    size: 31.96,
    avgPrice: 0.29,
    currentValue: 8.56,
    cashPnl: -0.81,
    percentPnl: -8.64,
    curPrice: 0.27,
    title: 'PK vs DC',
    slug: 'pk-vs-dc',
    eventSlug: 'pk-vs-dc',
    outcome: 'Delhi Capitals',
    outcomeIndex: 1,
    icon: null,
    endDate: '2026-05-30T00:00:00Z',
    negativeRisk: false,
  };
}

function closedSportPosition(won: boolean) {
  return {
    proxyWallet: TRADING_ADDRESS,
    asset: 'token-dc',
    conditionId: 'condition-pk-dc',
    avgPrice: 0.29,
    totalBought: 9.37,
    realizedPnl: won ? 22.59 : -9.37,
    curPrice: won ? 1 : 0,
    timestamp: Date.now(),
    title: 'PK vs DC',
    slug: 'pk-vs-dc',
    icon: null,
    eventSlug: 'pk-vs-dc',
    outcome: 'Delhi Capitals',
    outcomeIndex: 1,
    oppositeOutcome: 'Punjab Kings',
    oppositeAsset: 'token-pk',
    endDate: '2026-05-30T00:00:00Z',
  };
}

function pendingSportOrder() {
  return {
    id: 'order-buy-1',
    status: 'LIVE',
    market: 'pk-vs-dc',
    asset_id: 'token-dc',
    side: 'BUY',
    original_size: '30.30',
    size_matched: '0',
    price: '0.33',
    outcome: 'Delhi Capitals',
    created_at: Date.now(),
    order_type: 'GTC',
  };
}

function scenarioState(overrides: Partial<ScenarioState> = {}): ScenarioState {
  return {
    cashBalance: 100,
    depositStatusCalls: 0,
    withdrawCount: 0,
    stage: 'empty',
    orderCount: 0,
    cashOutCount: 0,
    redeemCount: 0,
    lastBuyOrder: null,
    lastSellOrder: null,
    orderbookTokenIds: [],
    ...overrides,
  };
}

async function installPredictRoutes(page: Page, state: ScenarioState) {
  await page.route(/http:\/\/[^/]+:3000\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');

    if (request.method() === 'OPTIONS') {
      await route.fulfill(json({}));
      return;
    }

    if (path === `/predict/portfolio/${TRADING_ADDRESS}` || path === `/predict/portfolio/${POLYGON_ADDRESS}`) {
      await route.fulfill(json(portfolio(state)));
      return;
    }

    if (path === `/clob/balance/${POLYGON_ADDRESS}`) {
      await route.fulfill(json({ balance: state.cashBalance, allowance: 1000 }));
      return;
    }

    if (path === `/clob/positions/${POLYGON_ADDRESS}`) {
      await route.fulfill(json({ orders: state.stage === 'pending' ? [pendingSportOrder()] : [] }));
      return;
    }

    if (path === '/clob/order' && request.method() === 'POST') {
      let payload: OrderPayload = {};
      try {
        payload = request.postDataJSON() as OrderPayload;
      } catch {
        payload = {};
      }
      const price = typeof payload.price === 'number' ? payload.price : 0;
      const size = typeof payload.size === 'number' ? payload.size : 0;
      const cashValue = Math.round(price * size * 100) / 100;
      if (payload.side === 'SELL') {
        state.lastSellOrder = payload;
        state.stage = 'cashed_out';
        state.cashBalance = Math.round((state.cashBalance + cashValue) * 100) / 100;
        state.cashOutCount += 1;
        await route.fulfill(json({ orderID: `order-sell-${state.cashOutCount}` }));
        return;
      }
      state.lastBuyOrder = payload;
      state.stage = 'pending';
      state.cashBalance = Math.max(0, Math.round((state.cashBalance - cashValue) * 100) / 100);
      state.orderCount += 1;
      await route.fulfill(json({ orderID: `order-buy-${state.orderCount}` }));
      return;
    }

    if (path.startsWith('/clob/order/') && request.method() === 'DELETE') {
      state.stage = 'empty';
      await route.fulfill(json({ ok: true }));
      return;
    }

    if (path === `/clob/deposit/${TRADING_ADDRESS}` || path === `/clob/deposit/${POLYGON_ADDRESS}`) {
      await route.fulfill(json({
        address: {
          svm: SOLANA_ADDRESS,
          evm: '0xfeed000000000000000000000000000000000000',
        },
      }));
      return;
    }

    if (path.startsWith('/clob/deposit-status/')) {
      state.depositStatusCalls += 1;
      const completed = state.depositStatusCalls > 50;
      if (completed) state.cashBalance = 125;
      await route.fulfill(json({
        transactions: completed
          ? [{ status: 'COMPLETED', txHash: '0xdeposited', createdTimeMs: Date.now() }]
          : [],
      }));
      return;
    }

    if (path === '/clob/withdraw' && request.method() === 'POST') {
      let payload: { amount?: number } = {};
      try {
        payload = request.postDataJSON() as { amount?: number };
      } catch {
        payload = {};
      }
      const amount = typeof payload.amount === 'number' ? payload.amount : 0;
      state.cashBalance = Math.max(state.cashBalance - amount, 0);
      state.withdrawCount += 1;
      await route.fulfill(json({ ok: true, amount, txHash: '0xwithdrawn' }));
      return;
    }

    if (path === '/clob/redeem' && request.method() === 'POST') {
      state.stage = 'collected';
      state.cashBalance = Math.round((state.cashBalance + 31.96) * 100) / 100;
      state.redeemCount += 1;
      await route.fulfill(json({ ok: true, txHash: `0xredeemed${state.redeemCount}` }));
      return;
    }

    if (path === '/predict/sports/ipl/pk-vs-dc') {
      await route.fulfill(json({
        slug: 'pk-vs-dc',
        title: 'PK vs DC',
        description: 'E2E sport market fixture',
        sport: 'ipl',
        status: 'live',
        startDate: '2026-05-12T14:00:00Z',
        endDate: '2026-05-30T00:00:00Z',
        image: null,
        active: true,
        negRisk: false,
        volume24h: 150000,
        liquidity: 50000,
        outcomes: [
          {
            label: 'Punjab Kings',
            question: 'Punjab Kings win?',
            price: 0.67,
            conditionId: 'condition-pk-dc',
            clobTokenIds: ['token-pk'],
            liquidity: 25000,
            volume24h: 80000,
            bestBid: 0.66,
            bestAsk: 0.68,
            acceptingOrders: true,
          },
          {
            label: 'Delhi Capitals',
            question: 'Delhi Capitals win?',
            price: 0.29,
            conditionId: 'condition-pk-dc',
            clobTokenIds: ['token-dc'],
            liquidity: 25000,
            volume24h: 70000,
            bestBid: 0.32,
            bestAsk: 0.34,
            acceptingOrders: true,
          },
        ],
      }));
      return;
    }

    if (path === '/predict/live-prices') {
      await route.fulfill(json({
        fetchedAt: new Date().toISOString(),
        prices: [
          { tokenId: 'token-pk', price: 0.67, source: 'midpoint' },
          { tokenId: 'token-dc', price: 0.33, source: 'midpoint' },
        ],
      }));
      return;
    }

    if (path.startsWith('/predict/history/')) {
      await route.fulfill(json({
        history: [
          { t: 1778580000, p: 0.29 },
          { t: 1778583600, p: 0.33 },
        ],
      }));
      return;
    }

    if (path.startsWith('/predict/book/')) {
      state.orderbookTokenIds.push(decodeURIComponent(path.split('/').pop() ?? ''));
      await route.fulfill(json({
        bids: [
          { price: 0.32, size: 800 },
          { price: 0.31, size: 500 },
        ],
        asks: [
          { price: 0.33, size: 700 },
          { price: 0.34, size: 600 },
        ],
        lastPrice: 0.32,
      }));
      return;
    }

    if (path === `/predict/positions/${TRADING_ADDRESS}/market/pk-vs-dc`) {
      await route.fulfill(json(state.stage === 'active' ? [activeSportPosition()] : []));
      return;
    }

    await route.fulfill(json({ error: `Unhandled fake route: ${request.method()} ${path}` }, 404));
  });
}

test.describe('Predict wallet-free lifecycle harness', () => {
  test('loads the Predict profile with cash and empty pick state', async ({ page }) => {
    const state = scenarioState();
    await installPredictRoutes(page, state);

    await page.goto('/predict-profile');

    await expect(page.getByText('Profile')).toBeVisible();
    await expect(page.getByText('$100.00').first()).toBeVisible();
    await expect(page.getByText('Cash', { exact: true })).toBeVisible();
    await expect(page.getByText('No picks yet')).toBeVisible();
    expect(state.withdrawCount).toBe(0);
  });

  test('reproduces issue #149 sport odds mismatch fixture', async ({ page }) => {
    const state = scenarioState({ stage: 'active', cashBalance: 90 });
    await installPredictRoutes(page, state);

    await page.goto('/predict-sport/ipl/pk-vs-dc');

    await expect(page.getByText('PK vs DC').first()).toBeVisible();
    await expect(page.getByText('29% entry -> 27% now')).toBeVisible();
    await expect(page.getByLabel('Back Delhi Capitals at 33%')).toBeVisible();
  });

  test('places a sport bet, confirms it active, and cashes out', async ({ page }) => {
    const state = scenarioState();
    await installPredictRoutes(page, state);

    await page.goto('/predict-profile');
    await expect(page.getByText('$100.00').first()).toBeVisible();

    await page.goto('/predict-sport/ipl/pk-vs-dc');
    await expect(page.getByText('PK vs DC').first()).toBeVisible();
    await expect(page.getByLabel('Back Delhi Capitals at 33%')).toBeVisible();

    await page.getByLabel('Back Delhi Capitals at 33%').click();
    await page.getByLabel('Set amount to 10 dollars').click();
    await page.getByRole('button', { name: /Back DC \$10 get/ }).click();

    await expect(page.getByText('Waiting to match · cash reserved')).toBeVisible();
    expect(state.orderCount).toBe(1);
    expect(state.cashBalance).toBe(90);
    expect(state.lastBuyOrder).toMatchObject({
      polygonAddress: POLYGON_ADDRESS,
      tokenID: 'token-dc',
      price: 0.33,
      side: 'BUY',
      negRisk: false,
    });
    expect(state.lastBuyOrder?.size).toBeCloseTo(30.3, 2);

    state.stage = 'active';
    await page.reload();

    await expect(page.getByText('29% entry -> 27% now')).toBeVisible();
    await expect(page.getByLabel('Cash out $8.56')).toBeVisible();

    await page.getByLabel('Cash out $8.56').click();
    await expect(page.getByText('Are you sure?')).toBeVisible();
    await page.getByRole('button', { name: 'Cash out' }).last().click();

    await expect(page.getByText('No picks here yet')).toBeVisible();
    expect(state.cashOutCount).toBe(1);
    expect(state.stage).toBe('cashed_out');
    expect(state.lastSellOrder).toMatchObject({
      polygonAddress: POLYGON_ADDRESS,
      tokenID: 'token-dc',
      price: 0.24,
      side: 'SELL',
      negRisk: false,
      orderType: 'FOK',
    });
    expect(state.lastSellOrder?.size).toBeCloseTo(31.96, 2);
  });

  test('shows the selected outcome order book before placing the sport pick', async ({ page }) => {
    const state = scenarioState();
    await installPredictRoutes(page, state);

    await page.goto('/predict-sport/ipl/pk-vs-dc');

    await page.getByRole('tab', { name: 'Book' }).click();
    await page.getByRole('tab', { name: 'Show Delhi Capitals order book' }).click();

    await expect(page.getByText('Spread: 1%')).toBeVisible();
    await expect(page.getByText('33%').first()).toBeVisible();
    expect(state.orderbookTokenIds).toContain('token-dc');
  });

  test('redeems a winning sport pick back into cash', async ({ page }) => {
    const state = scenarioState({ stage: 'ready_to_collect', cashBalance: 20 });
    await installPredictRoutes(page, state);

    await page.goto('/predict-sport/ipl/pk-vs-dc');

    await expect(page.getByText('Ready to collect')).toBeVisible();
    await page.getByLabel('Redeem payout').click();

    await expect(page.getByText('Delhi Capitals won')).toBeVisible();
    expect(state.redeemCount).toBe(1);
    expect(state.cashBalance).toBe(51.96);
  });

  test('shows a losing settled sport pick without a redeem action', async ({ page }) => {
    const state = scenarioState({ stage: 'closed_lost', cashBalance: 20 });
    await installPredictRoutes(page, state);

    await page.goto('/predict-sport/ipl/pk-vs-dc');

    await expect(page.getByText('Delhi Capitals lost')).toBeVisible();
    await expect(page.getByLabel('Redeem payout')).toHaveCount(0);
  });
});
