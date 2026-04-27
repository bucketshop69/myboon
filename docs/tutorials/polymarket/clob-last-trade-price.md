# CLOB: Get last trade price

> Retrieves the last trade price and side for a specific token ID.
> Returns default values of "0.5" for price and empty string for side if no trades found.

## Single

```
GET https://clob.polymarket.com/last-trade-price?token_id=<TOKEN_ID>
```

Response:
```json
{
  "price": "0.45",
  "side": "BUY"
}
```

## Batch (up to 500 tokens)

```
GET https://clob.polymarket.com/last-trades-prices?token_ids=<TOKEN_ID_1>,<TOKEN_ID_2>,...
```

Response:
```json
[
  { "token_id": "0xabc123...", "price": "0.45", "side": "BUY" },
  { "token_id": "0xdef456...", "price": "0.52", "side": "SELL" }
]
```

## Errors
- 400: Invalid token id / Invalid payload / Payload exceeds the limit
- 500: Internal server error
