> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Resolution

> How markets are resolved and winning positions redeemed

When the outcome of an event becomes known, the market is **resolved**. Resolution determines which outcome won, allowing holders of winning tokens to redeem them for \$1 each. Losing tokens become worthless.

Polymarket uses the **UMA Optimistic Oracle** for decentralized, permissionless resolution. Anyone can propose an outcome, and anyone can dispute it if they believe it's incorrect.

<Frame>
  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/resolution-lifecycle.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=6726569af3efd6f4fda54528c8eb0d0a" alt="" className="dark:hidden" width="1722" height="952" data-path="images/core-concepts/resolution-lifecycle.png" />

  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/resolution-lifecycle.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=36e91c655f7f50b18dea3a23b44f8c23" alt="" className="hidden dark:block" width="1722" height="952" data-path="images/dark/core-concepts/resolution-lifecycle.png" />
</Frame>

## Resolution Rules

Every market has pre-defined resolution rules that specify:

* **Resolution source** — Where the outcome will be determined from (e.g., official announcements, specific websites)
* **End date** — When the market is eligible for resolution
* **Edge cases** — How ambiguous situations should be handled

<Warning>
  Always read the resolution rules before trading. The market title describes
  the question, but the **rules** define how it resolves.
</Warning>

<Steps>
  <Step title="Proposal">
    Anyone can propose a resolution by:

    1. Selecting the winning outcome
    2. Posting a bond (typically \$750 pUSD)
    3. Submitting the proposal to the UMA Oracle

    If the proposal is correct and undisputed, the proposer receives their bond back plus a reward.

    <Warning>
      If you propose incorrectly or too early, you lose your entire bond. Only
      propose if you're confident in the outcome and understand the process.
    </Warning>
  </Step>

  <Step title="Challenge Period">
    After a proposal, there's a **2-hour challenge period** where anyone can dispute the outcome.

    * **If no dispute**: The proposal is accepted and the market resolves
    * **If disputed**: A new proposal round begins. If the second proposal is also disputed, the resolution escalates to UMA's DVM (Data Verification Mechanism) for a token holder vote.

    There are three possible resolution flows:

    1. **No dispute** — Propose then Resolve (fastest, \~2 hours)
    2. **One dispute** — Propose, Challenge, second Propose, Resolve (second proposal accepted)
    3. **Two disputes** — Propose, Challenge, second Propose, second Challenge, Resolve via DVM vote
  </Step>

  <Step title="Dispute - If Challenged">
    To dispute a proposal:

    1. Post a counter-bond (same amount as proposer, typically \$750)
    2. The dispute triggers a new proposal round, or if already in the second round, a debate period

    During the **24-48 hour debate period**, evidence can be submitted in UMA's Discord channels (`#evidence-rationale` and `#voting-discussion`).
  </Step>

  <Step title="UMA Vote">
    After the debate period, UMA token holders vote on the correct outcome. The voting process takes approximately 48 hours.

    | Outcome           | Result                                 | Bond Distribution                                                                                        |
    | ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
    | **Proposer wins** | Original proposal accepted             | Proposer gets bond back + half of disputer's bond                                                        |
    | **Disputer wins** | Proposal rejected, new proposal needed | Disputer gets bond back + half of proposer's bond                                                        |
    | **Too Early**     | Event hasn't concluded yet             | Disputer gets bond back + half of proposer's bond                                                        |
    | **Unknown/50-50** | Neither outcome applicable (rare)      | Market resolves 50/50 — each token redeems for \$0.50; disputer gets bond back + half of proposer's bond |
  </Step>
</Steps>

## After Resolution

Once a market resolves:

* **Trading stops** — You can no longer buy or sell tokens for this market
* **Winning tokens** become redeemable for \$1.00 each
* **Losing tokens** become worthless (\$0.00)

### Redeeming Tokens

After resolution, call the `redeemPositions` function on the CTF contract to exchange winning tokens for pUSD. The contract burns your tokens and returns the corresponding collateral.

```
100 winning tokens → $100 pUSD
```

## Clarifications

In rare cases, unforeseen circumstances require clarification of the rules after trading begins. Polymarket may issue an **"Additional context"** update that proposers and voters should consider during resolution.

Clarifications:

* Cannot change the fundamental intent of the question
* Are published onchain via the bulletin board contract
* Should be considered by UMA voters when resolving disputes

<Tip>
  If you believe a clarification is needed, request it in the [Polymarket
  Discord](https://discord.com/invite/polymarket) `#market-review` channel.
</Tip>

## Resolution Timeline

| Phase                       | Duration    |
| --------------------------- | ----------- |
| Challenge period            | 2 hours     |
| Debate period (if disputed) | 24-48 hours |
| UMA voting (if disputed)    | \~48 hours  |

**Undisputed resolution**: \~2 hours after proposal

**Disputed resolution**: 4-6 days total

## Contract Addresses

| Contract               | Address                                      | Network         |
| ---------------------- | -------------------------------------------- | --------------- |
| **UmaCtfAdapter v3.0** | `0x157Ce2d672854c848c9b79C49a8Cc6cc89176a49` | Polygon Mainnet |
| **UmaCtfAdapter v2.0** | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` | Polygon Mainnet |
| **UmaCtfAdapter v1.0** | `0xCB1822859cEF82Cd2Eb4E6276C7916e692995130` | Polygon Mainnet |

## Resources

* [UMA Oracle Portal](https://oracle.uma.xyz/) — View and interact with proposals
* [UMA Documentation](https://docs.uma.xyz/) — Learn more about the Optimistic Oracle
* [Polymarket Discord](https://discord.com/invite/polymarket) — Discuss resolutions and request clarifications
* [UmaCtfAdapter Source Code](https://github.com/Polymarket/uma-ctf-adapter) — Smart contract source
* [UmaCtfAdapter Audit](https://github.com/Polymarket/uma-ctf-adapter/blob/main/audit/Polymarket_UMA_Optimistic_Oracle_Adapter_Audit.pdf) — Security audit report

## Next Steps

<CardGroup cols={2}>
  <Card title="Positions & Tokens" icon="coins" href="/concepts/positions-tokens">
    Learn how to redeem winning tokens after resolution.
  </Card>

  <Card title="Markets & Events" icon="calendar" href="/concepts/markets-events">
    Understand how markets are structured.
  </Card>
</CardGroup>
