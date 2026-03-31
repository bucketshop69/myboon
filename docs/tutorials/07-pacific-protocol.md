# Pacific Protocol Integration Tutorial

**Last Updated:** March 31, 2026  
**Status:** Reference Documentation  
**API Version:** v1  
**SDK:** Python (reference), TypeScript (to be built)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication & Signing](#authentication--signing)
3. [Market Data](#market-data)
4. [Account & Positions](#account--positions)
5. [Trading](#trading)
6. [WebSocket Streams](#websocket-streams)
7. [Builder Code (Fee Sharing)](#builder-code-fee-sharing)
8. [Error Handling](#error-handling)
9. [TypeScript Client](#typescript-client)

---

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install @solana/web3.js bs58
# or
pnpm add @solana/web3.js bs58
```

### API Endpoints

```typescript
const PACIFIC_CONFIG = {
  mainnet: {
    rest: 'https://api.pacifica.fi/api/v1',
    ws: 'wss://ws.pacifica.fi/ws'
  },
  testnet: {
    rest: 'https://test-api.pacifica.fi/api/v1',
    ws: 'wss://test-ws.pacifica.fi/ws'
  }
}
```

### Rate Limits

- **Window:** 60 seconds (rolling)
- **Base Quota:** 125 credits (IP), 300 credits (API key)
- **Cost:** 1 credit per request, 0.5 for cancellations
- **Headers:** Check `ratelimit` response header (divide value by 10)

---

## Authentication & Signing

### Ed25519 Signing Flow

All POST requests require Ed25519 signatures.

```typescript
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

/**
 * Sign a Pacific API request
 */
function signRequest(
  keypair: Keypair,
  type: string,
  payload: Record<string, any>,
  expiryWindow: number = 5000
) {
  const timestamp = Date.now() // milliseconds
  
  // 1. Build header
  const header = {
    timestamp,
    expiry_window: expiryWindow,
    type,
    data: payload
  }
  
  // 2. Deterministic JSON (sorted keys, compact)
  const message = JSON.stringify(header, Object.keys(header).sort(), separators=(',', ':'))
  
  // 3. Sign
  const signature = bs58.encode(keypair.signMessage(new TextEncoder().encode(message)))
  
  return {
    timestamp,
    signature,
    message
  }
}
```

### Example: Generate Request Headers

```typescript
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!))

const { timestamp, signature } = signRequest(
  keypair,
  'create_market_order',
  {
    symbol: 'BTC',
    amount: '0.1',
    side: 'bid',
    slippage_percent: '0.5',
    reduce_only: false
  }
)

const headers = {
  'Content-Type': 'application/json',
  'account': keypair.publicKey.toString(),
  'signature': signature,
  'timestamp': timestamp.toString(),
  'expiry_window': '5000'
}
```

### Signing Types

| Endpoint Type | Signing `type` Value |
|---------------|---------------------|
| Market Order | `create_market_order` |
| Limit Order | `create_order` |
| Stop Order | `create_stop_order` |
| TP/SL | `set_position_tpsl` |
| Cancel Order | `cancel_order` |
| Cancel All | `cancel_all_orders` |
| Approve Builder | `approve_builder_code` |
| Revoke Builder | `revoke_builder_code` |

---

## Market Data

### Get All Markets

Fetch all available perpetual markets with configuration.

```typescript
async function getMarkets() {
  const response = await fetch(`${PACIFIC_CONFIG.mainnet.rest}/info`)
  const data = await response.json()
  
  return data.data // Array of MarketInfo
}

interface MarketInfo {
  symbol: string
  tick_size: string
  lot_size: string
  max_leverage: number
  min_order_size: string
  max_order_size: string
  funding_rate: string
  next_funding_rate: string
  isolated_only: boolean
  created_at: number
}
```

**Example Response:**
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
    "isolated_only": false
  }]
}
```

### Get Live Prices

Fetch real-time prices, mark prices, funding rates, and open interest.

```typescript
async function getPrices() {
  const response = await fetch(`${PACIFIC_CONFIG.mainnet.rest}/info/prices`)
  const data = await response.json()
  
  return data.data // Array of PriceInfo
}

interface PriceInfo {
  symbol: string
  oracle: string        // Oracle price
  mark: string          // Mark price
  mid: string           // Mid price
  funding: string       // Last funding rate
  next_funding: string  // Next estimated funding
  open_interest: string // OI in USD
  volume_24h: string    // 24h volume in USD
  yesterday_price: string
  timestamp: number
}
```

**Example Response:**
```json
{
  "success": true,
  "data": [{
    "symbol": "BTC",
    "oracle": "95000.50",
    "mark": "95010.25",
    "mid": "95005.00",
    "funding": "0.00010529",
    "next_funding": "0.00011096",
    "open_interest": "3634796",
    "volume_24h": "20896698.07",
    "yesterday_price": "94500.00",
    "timestamp": 1759222967974
  }]
}
```

### Symbol Naming Rules

- **Standard symbols:** All CAPS (`BTC`, `ETH`, `SOL`)
- **Numerical prefix:** Lowercase k (`kBONK`, `kPEPE`)
- **Case sensitive:** `btc` or `Btc` will fail

---

## Account & Positions

### Get Account Info

```typescript
async function getAccountInfo(address: string) {
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/account?account=${address}`
  )
  const data = await response.json()
  
  return data.data // AccountInfo
}

interface AccountInfo {
  balance: string
  account_equity: string
  available_to_spend: string
  available_to_withdraw: string
  total_margin_used: string
  cross_mmr: string
  fee_level: number
  maker_fee: string
  taker_fee: string
  positions_count: number
  orders_count: number
  stop_orders_count: number
  updated_at: number
}
```

### Get Positions

```typescript
async function getPositions(address: string) {
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/positions?account=${address}`
  )
  const data = await response.json()
  
  return {
    positions: data.data,
    lastOrderId: data.last_order_id
  }
}

interface Position {
  symbol: string
  side: 'bid' | 'ask'  // bid = long, ask = short
  amount: string
  entry_price: string
  funding: string      // Cumulative funding paid/received
  isolated: boolean    // false = cross margin
  created_at: number
  updated_at: number
}
```

### Get Open Orders

```typescript
async function getOpenOrders(address: string) {
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/orders?account=${address}`
  )
  const data = await response.json()
  
  return {
    orders: data.data,
    lastOrderId: data.last_order_id
  }
}

interface Order {
  order_id: number
  client_order_id: string
  symbol: string
  side: 'bid' | 'ask'
  price: string
  initial_amount: string
  filled_amount: string
  cancelled_amount: string
  order_type: 'market' | 'limit' | 'stop_limit' | 'stop_market'
  reduce_only: boolean
  created_at: number
  updated_at: number
}
```

---

## Trading

### Create Market Order

Opens or closes a position at market price.

```typescript
async function createMarketOrder(
  keypair: Keypair,
  params: {
    symbol: string
    amount: string
    side: 'bid' | 'ask'
    slippagePercent: string
    reduceOnly: boolean
    clientOrderId?: string
    takeProfit?: { stopPrice: string; limitPrice: string }
    stopLoss?: { stopPrice: string; limitPrice: string }
  }
) {
  const payload = {
    symbol: params.symbol,
    amount: params.amount,
    side: params.side,
    slippage_percent: params.slippagePercent,
    reduce_only: params.reduceOnly,
    client_order_id: params.clientOrderId || crypto.randomUUID()
  }
  
  // Add TP/SL if provided
  if (params.takeProfit) {
    payload['take_profit'] = {
      stop_price: params.takeProfit.stopPrice,
      limit_price: params.takeProfit.limitPrice,
      client_order_id: crypto.randomUUID()
    }
  }
  
  if (params.stopLoss) {
    payload['stop_loss'] = {
      stop_price: params.stopLoss.stopPrice,
      limit_price: params.stopLoss.limitPrice,
      client_order_id: crypto.randomUUID()
    }
  }
  
  // Sign
  const { timestamp, signature } = signRequest(
    keypair,
    'create_market_order',
    payload
  )
  
  // Build request
  const request = {
    account: keypair.publicKey.toString(),
    signature,
    timestamp,
    expiry_window: 5000,
    ...payload
  }
  
  // Send
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/orders/create_market`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  )
  
  const data = await response.json()
  return data.order_id
}
```

**Usage:**
```typescript
const orderId = await createMarketOrder(keypair, {
  symbol: 'BTC',
  amount: '0.1',
  side: 'bid',  // long
  slippagePercent: '0.5',
  reduceOnly: false,
  takeProfit: { stopPrice: '100000', limitPrice: '99950' },
  stopLoss: { stopPrice: '90000', limitPrice: '89950' }
})

console.log('Order created:', orderId)
```

### Create Limit Order

Places a limit order on the orderbook.

```typescript
async function createLimitOrder(
  keypair: Keypair,
  params: {
    symbol: string
    price: string
    amount: string
    side: 'bid' | 'ask'
    tif: 'GTC' | 'IOC' | 'ALO' | 'TOB'
    reduceOnly: boolean
    clientOrderId?: string
  }
) {
  const payload = {
    symbol: params.symbol,
    price: params.price,
    amount: params.amount,
    side: params.side,
    tif: params.tif,
    reduce_only: params.reduceOnly,
    client_order_id: params.clientOrderId || crypto.randomUUID()
  }
  
  const { timestamp, signature } = signRequest(
    keypair,
    'create_order',
    payload
  )
  
  const request = {
    account: keypair.publicKey.toString(),
    signature,
    timestamp,
    expiry_window: 5000,
    ...payload
  }
  
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/orders/create`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  )
  
  const data = await response.json()
  return data.order_id
}
```

**Time in Force Options:**
- `GTC` - Good Till Cancelled
- `IOC` - Immediate or Cancel
- `ALO` - Add Liquidity Only (maker order)
- `TOB` - Top of Book

### Cancel Order

```typescript
async function cancelOrder(
  keypair: Keypair,
  orderId: number
) {
  const payload = { order_id: orderId }
  
  const { timestamp, signature } = signRequest(
    keypair,
    'cancel_order',
    payload
  )
  
  const request = {
    account: keypair.publicKey.toString(),
    signature,
    timestamp,
    expiry_window: 5000,
    order_id: orderId
  }
  
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/orders/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  )
  
  return response.ok
}
```

### Set Take Profit / Stop Loss

Updates TP/SL for an existing position.

```typescript
async function setPositionTPSL(
  keypair: Keypair,
  params: {
    symbol: string
    side: 'bid' | 'ask'
    takeProfit?: { stopPrice: string; limitPrice: string }
    stopLoss?: { stopPrice: string; limitPrice: string }
    builderCode?: string
  }
) {
  const payload: any = {
    symbol: params.symbol,
    side: params.side
  }
  
  if (params.takeProfit) {
    payload.take_profit = {
      stop_price: params.takeProfit.stopPrice,
      limit_price: params.takeProfit.limitPrice,
      client_order_id: crypto.randomUUID()
    }
  }
  
  if (params.stopLoss) {
    payload.stop_loss = {
      stop_price: params.stopLoss.stopPrice,
      limit_price: params.stopLoss.limitPrice,
      client_order_id: crypto.randomUUID()
    }
  }
  
  if (params.builderCode) {
    payload.builder_code = params.builderCode
  }
  
  const { timestamp, signature } = signRequest(
    keypair,
    'set_position_tpsl',
    payload
  )
  
  const request = {
    account: keypair.publicKey.toString(),
    signature,
    timestamp,
    expiry_window: 5000,
    ...payload
  }
  
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/positions/tpsl`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  )
  
  return response.ok
}
```

---

## WebSocket Streams

### Basic Connection

```typescript
import WebSocket from 'ws'

async function connectWebSocket() {
  const ws = new WebSocket(PACIFIC_CONFIG.mainnet.ws)
  
  // Heartbeat - ping every 30 seconds
  const heartbeat = setInterval(() => {
    ws.send(JSON.stringify({ method: 'ping' }))
  }, 30000)
  
  ws.on('open', () => {
    console.log('Connected to Pacific WebSocket')
  })
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())
    console.log('Received:', message)
  })
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
  
  ws.on('close', () => {
    clearInterval(heartbeat)
    console.log('Disconnected')
  })
  
  return ws
}
```

### Subscribe to Price Stream

```typescript
async function subscribeToPrices(ws: WebSocket, symbol: string) {
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: {
      channel: 'prices',
      symbol: symbol
    }
  }))
}

// Usage
const ws = await connectWebSocket()
await subscribeToPrices(ws, 'BTC')

ws.on('message', (data) => {
  const message = JSON.parse(data.toString())
  if (message.channel === 'prices') {
    console.log('BTC Price Update:', message.data)
  }
})
```

### Available Streams (Reference)

| Channel | Description | Parameters |
|---------|-------------|------------|
| `prices` | Real-time price updates | `symbol` |
| `orderbook` | Orderbook depth updates | `symbol` |
| `trades` | Recent trades | `symbol` |
| `funding` | Funding rate updates | `symbol` |
| `positions` | Position updates (auth required) | `account` |

### Connection Limits

- Max 300 concurrent connections per IP
- Max 20 subscriptions per channel per connection
- Connection closes after 60s idle or 24h lifetime

---

## Builder Code (Fee Sharing)

myboon can earn fees on user trades by registering as a builder.

### Overview

1. Register a `builder_code` (alphanumeric, max 16 chars)
2. Users approve your code with a max fee rate
3. Include `builder_code` in order requests
4. Earn fee share on all trades

### User Approval Flow

Users must approve your builder code before you can trade on their behalf.

```typescript
async function approveBuilderCode(
  keypair: Keypair,
  builderCode: string,
  maxFeeRate: string = '0.001'  // 0.1%
) {
  const payload = {
    builder_code: builderCode,
    max_fee_rate: maxFeeRate
  }
  
  const { timestamp, signature } = signRequest(
    keypair,
    'approve_builder_code',
    payload
  )
  
  const request = {
    account: keypair.publicKey.toString(),
    signature,
    timestamp,
    expiry_window: 5000,
    builder_code: builderCode,
    max_fee_rate: maxFeeRate
  }
  
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/account/builder_codes/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }
  )
  
  return response.ok
}
```

### Check User Approvals

```typescript
async function getBuilderApprovals(address: string) {
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/account/builder_codes/approvals?account=${address}`
  )
  const data = await response.json()
  
  return data.data // Array of approved builder codes
}
```

### Include Builder Code in Orders

```typescript
// Add to any order request
const request = {
  account: keypair.publicKey.toString(),
  signature,
  timestamp,
  expiry_window: 5000,
  symbol: 'BTC',
  amount: '0.1',
  side: 'bid',
  slippage_percent: '0.5',
  reduce_only: false,
  builder_code: 'MYBOON'  // ← Your builder code
}
```

### Track Builder Revenue

```typescript
async function getBuilderTrades(builderCode: string) {
  const response = await fetch(
    `${PACIFIC_CONFIG.mainnet.rest}/builder/trades?builder_code=${builderCode}`
  )
  const data = await response.json()
  
  return data.data // Array of trades with fee earnings
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad Request | Check request parameters |
| 403 | Forbidden | User hasn't approved builder code |
| 404 | Not Found | Resource doesn't exist |
| 422 | Business Logic Error | See error codes below |
| 429 | Rate Limit Exceeded | Wait and retry |
| 500 | Internal Server Error | Retry with backoff |

### Business Logic Errors (422)

```typescript
interface PacificError {
  error: string
  code: number
}

const ERROR_CODES: Record<number, string> = {
  0: 'UNKNOWN',
  1: 'ACCOUNT_NOT_FOUND',
  2: 'BOOK_NOT_FOUND',
  3: 'INVALID_TICK_LEVEL',
  4: 'INSUFFICIENT_BALANCE',
  5: 'ORDER_NOT_FOUND',
  6: 'OVER_WITHDRAWAL',
  7: 'INVALID_LEVERAGE',
  8: 'CANNOT_UPDATE_MARGIN',
  9: 'POSITION_NOT_FOUND',
  10: 'POSITION_TPSL_LIMIT_EXCEEDED'
}

function handlePacificError(error: PacificError) {
  const message = ERROR_CODES[error.code] || 'UNKNOWN_ERROR'
  console.error(`Pacific Error ${error.code}: ${message}`)
  
  switch (error.code) {
    case 4:
      // Insufficient balance - prompt user to deposit
      break
    case 7:
      // Invalid leverage - show max leverage for market
      break
    case 429:
      // Rate limit - implement exponential backoff
      break
  }
}
```

### Rate Limit Handling

```typescript
async function fetchWithRateLimit(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  
  // Check rate limit headers
  const remaining = response.headers.get('ratelimit')
  const policy = response.headers.get('ratelimit-policy')
  
  if (remaining) {
    const credits = parseInt(remaining) / 10  // Divide by 10
    console.log(`Rate limit: ${credits} credits remaining`)
    
    if (credits < 10) {
      // Wait for refresh
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
  
  return response
}
```

---

## TypeScript Client

### Utility Functions

```typescript
// utils/pacific.ts
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

export const PACIFIC_CONFIG = {
  mainnet: {
    rest: 'https://api.pacifica.fi/api/v1',
    ws: 'wss://ws.pacifica.fi/ws'
  },
  testnet: {
    rest: 'https://test-api.pacifica.fi/api/v1',
    ws: 'wss://test-ws.pacifica.fi/ws'
  }
}

export function signRequest(
  keypair: Keypair,
  type: string,
  payload: Record<string, any>,
  expiryWindow: number = 5000
) {
  const timestamp = Date.now()
  
  const header = {
    timestamp,
    expiry_window: expiryWindow,
    type,
    data: payload
  }
  
  // Deterministic JSON serialization
  const message = JSON.stringify(header, Object.keys(header).sort())
  
  const signature = bs58.encode(keypair.signMessage(new TextEncoder().encode(message)))
  
  return { timestamp, signature, message }
}

export async function pacificFetch(
  endpoint: string,
  options?: RequestInit
) {
  const url = `${PACIFIC_CONFIG.mainnet.rest}${endpoint}`
  const response = await fetch(url, options)
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(`Pacific API Error: ${data.error || response.statusText}`)
  }
  
  return data
}
```

### Type Definitions

```typescript
// types/pacific.ts
export interface MarketInfo {
  symbol: string
  tick_size: string
  lot_size: string
  max_leverage: number
  min_order_size: string
  max_order_size: string
  funding_rate: string
  next_funding_rate: string
  isolated_only: boolean
  created_at: number
}

export interface PriceInfo {
  symbol: string
  oracle: string
  mark: string
  mid: string
  funding: string
  next_funding: string
  open_interest: string
  volume_24h: string
  yesterday_price: string
  timestamp: number
}

export interface Position {
  symbol: string
  side: 'bid' | 'ask'
  amount: string
  entry_price: string
  funding: string
  isolated: boolean
  created_at: number
  updated_at: number
}

export interface Order {
  order_id: number
  client_order_id: string
  symbol: string
  side: 'bid' | 'ask'
  price: string
  initial_amount: string
  filled_amount: string
  cancelled_amount: string
  order_type: string
  reduce_only: boolean
  created_at: number
  updated_at: number
}
```

---

## Reference

- **Official Docs:** https://pacifica.gitbook.io/docs
- **Python SDK:** https://github.com/pacifica-fi/python-sdk
- **Discord Support:** Pacific API channel
- **MCP Server:** `claude mcp add pacifica --scope project --transport http https://pacifica.gitbook.io/docs/~gitbook/mcp`
