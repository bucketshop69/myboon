> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Order Lifecycle

> Understanding how orders flow from creation to settlement

Every trade on Polymarket follows a specific lifecycle. Orders are created offchain, matched by an operator, and settled onchain through smart contracts. This hybrid approach combines the speed of centralized matching with the security of blockchain settlement.

<Frame>
  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/order-lifecycle.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=4db07008193421bfe359afe44b5f604e" alt="" className="dark:hidden" width="2336" height="952" data-path="images/core-concepts/order-lifecycle.png" />

  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/order-lifecycle.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=5a0f3eba2f20c44471bae05c0670de4a" alt="" className="hidden dark:block" width="2336" height="952" data-path="images/dark/core-concepts/order-lifecycle.png" />
</Frame>

## How Orders Work

All orders on Polymarket are **limit orders**. A limit order specifies the price you're willing to pay (or accept) and the quantity you want to trade.

<Note>
  "Market orders" are simply limit orders with a price set to execute
  immediately against the best available resting orders.
</Note>

Orders are **EIP712-signed messages**. When you place an order, you sign a structured message with your private key. This signature authorizes the Exchange contract to execute the trade on your behalf—without ever taking custody of your funds.

## Order Types

| Type    | Behavior                                                      | Use Case                 |
| ------- | ------------------------------------------------------------- | ------------------------ |
| **GTC** | Good Till Cancelled — rests on book until filled or cancelled | Standard limit orders    |
| **GTD** | Good Till Date — auto-expires at specified time               | Time-limited orders      |
| **FOK** | Fill Or Kill — fill entirely or cancel immediately            | All-or-nothing execution |
| **FAK** | Fill And Kill — fill what's available, cancel the rest        | Partial fills acceptable |

### Post-Only Orders

Post-only orders will only rest on the book. If a post-only order would match immediately (cross the spread), it's rejected instead of executed. This guarantees you're always the maker, never the taker.

<Steps>
  <Step title="Create and Sign">
    Your client creates an order object containing:

    * Token ID (which outcome you're trading)
    * Side (buy or sell)
    * Price and size
    * Expiration time
    * Timestamp (in milliseconds, used for order uniqueness)

    You sign this order with your private key, creating an EIP712 signature.
  </Step>

  <Step title="Submit to CLOB">
    The signed order is submitted to the Central Limit Order Book (CLOB) operator. The operator validates:

    * Signature is valid
    * You have sufficient balance
    * You have set the required allowances
    * Price meets minimum tick size requirements
  </Step>

  <Step title="Match or Rest">
    **If the order is marketable** (your buy price ≥ lowest ask, or your sell price ≤ highest bid), it matches immediately against resting orders.

    **If the order is not marketable**, it rests on the book waiting for a counterparty. It remains open until:

    * Another order matches against it
    * You cancel it
    * It expires (GTD orders only)
  </Step>

  <Step title="Settlement">
    When orders match, the operator submits the trade to the blockchain. The Exchange contract:

    * Verifies both signatures
    * Transfers tokens from seller to buyer
    * Transfers pUSD from buyer to seller

    Settlement is **atomic**—either the entire trade succeeds or nothing happens.
  </Step>

  <Step title="Confirmation">
    The trade achieves finality on Polygon. Your token balances update and the trade appears in your history.
  </Step>
</Steps>

## Order Statuses

When you place an order, it receives one of these statuses:

| Status      | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `live`      | Order is resting on the book                                                |
| `matched`   | Order matched immediately                                                   |
| `delayed`   | Marketable order subject to a 1-second matching delay (sports markets)      |
| `unmatched` | Marketable order placed on the book after the delay expired without a match |

## Trade Statuses

After matching, trades progress through these statuses:

| Status      | Terminal | Description                                            |
| ----------- | -------- | ------------------------------------------------------ |
| `MATCHED`   | No       | Trade matched, sent to executor for onchain submission |
| `MINED`     | No       | Transaction mined into the blockchain                  |
| `CONFIRMED` | Yes      | Trade achieved finality, successful                    |
| `RETRYING`  | No       | Transaction failed, being retried                      |
| `FAILED`    | Yes      | Trade failed permanently                               |

## Maker vs Taker

| Role      | Description                     | When                                                  |
| --------- | ------------------------------- | ----------------------------------------------------- |
| **Maker** | Adds liquidity to the book      | Your order rests and is later matched                 |
| **Taker** | Removes liquidity from the book | Your order matches immediately against resting orders |

Price improvement always benefits the taker. If you place a buy order at `$0.55` and it matches against a resting sell at `$0.52`, you pay `$0.52`.

## Cancellation

You can cancel orders at any time before they're matched via the CLOB API.

Partial fills cannot be cancelled—only the unfilled portion of an order can be cancelled.

## Requirements

Before placing orders, ensure:

| Requirement         | Description                                        |
| ------------------- | -------------------------------------------------- |
| **Balance**         | Sufficient pUSD (for buys) or tokens (for sells)   |
| **Allowance**       | Approve the Exchange contract to spend your assets |
| **API Credentials** | Valid API key for authenticated endpoints          |

<Info>
  Order size is limited by your available balance minus any amounts reserved by existing open orders.

  $$
  \text{maxOrderSize} = \text{balance} - \sum(\text{openOrderSize} - \text{filledAmount})
  $$
</Info>

## Next Steps

<CardGroup cols={2}>
  <Card title="Resolution" icon="gavel" href="/concepts/resolution">
    Learn how markets are resolved and winning tokens redeemed.
  </Card>

  <Card title="Trading Guide" icon="book" href="/trading/overview">
    Start placing orders with our step-by-step guide.
  </Card>
</CardGroup>
