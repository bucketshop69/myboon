# #054 — Pacific Builder Code Integration

## Problem

Pacific Protocol allows builders to earn fee share on user trades. myboon is not registered as a builder, so we're leaving revenue on the table.

**Gap:** No builder code registered. No user approval flow. No fee tracking.

## Goal

Integrate Pacific Builder Code for fee sharing:

1. Register `MYBOON` builder code with Pacific (0.025% fee)
2. Build user approval flow (one-time signature, gasless)
3. Include `builder_code: "MYBOON"` in all orders

**Outcome:** myboon earns 0.025% fee share on all Pacific trades through the app.

## Dependencies

- **#063 done** — Wallet Connect (approval requires wallet signature)
- **#068** — Order Execution (orders must include `builder_code` param)
- Builds on: #052 (API client — `approveBuilderCode()` method exists)

## Files to Create

- `packages/shared/src/pacific/builder.ts` — Approval utilities
- `apps/hybrid-expo/src/features/perps/BuilderApproval.tsx` — User approval UI

## Acceptance

- [ ] Builder code `MYBOON` is registered with Pacific
- [ ] Users can approve builder code (one-time signature)
- [ ] All orders include `builder_code: "MYBOON"`
- [ ] Fee earnings are trackable via Pacific API

## Reference

- `docs/PACIFIC-INTEGRATION.md` — Builder code section
- Pacific Builder docs: https://pacifica.gitbook.io/docs/programs/builder-program
