# Market Channel WebSocket

> Real-time orderbook, price, and trade data. No auth required.

## Endpoint

```
wss://ws-subscriptions-clob.polymarket.com/ws/market
```

## Subscription

```json
{
  "assets_ids": ["<token_id_1>", "<token_id_2>"],
  "type": "market",
  "custom_feature_enabled": true
}
```

Set `custom_feature_enabled: true` to receive `best_bid_ask`, `new_market`, and `market_resolved` events.

## Message Types

### book

Emitted on subscribe and when a trade affects the book.

```json
{
  "event_type": "book",
  "asset_id": "...",
  "market": "0x...",
  "bids": [{ "price": ".48", "size": "30" }],
  "asks": [{ "price": ".52", "size": "25" }],
  "timestamp": "123456789000",
  "hash": "0x..."
}
```

### price_change

Emitted when a new order is placed or cancelled.

```json
{
  "market": "0x...",
  "price_changes": [
    {
      "asset_id": "...",
      "price": "0.5",
      "size": "200",
      "side": "BUY",
      "hash": "...",
      "best_bid": "0.5",
      "best_ask": "1"
    }
  ],
  "timestamp": "...",
  "event_type": "price_change"
}
```

`size` of `"0"` means the price level was removed.

### best_bid_ask (requires custom_feature_enabled)

Emitted when best bid/ask changes.

```json
{
  "event_type": "best_bid_ask",
  "market": "0x...",
  "asset_id": "...",
  "best_bid": "0.73",
  "best_ask": "0.77",
  "spread": "0.04",
  "timestamp": "..."
}
```

### last_trade_price

Emitted on trade match.

```json
{
  "asset_id": "...",
  "event_type": "last_trade_price",
  "fee_rate_bps": "0",
  "market": "0x...",
  "price": "0.456",
  "side": "BUY",
  "size": "219.217767",
  "timestamp": "..."
}
```

### tick_size_change

Emitted when tick size changes (price > 0.96 or < 0.04).

### new_market (requires custom_feature_enabled)

Emitted when a new market is created.

### market_resolved (requires custom_feature_enabled)

Emitted when a market is resolved. Includes `winning_asset_id` and `winning_outcome`.
