# CLOB: Get midpoint price

> Retrieves the midpoint price for a specific token ID.
> The midpoint is calculated as the average of the best bid and best ask prices.

## Endpoint

```
GET https://clob.polymarket.com/midpoint?token_id=<TOKEN_ID>
```

No auth required.

## Response

```json
{
  "mid_price": "0.45"
}
```

## Errors
- 400: Invalid token id
- 404: No orderbook exists for the requested token id
