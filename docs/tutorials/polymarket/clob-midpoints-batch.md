# CLOB: Get midpoint prices (batch)

> Retrieves midpoint prices for multiple token IDs using query parameters.
> The midpoint is calculated as the average of the best bid and best ask prices.

## Endpoint

```
GET https://clob.polymarket.com/midpoints?token_ids=<TOKEN_ID_1>,<TOKEN_ID_2>,...
```

No auth required.

## Response

Returns a map of token ID to midpoint price:

```json
{
  "0xabc123def456...": "0.45",
  "0xdef456abc123...": "0.52"
}
```

## Errors
- 400: Invalid payload
- 500: error getting the mid price
