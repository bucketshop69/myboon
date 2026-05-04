# ADR 0001: Publisher vs Executor Action Model

Status: accepted
Decision date: 2026-05-04

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

## Decision

Start Intelligence Engine v2 in **publisher mode** until the Polymarket replay/backtest proves the signal pipeline beats baseline.

V1 actions are limited to feed items, alerts, explanations, and external venue deep links. myboon will not add in-app execution, signing, custody, or cross-venue order routing as part of this validation slice.

Executor mode requires a follow-up ADR and security/product review after v1 intelligence quality is validated.

## Consequences

- API/action-router work must model actions as publisher actions, not executable orders.
- No private-key custody or transaction signing is introduced by Intelligence Engine v2.
- Frontend can prioritize explanation, confidence, urgency, and venue deep links.
- Backtest quality gates stay independent from monetization/execution concerns.
- If executor mode is revisited, auth, custody, risk controls, supported venues, and user consent flows must be redesigned explicitly.
