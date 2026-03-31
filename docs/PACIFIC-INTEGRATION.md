# Pacific Protocol Integration Requirements

## Overview

Pacific Protocol is a perps DEX on Solana. This document summarizes all technical requirements for integrating Pacific into myboon.

---

## API Infrastructure

### Base URLs
- **Mainnet REST:** `https://api.pacifica.fi/api/v1`
- **Testnet REST:** `https://test-api.pacifica.fi/api/v1`
- **Mainnet WebSocket:** `wss://ws.pacifica.fi/ws`
- **Testnet WebSocket:** `wss://test-ws.pacifica.fi/ws`

### Rate Limits
- **Window:** 60-second rolling
- **Credits:** Unidentified IP: 125, API Key: 300, VIP tiers up to 40,000
- **Costs:** Standard request: 1 credit, Cancel order: 0.5 credits, Heavy GET: 1-12 credits
- **Headers:** Check `ratelimit` and `ratelimit-policy` response headers (divide by 10 for actual credits)

---

## Authentication & Signing

### Signing Algorithm
- **Algorithm:** Ed25519
- **Library:** `solders` (Solana SDK)
- **Payload Format:** Deterministic JSON (keys sorted alphabetically, compact serialization)

### Signing Flow
```python
import time
import json
from solders.keypair import Keypair
from solders.signature import Signature

# 1. Prepare header
timestamp = int(time.time() * 1_000)  # milliseconds
header = {
    "timestamp": timestamp,
    "expiry_window": 5000,  # 5 seconds default
    "type": "create_market_order",  # varies by endpoint
    "data": { ... }  # endpoint-specific payload
}

# 2. Sort keys and serialize
message = json.dumps(header, sort_keys=True, separators=(',', ':'))

# 3. Sign
keypair = Keypair.from_base58_string(PRIVATE_KEY)
signature = keypair.sign_message(message.encode()).to_base58()
```

### Request Headers
All POST requests require:
```json
{
  "account": "6ETn....",
  "signature": "...",
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "builder_code": "YOUR_CODE"  // optional, for fee sharing
}
```

---

## REST API Endpoints

### Markets

#### GET `/api/v1/info` - Get All Markets
Returns all available perpetual markets with configuration.

**Response:**
```json
{
  "success": true,
  "data": [{
    "symbol": "BTC",
    "tick_size": "1",
    "lot_size": "0.00001",
    "max_leverage": 50,
    "min_order_size": "0.1",
    "max_order_size": "5000000",
    "funding_rate": "0.0000125",
    "next_funding_rate": "0.0000125",
    "isolated_only": false,
    "created_at": 1748881333944
  }]
}
```

#### GET `/api/v1/info/prices` - Get All Prices
Returns live prices, mark prices, funding rates, and open interest for all markets.

**Response:**
```json
{
  "success": true,
  "data": [{
    "symbol": "BTC",
    "oracle": "95000.50",      // Oracle price
    "mark": "95010.25",        // Mark price
    "mid": "95005.00",         // Mid price
    "funding": "0.00010529",   // Last funding rate
    "next_funding": "0.00011096",  // Next estimated funding
    "open_interest": "3634796",    // OI in USD
    "volume_24h": "20896698.07",   // 24h volume in USD
    "yesterday_price": "94500.00",
    "timestamp": 1759222967974
  }]
}
```

### Account

#### GET `/api/v1/account?account={address}` - Get Account Info
Returns account balance, fees, margin usage.

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": "2000.000000",
    "account_equity": "2150.250000",
    "available_to_spend": "1800.750000",
    "available_to_withdraw": "1500.850000",
    "total_margin_used": "349.500000",
    "cross_mmr": "420.690000",
    "fee_level": 0,
    "maker_fee": "0.00015",
    "taker_fee": "0.0004",
    "positions_count": 2,
    "orders_count": 3,
    "stop_orders_count": 1,
    "updated_at": 1716200000000
  }
}
```

#### GET `/api/v1/positions?account={address}` - Get Positions
Returns all open positions for an account.

**Response:**
```json
{
  "success": true,
  "data": [{
    "symbol": "BTC",
    "side": "bid",           // "bid" = long, "ask" = short
    "amount": "0.5",
    "entry_price": "94500.00",
    "funding": "13.159593",  // Cumulative funding paid/received
    "isolated": false,       // false = cross margin
    "created_at": 1754928414996,
    "updated_at": 1759223365538
  }],
  "last_order_id": 1557431179
}
```

#### GET `/api/v1/trades/history?account={address}&builder_code={code}` - Get Trade History
Returns historical trades for an account.

### Orders

#### POST `/api/v1/orders/create_market` - Create Market Order
Opens or closes a position at market price.

**Signing Type:** `create_market_order`

**Request:**
```json
{
  "account": "6ETn....",
  "signature": "...",
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "symbol": "BTC",
  "amount": "0.1",
  "side": "bid",            // "bid" = buy/long, "ask" = sell/short
  "slippage_percent": "0.5",
  "reduce_only": false,     // true to close position only
  "client_order_id": "uuid-string",
  "take_profit": {
    "stop_price": "55000",
    "limit_price": "54950",
    "client_order_id": "uuid-string"
  },
  "stop_loss": {
    "stop_price": "48000",
    "limit_price": "47950",
    "client_order_id": "uuid-string"
  }
}
```

**Response:**
```json
{ "order_id": 12345 }
```

#### POST `/api/v1/orders/create` - Create Limit Order
Places a limit order on the orderbook.

**Signing Type:** `create_order`

**Request:**
```json
{
  "account": "6ETn....",
  "signature": "...",
  "timestamp": 1716200000000,
  "symbol": "BTC",
  "price": "95000",
  "amount": "0.1",
  "side": "bid",
  "tif": "GTC",           // GTC, IOC, ALO, TOB
  "reduce_only": false,
  "client_order_id": "uuid-string"
}
```

#### POST `/api/v1/orders/stop/create` - Create Stop Order
Places a stop order.

**Signing Type:** `create_stop_order`

#### POST `/api/v1/positions/tpsl` - Set Take Profit / Stop Loss
Updates TP/SL for an existing position.

**Signing Type:** `set_position_tpsl`

**Request:**
```json
{
  "account": "6ETn....",
  "signature": "...",
  "timestamp": 1716200000000,
  "symbol": "BTC",
  "side": "bid",
  "take_profit": {
    "stop_price": "55000",
    "limit_price": "54950",
    "client_order_id": "uuid-string"
  },
  "stop_loss": {
    "stop_price": "48000",
    "limit_price": "47950",
    "client_order_id": "uuid-string"
  },
  "builder_code": "MYBOON"  // optional
}
```

#### GET `/api/v1/orders?account={address}` - Get Open Orders
Returns all open orders for an account.

**Response:**
```json
{
  "success": true,
  "data": [{
    "order_id": 315979358,
    "client_order_id": "uuid-string",
    "symbol": "BTC",
    "side": "ask",
    "price": "96000",
    "initial_amount": "0.5",
    "filled_amount": "0",
    "cancelled_amount": "0",
    "order_type": "limit",
    "reduce_only": false,
    "created_at": 1759224706737,
    "updated_at": 1759224706737
  }],
  "last_order_id": 1557370337
}
```

#### POST `/api/v1/orders/cancel` - Cancel Order
Cancels a single order by ID.

**Signing Type:** `cancel_order`

#### POST `/api/v1/orders/cancel_all` - Cancel All Orders
Cancels all open orders for an account.

**Signing Type:** `cancel_all_orders`

---

## WebSocket API

### Connection
```python
import asyncio
import websockets
import json

async def connect():
    async with websockets.connect("wss://ws.pacifica.fi/ws", ping_interval=30) as ws:
        # Subscribe to streams
        await ws.send(json.dumps({
            "method": "subscribe",
            "params": {
                "channel": "prices",  # or "orderbook", "trades", etc.
                "symbol": "BTC"
            }
        }))
        
        # Listen for updates
        async for message in ws:
            print(json.loads(message))
```

### Available Streams (to be confirmed)
- `prices` - Real-time price updates
- `orderbook` - Orderbook depth updates
- `trades` - Recent trades
- `funding` - Funding rate updates
- `positions` - Position updates (authenticated)

### Heartbeat
Send ping every 30 seconds to keep connection alive:
```json
{"method": "ping"}
```
Response: `{"channel": "pong"}`

---

## Builder Code (Fee Sharing)

myboon can earn fees on user trades by registering as a builder.

### Registration
1. Choose a `builder_code` (alphanumeric, max 16 chars, e.g., "MYBOON")
2. Set your `fee_rate` (e.g., 0.0001 = 0.01%)

### User Authorization Flow
Before trading on behalf of a user, they must approve your builder code:

**POST `/api/v1/account/builder_codes/approve`**

**Signing Type:** `approve_builder_code`

**Request:**
```json
{
  "account": "6ETn....",
  "signature": "...",
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "builder_code": "MYBOON",
  "max_fee_rate": "0.001"  // User's max acceptable fee
}
```

### Check User Approvals
**GET `/api/v1/account/builder_codes/approvals?account={address}`**

Returns all builder codes the user has approved.

### Include Builder Code in Orders
Add `"builder_code": "MYBOON"` to any order request to earn fees.

---

## Market Symbols & Configuration

### Symbol Naming Rules
- Standard symbols: All CAPS (e.g., `BTC`, `ETH`, `SOL`)
- Symbols with numerical prefix: lowercase k (e.g., `kBONK`, `kPEPE`)
- **Case sensitive** - `btc` or `Btc` will fail

### Tick & Lot Sizes
Must be verified via `/api/v1/info` endpoint. General rules:
- **Tick size:** Based on 5 significant figures of current price
- **Lot size:** `lot_size * tick_size` ≈ `0.0001` or `0.00001`

### Example Markets (to be verified)
| Symbol | Tick Size | Lot Size | Max Leverage |
|--------|-----------|----------|--------------|
| BTC | 1 | 0.00001 | 50 |
| ETH | 0.1 | 0.0001 | 50 |
| SOL | 0.01 | 0.01 | 20 |

---

## Error Handling

### HTTP Status Codes
- `400` - Bad Request (invalid parameters)
- `403` - Forbidden (user hasn't approved builder code)
- `404` - Not Found
- `422` - Business Logic Error (see below)
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

### Business Logic Errors (422)
| Code | Error | Meaning |
|------|-------|---------|
| 1 | ACCOUNT_NOT_FOUND | Wallet not found |
| 4 | INSUFFICIENT_BALANCE | Not enough collateral |
| 5 | ORDER_NOT_FOUND | Order ID doesn't exist |
| 7 | INVALID_LEVERAGE | Leverage exceeds max |
| 9 | POSITION_NOT_FOUND | No position to close |
| 10 | POSITION_TPSL_LIMIT_EXCEEDED | Too many TP/SL orders |

---

## Python SDK Reference

### Repository
https://github.com/pacifica-fi/python-sdk

### Dependencies
```
requests>=2.31.0
solders>=0.19.0
websockets>=10.4
base58>=2.1.1
```

### Example: Create Market Order (REST)
```python
import time
import uuid
import requests
from solders.keypair import Keypair

PRIVATE_KEY = "your-key-here"
keypair = Keypair.from_base58_string(PRIVATE_KEY)
public_key = str(keypair.pubkey())

timestamp = int(time.time() * 1000)
payload = {
    "symbol": "BTC",
    "amount": "0.1",
    "side": "bid",
    "slippage_percent": "0.5",
    "reduce_only": False,
    "client_order_id": str(uuid.uuid4())
}

header = {
    "timestamp": timestamp,
    "expiry_window": 5000,
    "type": "create_market_order",
    "data": payload
}

# Sign
message = json.dumps(header, sort_keys=True, separators=(',', ':'))
signature = keypair.sign_message(message.encode()).to_base58()

# Request
request = {
    "account": public_key,
    "signature": signature,
    "timestamp": timestamp,
    **payload
}

response = requests.post(
    "https://api.pacifica.fi/api/v1/orders/create_market",
    json=request,
    headers={"Content-Type": "application/json"}
)
```

---

## Integration Checklist for myboon

### Phase 1: Read-Only Integration
- [ ] Fetch markets list (`/api/v1/info`)
- [ ] Fetch live prices (`/api/v1/info/prices`)
- [ ] Display market detail (OI, funding, 24h volume)
- [ ] Fetch user positions (`/api/v1/positions`)
- [ ] Fetch user account info (`/api/v1/account`)
- [ ] Fetch user open orders (`/api/v1/orders`)

### Phase 2: Trading Integration
- [ ] User wallet connection (Solana adapter)
- [ ] Create market order (`/api/v1/orders/create_market`)
- [ ] Create limit order (`/api/v1/orders/create`)
- [ ] Cancel order (`/api/v1/orders/cancel`)
- [ ] Set TP/SL (`/api/v1/positions/tpsl`)
- [ ] Order confirmation & error handling

### Phase 3: Builder Code & Revenue
- [ ] Register myboon builder code
- [ ] User approval flow (`/api/v1/account/builder_codes/approve`)
- [ ] Include builder code in all orders
- [ ] Track fee revenue (`/api/v1/builder/trades`)

### Phase 4: Real-Time Data
- [ ] WebSocket connection for live prices
- [ ] Subscribe to orderbook updates
- [ ] Real-time position PnL updates
- [ ] Funding rate alerts

### Phase 5: Collector Integration
- [ ] `pacific/discovery.ts` - Fetch top markets by volume/OI
- [ ] `pacific/stream.ts` - WebSocket price/OI streaming
- [ ] Signal generation: `FUNDING_SPIKE`, `OI_SURGE`, `LIQUIDATION_CASCADE`
- [ ] Write signals to Supabase `signals` table

### Phase 6: Brain Integration
- [ ] Analyst agent consumes Pacific signals
- [ ] Narrative generation for perp market movements
- [ ] Feed API endpoints for perp data
- [ ] Actions in published narratives: `{ type: 'perps', symbol }`

---

## Mobile App UI Requirements

### Trade Tab (`apps/hybrid-expo/app/trade.tsx`)
- [ ] Market list view (searchable, sorted by volume/OI)
- [ ] Market detail screen:
  - Price chart (integrate with existing chart lib)
  - Orderbook display
  - Long/Short position form
  - Leverage slider (1x - max leverage)
  - Take Profit / Stop Loss inputs
- [ ] Positions screen:
  - List of open positions with PnL
  - Close position button
  - Add TP/SL button
- [ ] Order history screen

### State Management
- [ ] Pacific market data store
- [ ] User positions/orders store
- [ ] Real-time price updates via WebSocket
- [ ] Transaction signing integration

---

## API Layer (`packages/api`)

### New Endpoints
- [ ] `GET /perps/markets` - Curated Pacific markets (proxy)
- [ ] `GET /perps/markets/:symbol` - Single market detail
- [ ] `GET /perps/prices` - All live prices
- [ ] `GET /perps/account/:address` - User account info
- [ ] `GET /perps/positions/:address` - User positions
- [ ] `GET /perps/orders/:address` - User open orders
- [ ] `POST /perps/order` - Forward signed order to Pacific
- [ ] `POST /perps/order/cancel` - Cancel order
- [ ] `POST /perps/position/tpsl` - Set TP/SL

### VPS Configuration
Pacific API may have geo-restrictions like Polymarket. Run API on VPS if needed.

---

## Next Steps

1. **Test API Access** - Verify mainnet/testnet endpoints work
2. **Register Builder Code** - Choose "MYBOON" or similar
3. **Create GitHub Issues** - Break down checklist items into trackable tasks
4. **SDK Decision** - Use Python SDK as reference, build TypeScript client for frontend
5. **Wallet Integration** - Ensure Solana wallet adapter is ready in mobile app
