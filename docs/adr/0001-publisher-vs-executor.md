# ADR 0001: Publisher vs Executor Action Model

Status: proposed

## Context

Intelligence Engine v2 can attach actions to narratives. Those actions can either deep-link users to venues or execute trades inside myboon.

## Options

### Publisher mode

myboon provides feed, alerts, explanations, and deep links to external venues.

Pros:

- lower custody/signing risk
- simpler API
- faster to ship
- easier to validate intelligence quality first

Cons:

- weaker execution UX
- less control over conversion/fees

### Executor mode

myboon supports in-app signing/execution across venues.

Pros:

- strongest UX
- better monetization path
- can close the loop from signal to action

Cons:

- larger auth/custody/risk surface
- more complex API and frontend state
- harder to build safely while validating intelligence quality

## Proposed decision

Start Intelligence Engine v2 in **publisher mode** until the Polymarket replay/backtest proves the signal pipeline beats baseline.

Revisit executor mode after v1 validation.
