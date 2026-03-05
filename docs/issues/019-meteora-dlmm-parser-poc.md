# Issue #019: Meteora DLMM Parser — POC

**Type:** Research / POC  
**Priority:** High  
**Milestone:** Feb 15 - Feb 22  
**Assignee:** AI Agent  
**Estimated Effort:** 2-4 hours  
**Depends On:** #010  
**Status:** ⚪ To Do

---

## Problem Statement

DLMM transactions are detected but fall back to `GenericDetails`. We know nothing about what actually happened — add liquidity, remove, claim fees, etc. Unlike Jupiter (one action, balance diffs are enough), DLMM has 8-9 distinct instruction types that all look different and need to be identified before we can extract meaningful data.

---

## Solution Approach

Two-step POC:

1. **Discriminator mapping** — fetch real tx signatures (one per instruction type), inspect the raw instruction data, extract the actual 8-byte Anchor discriminators, build a ground-truth map
2. **Balance diff extraction** — once we know the instruction type, use pre/post token balance diffs (same approach as Jupiter) to get token amounts

This POC produces: a verified discriminator map + a working `parseMeteoraDlmmTransaction()` that returns action type + token amounts.

---

## Acceptance Criteria

- [ ] Discriminators verified against real transactions for at least: `addLiquidity`, `removeLiquidity`, `claimFee`
- [ ] `parseMeteoraDlmmTransaction(tx)` returns `{ action, tokenX, tokenY, poolAddress }`
- [ ] Tested against the real `LP_METEORA` fixture signature in `fixtures.ts`

---

## Technical Notes

- Real tx signatures to be provided by PM for each instruction type
- Existing `getTokenTransfers()` util can be reused for balance diffs
- Discriminator = first 8 bytes of instruction data (Anchor standard)
- Pool address = account at index 1 in the DLMM instruction accounts

---

## Confidence Rating

**Confidence Score:** 7/10

**Reasoning:** Approach is clear. Blocked on having verified discriminators — need real tx signatures from PM before implementation can start.

**Clarifying Questions:**

- Can you provide one real tx signature each for: `addLiquidity`, `removeLiquidity`, `claimFee`, `initializePosition`, `closePosition`?
