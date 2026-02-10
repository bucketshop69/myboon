# 005: Tx-Parser Package Setup

## Goal

Create `packages/tx-parser` as a standalone, strict TypeScript package in the pnldotfun monorepo.

## Why

- Isolates tx parsing from app UI frameworks
- Makes parser reusable across web, mobile, and agents
- Establishes clean architecture early (small modules, strong typing)

---

## Fixed Decisions (Updated)

### Decision 1: Package Location

**Chosen:** `packages/tx-parser/`

### Decision 2: Module Format

**Chosen:** ESM + build output to `dist/`

### Decision 3: Test Runner

**Chosen:** Vitest

### Decision 4: Environment Configuration

**Chosen:** Use root-level `.env` for runtime config:

```env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=89af9d38-1256-43d3-9c5a-a9aa454d0def
EXAMPLE_WALLET=7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C
```

### Decision 5: Engineering Standards

Apply these from the start:

- Clean Code: meaningful names, single responsibility, small functions
- DRY: shared helpers for repeated logic
- SOLID where applicable (especially SRP + dependency boundaries)
- Explicit error handling with clear messages
- TypeScript `strict: true`

---

## Approach

Initialize package with:

- `package.json` (ESM, build/test scripts)
- strict `tsconfig.json`
- `src/` structure (`config`, `constants`, `types`, `parsers`, `rpc`)
- initial exports in `src/index.ts`
- baseline tests in `src/__tests__`

---

## Implementation Steps

### Step 1: Create package structure

```bash
mkdir -p packages/tx-parser/src/{types,constants,parsers,__tests__}
```

### Step 2: Create root `.env`

```env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=89af9d38-1256-43d3-9c5a-a9aa454d0def
EXAMPLE_WALLET=7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C
```

### Step 3: Create package files

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/types/index.ts`
- `src/__tests__/setup.test.ts`

### Step 4: Add constants scaffold

- `src/constants/programIds.ts` (to be populated with verified IDs in Issue 007)

---

## Acceptance Criteria

- [ ] `packages/tx-parser/` exists
- [ ] root `.env` exists with Helius RPC + example wallet
- [ ] TypeScript strict mode is enabled
- [ ] `pnpm --filter @pnldotfun/tx-parser build` works
- [ ] `pnpm --filter @pnldotfun/tx-parser test` works

---

## Files to Create

| File | Action |
|------|--------|
| `packages/tx-parser/package.json` | Create |
| `packages/tx-parser/tsconfig.json` | Create |
| `.env` | Create |
| `packages/tx-parser/src/index.ts` | Create |
| `packages/tx-parser/src/types/index.ts` | Create |
| `packages/tx-parser/src/constants/programIds.ts` | Create |
| `packages/tx-parser/src/__tests__/setup.test.ts` | Create |

## Files to Modify

| File | Change |
|------|--------|
| `tsconfig.base.json` | Adjust paths only if needed |
| `pnpm-workspace.yaml` | No change expected (`packages/*` already included) |
