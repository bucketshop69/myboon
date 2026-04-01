# Pacific API Client — E2E Testing Guide

## Quick Start

```bash
cd packages/shared
pnpm test
```

## What Gets Tested

| Test | Description | Requires Wallet? |
|------|-------------|------------------|
| **GET /info** | Fetches all 63 Pacific markets | ❌ No |
| **GET /info/prices** | Fetches live prices, 24h volume | ❌ No |
| **GET /account** | Fetches account balance, fees | ⚠️ Public data only |
| **GET /positions** | Fetches open positions | ⚠️ Public data only |
| **GET /orders** | Fetches open orders | ⚠️ Public data only |
| **WebSocket** | Connects to price stream | ❌ No |

## Expected Output

```
🧪 Pacific API Client — E2E Tests

==================================================

[Test 1] GET /info — Fetch all markets...
✅ PASS — Received 63 markets
   Sample: ETH (tick: 0.1, lot: 0.0001)

[Test 2] GET /info/prices — Fetch live prices...
✅ PASS — Received 63 prices
   BTC: $68519.39 (24h vol: $571,960,038.125)

[Test 3] GET /account — Fetch account info...
⚠️  SKIP — Test wallet not found (expected for random address)

[Test 4] GET /positions — Fetch account positions...
✅ PASS — Positions retrieved
   Open positions: 0

[Test 5] GET /orders — Fetch open orders...
✅ PASS — Open orders retrieved
   Open orders: 0

[Test 6] WebSocket — Connect and verify connection...
✅ PASS — WebSocket connection established
   ℹ️  Price subscription test skipped (requires active market movement)

==================================================

📊 Results: 5 passed, 0 failed

🎉 All tests passed! Pacific client is working correctly.
```

## Testing Authenticated Endpoints

To test trading endpoints (create order, cancel, etc.), you need a **real wallet with funds**:

1. Create a test wallet (never use main wallet for testing)
2. Add minimal SOL/USDC for margin
3. Update test file with your wallet keypair
4. Run tests on **testnet** first:
   ```ts
   const client = new PacificClient('testnet');
   ```

⚠️ **Warning:** Authenticated tests will execute real trades on mainnet.

## WebSocket Notes

The Pacific WebSocket only pushes data when there's an **actual price change**. The test verifies connection but skips data reception because:

- Markets may be range-bound (no price movement)
- Test would timeout during quiet market hours
- Connection establishment proves WebSocket works

For full stream testing, run during active market hours or when major news events cause volatility.

## Troubleshooting

### "Account not found"
Expected for random wallet addresses. Use a real Pacific account address.

### WebSocket connection timeout
Check firewall/network. Pacific WebSocket: `wss://ws.pacifica.fi/ws`

### Rate limit warnings
Client respects rate limits. Wait 60 seconds between test runs if you see `429` errors.

## Manual Testing

```typescript
import { PacificClient } from '@myboon/shared';

const client = new PacificClient('mainnet');

// Get markets
const markets = await client.getMarkets();
console.log(markets.length); // 63

// Get prices
const prices = await client.getPrices();
const btc = prices.find(p => p.symbol === 'BTC');
console.log(`BTC: $${btc.oracle}`);

// Get account (public data)
const account = await client.getAccountInfo('YOUR_WALLET_ADDRESS');
console.log(`Balance: $${account.balance}`);
```
