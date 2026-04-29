> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Merge Tokens

> Convert outcome token pairs back to pUSD

**Merging** is the inverse of splitting — it converts a full set of outcome tokens back into pUSD collateral. For every 1 Yes token and 1 No token you merge, you receive \$1 pUSD. The condition must already be prepared on the CTF contract (via `prepareCondition`).

```
100 Yes tokens + 100 No tokens → $100 pUSD
```

## Prerequisites

Before merging, you need:

1. **Equal amounts** of both Yes and No tokens
2. **Condition ID** of the market
3. **Sufficient gas** for the transaction

## How It Works

1. You call `mergePositions()` with the amount and market details
2. One unit of each position in a full set is burned in return for 1 collateral unit
3. The CTF contract releases pUSD back to your wallet

The operation is atomic — if you don't have enough of both tokens, the transaction reverts.

## Function Parameters

<ResponseField name="collateralToken" type="IERC20">
  pUSD (Polymarket USD) contract address: `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`
</ResponseField>

<ResponseField name="parentCollectionId" type="bytes32">
  Always `0x0000...0000` (32 zero bytes) for Polymarket markets
</ResponseField>

<ResponseField name="conditionId" type="bytes32">
  The market's condition ID, available from the Markets API
</ResponseField>

<ResponseField name="partition" type="uint[]">
  Array of index sets: `[1, 2]` for binary markets
</ResponseField>

<ResponseField name="amount" type="uint256">
  The number of full sets to merge. Also the amount of collateral to receive.
</ResponseField>

## Next Steps

<CardGroup cols={2}>
  <Card title="Redeem Tokens" icon="hand-holding-dollar" href="/trading/ctf/redeem">
    Exchange winning tokens for pUSD after resolution
  </Card>

  <Card title="CTF Overview" icon="book" href="/trading/ctf/overview">
    Learn more about the Conditional Token Framework
  </Card>
</CardGroup>
