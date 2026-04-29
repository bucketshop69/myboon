> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Error Codes

> Complete reference for CLOB API error responses

All CLOB API errors return a JSON object with a single `error` field:

```json theme={null}
{
  "error": "<message>"
}
```

***

## Global Errors

These errors can occur on **any authenticated endpoint**.

<ResponseField name="401" type="Unauthorized">
  `Unauthorized/Invalid api key` — Your API key is missing, expired, or invalid. Ensure you're sending all required [authentication headers](/trading/overview#authentication).
</ResponseField>

<ResponseField name="401" type="Unauthorized">
  `Invalid L1 Request headers` — Your L1 authentication headers (HMAC signature) are malformed or the signature doesn't match. See [Authentication](/api-reference/authentication).
</ResponseField>

<ResponseField name="503" type="Service Unavailable">
  `Trading is currently disabled. Check polymarket.com for updates` — The exchange is temporarily paused. No orders (including cancels) are accepted.
</ResponseField>

<ResponseField name="503" type="Service Unavailable">
  `Trading is currently cancel-only. New orders are not accepted, but cancels are allowed.` — The exchange is in cancel-only mode. You can cancel existing orders but cannot place new ones.
</ResponseField>

<ResponseField name="429" type="Too Many Requests">
  `Too Many Requests` — You've exceeded the [rate limit](/api-reference/rate-limits). Back off and retry with exponential backoff.
</ResponseField>

***

## Order Book

Errors from the order book endpoints.

### GET book

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The `token_id` query parameter is missing or not a valid token ID.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `No orderbook exists for the requested token id`
</ResponseField>

### POST books

<ResponseField name="400" type="Bad Request">
  `Invalid payload` — The request body is malformed or missing required fields.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Payload exceeds the limit` — Too many token IDs in a single request. Reduce the batch size.
</ResponseField>

***

## Pricing

Errors from price, midpoint, and spread endpoints.

### GET price

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The `token_id` parameter is missing or invalid.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Invalid side` — The `side` parameter must be `BUY` or `SELL`.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `No orderbook exists for the requested token id`
</ResponseField>

### POST prices

<ResponseField name="400" type="Bad Request">
  `Invalid payload` — The request body is malformed or missing required fields.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Invalid side` — The `side` field must be `BUY` or `SELL`.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Payload exceeds the limit` — Too many token IDs in a single request.
</ResponseField>

### GET midpoint

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The `token_id` parameter is missing or invalid.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `No orderbook exists for the requested token id`
</ResponseField>

### POST midpoints

<ResponseField name="400" type="Bad Request">
  `Invalid payload` — The request body is malformed or missing required fields.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Payload exceeds the limit` — Too many token IDs in a single request.
</ResponseField>

### GET spread

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The `token_id` parameter is missing or invalid.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `No orderbook exists for the requested token id`
</ResponseField>

### POST spreads

<ResponseField name="400" type="Bad Request">
  `Invalid payload` — The request body is malformed or missing required fields.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Payload exceeds the limit` — Too many token IDs in a single request.
</ResponseField>

***

## Place Orders

Errors from order placement endpoints.

### POST order

<ResponseField name="400" type="Bad Request">
  `Invalid order payload` — The request body is malformed, missing required fields, or contains invalid values.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `the order owner has to be the owner of the API KEY` — The `maker` address in the order doesn't match the address associated with your API key.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `the order signer address has to be the address of the API KEY`
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `'{address}' address banned` — This address has been banned from trading.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `'{address}' address in closed only mode`
</ResponseField>

### POST orders

All errors from `POST /order` apply, plus:

<ResponseField name="400" type="Bad Request">
  `Too many orders in payload: {N}, max allowed: {M}` — The batch contains more orders than the maximum allowed per request.
</ResponseField>

Per-order errors are returned in the `200` response array, with individual error messages for each failed order.

***

## Order Processing Errors

These errors are returned when an order passes initial validation but fails during processing. They appear in the response body of `POST /order` and `POST /orders`.

<ResponseField name="400" type="Bad Request">
  `invalid post-only order: order crosses book` — A post-only (maker) order would immediately match. Adjust the price so it rests on the book.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order {id} is invalid. Price ({price}) breaks minimum tick size rule: {tick}` — The order price doesn't align with the market's tick size. Use [`GET /tick-size`](/api-reference/clob#get-tick-size) to check the valid tick size.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order {id} is invalid. Size ({size}) lower than the minimum: {min}` — The order size is below the market minimum.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order {id} is invalid. Duplicated.`
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order {id} crosses the book`
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `not enough balance / allowance` — Insufficient pUSD balance or token allowance. Check your balance with [`GET /balance-allowance`](/api-reference/clob#get-balance-allowance) and approve the exchange contract if needed.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `invalid expiration` — The order expiration timestamp is in the past or invalid.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order canceled in the CTF exchange contract`
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order match delayed due to market conditions`
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `order couldn't be fully filled. FOK orders are fully filled or killed.` — A Fill-or-Kill order could not be completely filled by available liquidity. The entire order is rejected.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `no orders found to match with FAK order. FAK orders are partially filled or killed if no match is found.` — A Fill-and-Kill order found no matching orders at all. At least one match is required.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `the market is not yet ready to process new orders`
</ResponseField>

***

## Matching Engine Errors

Internal matching engine errors that may surface during order execution.

<ResponseField name="425" type="Too Early">
  The matching engine is restarting. Retry with exponential backoff. See [Matching Engine](/trading/matching-engine) for details on restart schedule and handling.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `there are no matching orders`
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `FOK orders are filled or killed` — A Fill-or-Kill order could not be fully satisfied.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `the trade contains rounding issues`
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `the price of the taker's order has a discrepancy greater than allowed with the worst maker order`
</ResponseField>

***

## Cancel Orders

Errors from order cancellation endpoints.

### DELETE order

<ResponseField name="400" type="Bad Request">
  `Invalid order payload` — The request body is malformed.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Invalid orderID` — The provided order ID is not a valid format.
</ResponseField>

### DELETE orders

<ResponseField name="400" type="Bad Request">
  `Invalid order payload` — The request body is malformed.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Too many orders in payload, max allowed: {N}` — Too many order IDs in a single cancellation request.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Invalid orderID` — One or more order IDs are not valid.
</ResponseField>

### DELETE cancel-market-orders

<ResponseField name="400" type="Bad Request">
  `Invalid order payload` — The request body is malformed or contains invalid filter parameters.
</ResponseField>

***

## Query Orders

Errors from order query endpoints.

### GET order by ID

<ResponseField name="400" type="Bad Request">
  `Invalid orderID` — The order ID in the URL path is not valid.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `Internal server error` — An unexpected error occurred while fetching the order.
</ResponseField>

### GET orders

<ResponseField name="400" type="Bad Request">
  `invalid order params payload` — The query parameters are malformed or contain invalid values.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `Internal server error` — An unexpected error occurred while fetching orders.
</ResponseField>

***

## Trades

### GET trades

<ResponseField name="400" type="Bad Request">
  `Invalid trade params payload` — The query parameters are malformed or contain invalid values.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `Internal server error` — An unexpected error occurred while fetching trades.
</ResponseField>

### GET last-trade-price

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The `token_id` parameter is missing or invalid.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `Internal server error` — An unexpected error occurred while fetching the last trade price.
</ResponseField>

### POST last-trades-prices

<ResponseField name="400" type="Bad Request">
  `Invalid payload` — The request body is malformed or missing required fields.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Payload exceeds the limit` — Too many token IDs in a single request.
</ResponseField>

***

## Markets

### GET market by condition ID

<ResponseField name="400" type="Bad Request">
  `Invalid market` — The condition ID is not a valid format.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `market not found` — No market exists with this condition ID.
</ResponseField>

### GET tick-size

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The token ID is not valid.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `market not found` — No market found for this token ID.
</ResponseField>

### GET neg-risk

<ResponseField name="400" type="Bad Request">
  `Invalid token id` — The token ID is not valid.
</ResponseField>

<ResponseField name="404" type="Not Found">
  `market not found` — No market found for this token ID.
</ResponseField>

***

## Price History

### GET prices-history

<ResponseField name="400" type="Bad Request">
  Filter validation errors — One or more query parameters (`market`, `startTs`, `endTs`, `fidelity`) are invalid.
</ResponseField>

### GET ohlc

<ResponseField name="400" type="Bad Request">
  `startTs is required` — The `startTs` query parameter is missing.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `asset_id is required` — The `asset_id` query parameter is missing.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `invalid fidelity: {val}` — The `fidelity` parameter must be one of: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `limit cannot exceed 1000` — Reduce the `limit` parameter to 1000 or below.
</ResponseField>

### GET orderbook-history

<ResponseField name="400" type="Bad Request">
  `startTs is required` — The `startTs` query parameter is missing.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `either market or asset_id must be provided` — You must specify either a `market` (condition ID) or `asset_id` (token ID).
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `limit cannot exceed 1000` — Reduce the `limit` parameter to 1000 or below.
</ResponseField>

***

## Authentication and API Keys

### POST auth api-key

<ResponseField name="401" type="Unauthorized">
  `Invalid L1 Request headers` — L1 authentication headers are missing or invalid.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Could not create api key`
</ResponseField>

### GET auth api-keys

<ResponseField name="500" type="Internal Server Error">
  `Could not retrieve API keys` — An unexpected error occurred while fetching your API keys.
</ResponseField>

### DELETE auth api-key

<ResponseField name="500" type="Internal Server Error">
  `Could not delete API key` — An unexpected error occurred while deleting the API key.
</ResponseField>

### GET auth derive-api-key

<ResponseField name="401" type="Unauthorized">
  `Invalid L1 Request headers` — L1 authentication headers are missing or invalid.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Could not derive api key!`
</ResponseField>

***

## Builder API Keys

### POST auth builder-api-key

<ResponseField name="500" type="Internal Server Error">
  `could not create builder api key` — Builder API key creation failed.
</ResponseField>

### GET auth builder-api-key

<ResponseField name="500" type="Internal Server Error">
  `could not get builder api keys` — An unexpected error occurred while fetching builder API keys.
</ResponseField>

### DELETE auth builder-api-key

<ResponseField name="400" type="Bad Request">
  `invalid revoke builder api key body` — The request body is malformed.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `invalid revoke builder api key headers` — Required authentication headers are missing.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `could not revoke the builder api key: {key}` — An unexpected error occurred while revoking the key.
</ResponseField>

***

## Builder Trades

### GET builder trades

<ResponseField name="400" type="Bad Request">
  `invalid builder trade params` — The query parameters are malformed or contain invalid values.
</ResponseField>

<ResponseField name="500" type="Internal Server Error">
  `could not fetch builder trades` — An unexpected error occurred while fetching builder trades.
</ResponseField>

***

## Balance and Allowance

### GET balance-allowance

<ResponseField name="400" type="Bad Request">
  `Invalid asset type` — The `asset_type` parameter is not a recognized asset type.
</ResponseField>

<ResponseField name="400" type="Bad Request">
  `Invalid signature_type` — The `signature_type` parameter must be `EOA`, `POLY_PROXY`, or `GNOSIS_SAFE`.
</ResponseField>

***

## Status Code Reference

| Status | Meaning               | Common Causes                                                                                       |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------- |
| `400`  | Bad Request           | Invalid parameters, malformed payload, business logic violation                                     |
| `401`  | Unauthorized          | Missing or invalid API key, bad HMAC signature, expired timestamp                                   |
| `404`  | Not Found             | Market doesn't exist, order not found, token ID not recognized                                      |
| `425`  | Too Early             | Matching engine is restarting — retry with backoff. See [Matching Engine](/trading/matching-engine) |
| `429`  | Too Many Requests     | Rate limit exceeded — implement exponential backoff                                                 |
| `500`  | Internal Server Error | Unexpected server error — retry with backoff                                                        |
| `503`  | Service Unavailable   | Exchange paused or in cancel-only mode                                                              |

<Note>
  The CLOB API has an internal override: any error message containing `"not found"` returns `404`, `"unauthorized"` returns `401`, and `"context canceled"` returns `400`, regardless of the original status code.
</Note>
