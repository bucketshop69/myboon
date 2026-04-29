> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Create Order

> Build, sign, and submit orders

All orders on Polymarket are expressed as **limit orders**. Market orders are supported by submitting a limit order with a marketable price — your order executes immediately at the best available price on the book.

<Info>
  The SDK handles EIP-712 signing and submission for you. If you prefer the REST
  API directly, see [Authentication](/api-reference/authentication) for constructing the
  required headers and the [API Reference](/api-reference/introduction) for full endpoint
  documentation including the raw order object fields and request/response schemas.
</Info>

***

## Order Types

| Type    | Behavior                                                             | Use Case                        |
| ------- | -------------------------------------------------------------------- | ------------------------------- |
| **GTC** | Good-Til-Cancelled — rests on the book until filled or cancelled     | Default for limit orders        |
| **GTD** | Good-Til-Date — active until a specified expiration time             | Auto-expire before known events |
| **FOK** | Fill-Or-Kill — must fill immediately and entirely, or cancel         | All-or-nothing market orders    |
| **FAK** | Fill-And-Kill — fills what's available immediately, cancels the rest | Partial-fill market orders      |

* **GTC** and **GTD** are limit order types — they rest on the book at your specified price.
* **FOK** and **FAK** are market order types — they execute against resting liquidity immediately.
  * **BUY**: specify the dollar amount you want to spend
  * **SELL**: specify the number of shares you want to sell

***

## Limit Orders

The simplest way to place a limit order — create, sign, and submit in one call:

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { ClobClient, Side, OrderType } from "@polymarket/clob-client-v2";

  const response = await client.createAndPostOrder(
    {
      tokenID: "TOKEN_ID",
      price: 0.5,
      size: 10,
      side: Side.BUY,
    },
    {
      tickSize: "0.01",
      negRisk: false,
    },
    OrderType.GTC,
  );

  console.log("Order ID:", response.orderID);
  console.log("Status:", response.status);

  ```

  ```python Python theme={null}
  from py_clob_client_v2 import OrderArgs, OrderType, PartialCreateOrderOptions
  from py_clob_client_v2.order_builder.constants import BUY

  response = client.create_and_post_order(
      OrderArgs(
          token_id="TOKEN_ID",
          price=0.50,
          size=10,
          side=BUY,
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False),
      order_type=OrderType.GTC
  )

  print("Order ID:", response["orderID"])
  print("Status:", response["status"])
  ```

  ```rust Rust theme={null}
  use polymarket_client_sdk_v2::clob::types::Side;
  use polymarket_client_sdk_v2::types::dec;

  let token_id = "TOKEN_ID".parse()?;
  let order = client
      .limit_order()
      .token_id(token_id)
      .price(dec!(0.50))
      .size(dec!(10))
      .side(Side::Buy)
      .build()
      .await?;
  let signed = client.sign(&signer, order).await?;
  let response = client.post_order(signed).await?;

  println!("Order ID: {}", response.order_id);
  println!("Status: {:?}", response.status);
  ```

</CodeGroup>

### Two-Step Sign Then Submit

For more control, you can separate signing from submission. This is useful for batch orders or custom submission logic:

<CodeGroup>
  ```typescript TypeScript theme={null}
  // Step 1: Create and sign locally
  const signedOrder = await client.createOrder(
    {
      tokenID: "TOKEN_ID",
      price: 0.5,
      size: 10,
      side: Side.BUY,
    },
    { tickSize: "0.01", negRisk: false },
  );

  // Step 2: Submit to the CLOB
  const response = await client.postOrder(signedOrder, OrderType.GTC);

  ```

  ```python Python theme={null}
  # Step 1: Create and sign locally
  signed_order = client.create_order(
      OrderArgs(
          token_id="TOKEN_ID",
          price=0.50,
          size=10,
          side=BUY,
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False)
  )

  # Step 2: Submit to the CLOB
  response = client.post_order(signed_order, OrderType.GTC)
  ```

  ```rust Rust theme={null}
  // Step 1: Create order (auto-fetches tick size, neg risk, fee rate)
  let order = client
      .limit_order()
      .token_id("TOKEN_ID".parse()?)
      .price(dec!(0.50))
      .size(dec!(10))
      .side(Side::Buy)
      .build()
      .await?;

  // Step 2: Sign and submit separately
  let signed = client.sign(&signer, order).await?;
  let response = client.post_order(signed).await?;
  ```

</CodeGroup>

***

## GTD Orders

GTD orders auto-expire at a specified time. Useful for quoting around known events.

<CodeGroup>
  ```typescript TypeScript theme={null}
  // Expire in 1 hour (+ 60s security threshold buffer)
  const expiration = Math.floor(Date.now() / 1000) + 60 + 3600;

  const response = await client.createAndPostOrder(
    {
      tokenID: "TOKEN_ID",
      price: 0.5,
      size: 10,
      side: Side.BUY,
      expiration,
    },
    { tickSize: "0.01", negRisk: false },
    OrderType.GTD,
  );

  ```

  ```python Python theme={null}
  import time

  # Expire in 1 hour (+ 60s security threshold buffer)
  expiration = int(time.time()) + 60 + 3600

  response = client.create_and_post_order(
      OrderArgs(
          token_id="TOKEN_ID",
          price=0.50,
          size=10,
          side=BUY,
          expiration=expiration,
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False),
      order_type=OrderType.GTD
  )
  ```

  ```rust Rust theme={null}
  use chrono::{TimeDelta, Utc};
  use polymarket_client_sdk_v2::clob::types::OrderType;

  let order = client
      .limit_order()
      .token_id("TOKEN_ID".parse()?)
      .price(dec!(0.50))
      .size(dec!(10))
      .side(Side::Buy)
      .order_type(OrderType::GTD)
      .expiration(Utc::now() + TimeDelta::hours(1))
      .build()
      .await?;
  let signed = client.sign(&signer, order).await?;
  let response = client.post_order(signed).await?;
  ```

</CodeGroup>

<Note>
  There is a security threshold of one minute on GTD expiration. To set an
  effective lifetime of N seconds, use `now + 60 + N`. For example, for a
  30-second effective lifetime, set the expiration to `now + 60 + 30`.
</Note>

***

## Market Orders

Market orders execute immediately against resting liquidity using FOK or FAK types:

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { Side, OrderType } from "@polymarket/clob-client-v2";

  // FOK BUY: spend exactly $100 or cancel entirely
  const buyOrder = await client.createMarketOrder(
    {
      tokenID: "TOKEN_ID",
      side: Side.BUY,
      amount: 100, // dollar amount
      price: 0.5, // worst-price limit (slippage protection)
    },
    { tickSize: "0.01", negRisk: false },
  );
  await client.postOrder(buyOrder, OrderType.FOK);

  // FOK SELL: sell exactly 200 shares or cancel entirely
  const sellOrder = await client.createMarketOrder(
    {
      tokenID: "TOKEN_ID",
      side: Side.SELL,
      amount: 200, // number of shares
      price: 0.45, // worst-price limit (slippage protection)
    },
    { tickSize: "0.01", negRisk: false },
  );
  await client.postOrder(sellOrder, OrderType.FOK);

  ```

  ```python Python theme={null}
  from py_clob_client_v2.order_builder.constants import BUY, SELL
  from py_clob_client_v2 import MarketOrderArgs, OrderType, PartialCreateOrderOptions

  # FOK BUY: spend exactly $100 or cancel entirely
  buy_order = client.create_market_order(
      order_args=MarketOrderArgs(
          token_id="TOKEN_ID",
          side=BUY,
          amount=100,  # dollar amount
          price=0.50,  # worst-price limit (slippage protection)
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False),
  )
  client.post_order(buy_order, OrderType.FOK)

  # FOK SELL: sell exactly 200 shares or cancel entirely
  sell_order = client.create_market_order(
      order_args=MarketOrderArgs(
          token_id="TOKEN_ID",
          side=SELL,
          amount=200,  # number of shares
          price=0.45,  # worst-price limit (slippage protection)
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False),
  )
  client.post_order(sell_order, OrderType.FOK)
  ```

  ```rust Rust theme={null}
  use polymarket_client_sdk_v2::clob::types::{Amount, OrderType, Side};

  let token_id = "TOKEN_ID".parse()?;

  // FOK BUY: spend exactly $100 or cancel entirely
  let buy = client
      .market_order()
      .token_id(token_id)
      .amount(Amount::usdc(dec!(100))?)
      .price(dec!(0.50)) // worst-price limit (slippage protection)
      .side(Side::Buy)
      .order_type(OrderType::FOK)
      .build()
      .await?;
  let signed = client.sign(&signer, buy).await?;
  client.post_order(signed).await?;

  // FOK SELL: sell exactly 200 shares or cancel entirely
  let sell = client
      .market_order()
      .token_id(token_id)
      .amount(Amount::shares(dec!(200))?)
      .price(dec!(0.45)) // worst-price limit (slippage protection)
      .side(Side::Sell)
      .order_type(OrderType::FOK)
      .build()
      .await?;
  let signed = client.sign(&signer, sell).await?;
  client.post_order(signed).await?;
  ```

</CodeGroup>

* **FOK** — fill entirely or cancel the whole order
* **FAK** — fill what's available, cancel the rest

The `price` field on market orders acts as a **worst-price limit** (slippage protection), not a target execution price.

### One-Step Market Order

For convenience, `createAndPostMarketOrder` handles creation, signing, and submission in one call:

<CodeGroup>
  ```typescript TypeScript theme={null}
  const response = await client.createAndPostMarketOrder(
    {
      tokenID: "TOKEN_ID",
      side: Side.BUY,
      amount: 100,
      price: 0.5,
    },
    { tickSize: "0.01", negRisk: false },
    OrderType.FOK,
  );
  ```

  ```python Python theme={null}
  from py_clob_client_v2 import MarketOrderArgs, OrderType, PartialCreateOrderOptions
  from py_clob_client_v2.order_builder.constants import BUY

  response = client.create_and_post_market_order(
      order_args=MarketOrderArgs(
          token_id="TOKEN_ID",
          side=BUY,
          amount=100,
          price=0.50,
      ),
      options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False),
      order_type=OrderType.FOK,
  )
  ```

  ```rust Rust theme={null}
  let order = client
      .market_order()
      .token_id("TOKEN_ID".parse()?)
      .amount(Amount::usdc(dec!(100))?)
      .price(dec!(0.50))
      .side(Side::Buy)
      .order_type(OrderType::FOK)
      .build()
      .await?;
  let signed = client.sign(&signer, order).await?;
  let response = client.post_order(signed).await?;
  ```

</CodeGroup>

***

## Post-Only Orders

Post-only orders guarantee you're always the maker. If the order would match immediately (cross the spread), it's rejected instead of executed.

<CodeGroup>
  ```typescript TypeScript theme={null}
  const response = await client.postOrder(signedOrder, OrderType.GTC, true);
  ```

  ```python Python theme={null}
  response = client.post_order(signed_order, OrderType.GTC, post_only=True)
  ```

  ```rust Rust theme={null}
  let order = client
      .limit_order()
      .token_id("TOKEN_ID".parse()?)
      .price(dec!(0.50))
      .size(dec!(10))
      .side(Side::Buy)
      .post_only(true)
      .build()
      .await?;
  let signed = client.sign(&signer, order).await?;
  let response = client.post_order(signed).await?;
  ```

</CodeGroup>

* Only works with **GTC** and **GTD** order types
* Rejected if combined with FOK or FAK

***

## Batch Orders

Place up to **15 orders** in a single request:

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { OrderType, Side, PostOrdersArgs } from "@polymarket/clob-client-v2";

  const orders: PostOrdersArgs[] = [
    {
      order: await client.createOrder(
        {
          tokenID: "TOKEN_ID",
          price: 0.48,
          side: Side.BUY,
          size: 500,
        },
        { tickSize: "0.01", negRisk: false },
      ),
      orderType: OrderType.GTC,
    },
    {
      order: await client.createOrder(
        {
          tokenID: "TOKEN_ID",
          price: 0.52,
          side: Side.SELL,
          size: 500,
        },
        { tickSize: "0.01", negRisk: false },
      ),
      orderType: OrderType.GTC,
    },
  ];

  const response = await client.postOrders(orders);

  ```

  ```python Python theme={null}
  from py_clob_client_v2 import OrderArgs, OrderType, PostOrdersV2Args, PartialCreateOrderOptions
  from py_clob_client_v2.order_builder.constants import BUY, SELL

  response = client.post_orders([
      PostOrdersV2Args(
          order=client.create_order(OrderArgs(
              price=0.48,
              size=500,
              side=BUY,
              token_id="TOKEN_ID",
          ), options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False)),
          orderType=OrderType.GTC,
      ),
      PostOrdersV2Args(
          order=client.create_order(OrderArgs(
              price=0.52,
              size=500,
              side=SELL,
              token_id="TOKEN_ID",
          ), options=PartialCreateOrderOptions(tick_size="0.01", neg_risk=False)),
          orderType=OrderType.GTC,
      ),
  ])
  ```

  ```rust Rust theme={null}
  let token_id = "TOKEN_ID".parse()?;

  let bid = client
      .limit_order()
      .token_id(token_id)
      .price(dec!(0.48))
      .size(dec!(500))
      .side(Side::Buy)
      .build()
      .await?;
  let ask = client
      .limit_order()
      .token_id(token_id)
      .price(dec!(0.52))
      .size(dec!(500))
      .side(Side::Sell)
      .build()
      .await?;

  let signed_bid = client.sign(&signer, bid).await?;
  let signed_ask = client.sign(&signer, ask).await?;
  let response = client.post_orders(vec![signed_bid, signed_ask]).await?;
  ```

</CodeGroup>

***

## Order Options

Every order requires two market-specific options: `tickSize` and `negRisk`. For details on signature types (`0` = EOA, `1` = POLY\_PROXY, `2` = GNOSIS\_SAFE), see [Authentication](/api-reference/authentication#signature-types-and-funder).

### Tick Sizes

Your order price must conform to the market's tick size, or the order is rejected.

| Tick Size | Precision  | Example Prices         |
| --------- | ---------- | ---------------------- |
| `0.1`     | 1 decimal  | 0.1, 0.2, 0.5          |
| `0.01`    | 2 decimals | 0.01, 0.50, 0.99       |
| `0.001`   | 3 decimals | 0.001, 0.500, 0.999    |
| `0.0001`  | 4 decimals | 0.0001, 0.5000, 0.9999 |

<CodeGroup>
  ```typescript TypeScript theme={null}
  const tickSize = await client.getTickSize("TOKEN_ID");
  ```

  ```python Python theme={null}
  tick_size = client.get_tick_size("TOKEN_ID")
  ```

  ```rust Rust theme={null}
  let token_id = "TOKEN_ID".parse()?;
  let tick_size = client.tick_size(token_id).await?;
  ```

</CodeGroup>

### Negative Risk

Multi-outcome events (3+ outcomes) use the Neg Risk CTF Exchange. Pass `negRisk: true` for these markets.

<CodeGroup>
  ```typescript TypeScript theme={null}
  const isNegRisk = await client.getNegRisk("TOKEN_ID");
  ```

  ```python Python theme={null}
  is_neg_risk = client.get_neg_risk("TOKEN_ID")
  ```

  ```rust Rust theme={null}
  let token_id = "TOKEN_ID".parse()?;
  let is_neg_risk = client.neg_risk(token_id).await?;
  ```

</CodeGroup>

<Tip>
  Both values are also available on the market object: `minimum_tick_size` and
  `neg_risk`. In Rust, the order builder auto-fetches both — you don't need to look them up manually.
</Tip>

***

## Prerequisites

Before placing an order, your funder address must have approved the Exchange contract to spend the relevant tokens:

* **BUY orders**: pUSD allowance >= spending amount
* **SELL orders**: conditional token allowance >= selling amount

Order size is limited by your available balance minus amounts reserved by existing open orders:

$$
\text{maxOrderSize} = \text{balance} - \sum(\text{openOrderSize} - \text{filledAmount})
$$

<Warning>
  Orders are continuously monitored for validity — balances and allowances are
  tracked in real time. Any maker caught intentionally abusing these checks
  will be blacklisted.
</Warning>

### Sports Markets

Sports markets have additional behaviors:

* Outstanding limit orders are **automatically cancelled** once the game begins, clearing the entire order book at the official start time
* Marketable orders have a **1-second placement delay** before matching
* Game start times can shift — monitor your orders closely, as they may not be cleared if the start time changes unexpectedly

***

## Response

A successful order placement returns:

```json theme={null}
{
  "success": true,
  "errorMsg": "",
  "orderID": "0xabc123...",
  "takingAmount": "",
  "makingAmount": "",
  "status": "live",
  "transactionsHashes": [],
  "tradeIDs": []
}
```

### Statuses

| Status      | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| `live`      | Order resting on the book                                   |
| `matched`   | Order matched immediately with a resting order              |
| `delayed`   | Marketable order subject to a matching delay                |
| `unmatched` | Marketable but failed to delay — placement still successful |

### Error Messages

| Error                              | Description                                     |
| ---------------------------------- | ----------------------------------------------- |
| `INVALID_ORDER_MIN_TICK_SIZE`      | Price doesn't conform to the market's tick size |
| `INVALID_ORDER_MIN_SIZE`           | Order size below the minimum threshold          |
| `INVALID_ORDER_DUPLICATED`         | Identical order already placed                  |
| `INVALID_ORDER_NOT_ENOUGH_BALANCE` | Insufficient balance or allowance               |
| `INVALID_ORDER_EXPIRATION`         | Expiration timestamp is in the past             |
| `INVALID_POST_ONLY_ORDER_TYPE`     | Post-only used with FOK/FAK                     |
| `INVALID_POST_ONLY_ORDER`          | Post-only order would cross the book            |
| `FOK_ORDER_NOT_FILLED_ERROR`       | FOK order couldn't be fully filled              |
| `INVALID_ORDER_ERROR`              | System error inserting the order                |
| `EXECUTION_ERROR`                  | System error executing the trade                |
| `ORDER_DELAYED`                    | Order match delayed due to market conditions    |
| `DELAYING_ORDER_ERROR`             | System error while delaying the order           |
| `MARKET_NOT_READY`                 | Market not yet accepting orders                 |

***

## Heartbeat

The heartbeat endpoint maintains session liveness. If a valid heartbeat is not received within **10 seconds** (with a 5-second buffer), **all open orders are cancelled**.

<CodeGroup>
  ```typescript TypeScript theme={null}
  let heartbeatId = "";
  setInterval(async () => {
    const resp = await client.postHeartbeat(heartbeatId);
    heartbeatId = resp.heartbeat_id;
  }, 5000);
  ```

  ```python Python theme={null}
  import time

  heartbeat_id = ""
  while True:
      resp = client.post_heartbeat(heartbeat_id)
      heartbeat_id = resp["heartbeat_id"]
      time.sleep(5)
  ```

  ```rust Rust theme={null}
  // With the `heartbeats` feature, the Rust SDK can auto-send heartbeats
  // in a background task — no manual loop needed:
  Client::start_heartbeats(&mut client)?;
  // ... your trading logic ...
  client.stop_heartbeats().await?;

  // Or send manually:
  let resp = client.post_heartbeat(None).await?; // None for first call
  let resp = client.post_heartbeat(Some(resp.heartbeat_id)).await?;
  ```

</CodeGroup>

* Include the most recent `heartbeat_id` in each request. Use an empty string for the first request.
* If you send an expired ID, the server responds with `400` and the correct ID. Update and retry.

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Cancel Orders" icon="xmark" href="/trading/orders/cancel">
    Cancel single, multiple, or all open orders
  </Card>

  <Card title="Order Attribution" icon="tag" href="/trading/orders/attribution">
    Attribute orders to your builder account for volume credit
  </Card>
</CardGroup>
