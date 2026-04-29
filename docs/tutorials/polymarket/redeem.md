> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Redeem Tokens

> Exchange winning tokens for pUSD after market resolution

**Redeeming** converts winning outcome tokens into pUSD after a market resolves. Each winning token is worth exactly $1.00 — the losing token is worth $0.

```
Market resolves YES:
  100 Yes tokens → $100 pUSD
  100 No tokens  → $0
```

## When to Redeem

Redemption is only available **after a market resolves**. Once the oracle reports the outcome:

* **Winning tokens** can be redeemed for \$1.00 pUSD each
* **Losing tokens** are worth \$0 and produce no payout

<Note>
  You can redeem at any time after resolution — there's no deadline. Your
  winning tokens will always be redeemable.
</Note>

## How Resolution Works

1. The market's end condition is met (event occurs, date passes, etc.)
2. The UMA Adapter oracle reports the outcome via `reportPayouts()`
3. The CTF contract records the payout vector
4. Redemption becomes available for winning tokens

## Prerequisites

Before redeeming:

1. **Market must be resolved** — check the market's `resolved` status
2. **Hold winning tokens** — only the winning outcome can be redeemed
3. **Know the condition ID** — required for the redemption call

## Function Parameters

<ResponseField name="collateralToken" type="IERC20">
  pUSD (Polymarket USD) contract address: `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`
</ResponseField>

<ResponseField name="parentCollectionId" type="bytes32">
  Always `0x0000...0000` (32 zero bytes) for Polymarket markets
</ResponseField>

<ResponseField name="conditionId" type="bytes32">
  The market's condition ID
</ResponseField>

<ResponseField name="indexSets" type="uint[]">
  Array of index sets to redeem: `[1, 2]` redeems both outcomes (only winning
  pays)
</ResponseField>

<Note>
  Redemption burns your entire token balance for the condition — there is no
  amount parameter.
</Note>

## Payout Mechanics

The CTF uses a **payout vector** to determine redemption values:

| Outcome  | Payout Vector | Redemption        |
| -------- | ------------- | ----------------- |
| Yes wins | `[1, 0]`      | Yes = $1, No = $0 |
| No wins  | `[0, 1]`      | Yes = $0, No = $1 |

When you call `redeemPositions()`:

* Your token balance is multiplied by the payout
* Winning tokens are burned
* pUSD is transferred to your wallet
* Losing tokens are burned as well, but produce a \$0 payout

## Next Steps

<CardGroup cols={2}>
  <Card title="CTF Overview" icon="book" href="/trading/ctf/overview">
    Learn more about the Conditional Token Framework
  </Card>

  <Card title="Resolution Process" icon="gavel" href="/concepts/resolution">
    Understand how markets are resolved
  </Card>
</CardGroup>
