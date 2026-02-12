# Contributing to pnldotfun

Thank you for your interest in contributing! This guide explains how to work with our codebase effectively.

---

## Quick Checklist

Before submitting any code, ensure:

- [ ] Code has corresponding tests
- [ ] Tests pass on real wallet data (not just mocks)
- [ ] No lint errors (`pnpm lint`)
- [ ] TypeScript strict mode passes (`pnpm typecheck`)
- [ ] Commit follows [conventional format](#commit-format)
- [ ] PR description includes real-wallet validation results

---

## Project Structure

```
pnldotfun/
├── packages/
│   └── tx-parser/          # Transaction parsing engine
│       └── src/
│           ├── parsers/    # Transaction type detectors
│           │   ├── base.ts          # Core classification logic
│           │   ├── swap.ts          # DEX swap parsing
│           │   └── transaction.ts   # Orchestrator
│           ├── types/       # TypeScript interfaces
│           ├── rpc.ts       # Solana RPC fetcher
│           ├── config.ts    # Environment config
│           └── __tests__/   # Tests (integration + unit)
├── docs/
│   ├── VISION.md     # Product vision
│   └── issues/       # Feature requirements
├── .env              # RPC credentials (not committed)
└── CONTRIBUTING.md   # This file
```

**Key directories:**
- `packages/tx-parser/src/parsers/` — Add new transaction parsers here
- `packages/tx-parser/src/types/` — Add new types here
- `packages/tx-parser/src/__tests__/` — Add tests here

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Helius RPC URL (get from Colosseum or setup .env)

### Initial Setup

```bash
# Clone and install
git clone https://github.com/bucketshop69/pnldotfun.git
cd pnldotfun
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and add HELIUS_RPC_URL
```

### Common Commands

```bash
pnpm install              # Install dependencies
pnpm test                 # Run all tests
pnpm test -- --run        # Run once (no watch mode)
pnpm lint                 # Lint check
pnpm typecheck            # TypeScript strict check
pnpm format               # Auto-format code
```

---

## Workflow

### 1. Create an Issue

Before writing code, create an issue in `docs/issues/` with:

```markdown
## Context
Why are we doing this? What problem does it solve?

## Acceptance Criteria
- [ ] Specific, testable condition
- [ ] Specific, testable condition

## Edge Cases
What unexpected inputs or scenarios must be handled?

## Definition of Done
- [ ] Code review passed
- [ ] Tests pass on real data
- [ ] Integration test against production RPC
```

### 2. Implement

1. Create a branch: `feature/short-description`
2. Write code following [Coding Standards](#coding-standards)
3. Add tests (see [Testing Guide](#testing))
4. Run full test suite
5. Validate against real wallet data

### 3. Commit

Follow the [commit format](#commit-format) below.

### 4. Submit PR

- Keep PRs focused (< 500 lines changed)
- Include real-wallet validation in description
- Link to the issue

---

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- No `!` assertions on nullable values
- Explicit return types for public functions
- Descriptive variable names (`parsedTransactions` not `data`)

### File Organization

- One concern per function (< 50 lines preferred)
- Related logic in the same file
- Tests co-located with implementation (`__tests__/`)

### Comments

- JSDoc for public functions
- Explain *why*, not *what* (code shows what)
- Complex logic needs inline comments

---

## Testing

### Test Naming

```typescript
describe('feature: description', () => {
  it('does X when Y', () => { /* ... */ });
});
```

### Integration Tests

- Must use `ensureTestEnv()` to load `.env`
- Use real RPC (`HELIUS_RPC_URL`)
- Mark clearly as integration tests
- Output format:
  ```
  === TEST NAME ===
  Metric: value
  Result: PASS/FAIL
  ```

### Wallet Analysis Test

When adding new transaction types, validate with real data:

```typescript
it('analyzes transaction breakdown for bibhu wallet', async () => {
  const wallet = '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C';
  const transactions = await fetchWalletTransactions(wallet, { count: 50 });
  
  let parsed = 0;
  const types: Record<string, number> = {};
  
  for (const tx of transactions) {
    const result = parseSingleTransaction(tx);
    if (result && result.type !== 'unknown') {
      parsed++;
      types[result.type] = (types[result.type] || 0) + 1;
    }
  }
  
  console.log(`Parsed: ${parsed}/${transactions.length} (${Math.round(parsed/transactions.length*100)}%)`);
  console.log('Breakdown:', types);
  
  expect(parsed).toBeGreaterThan(0);
});
```

---

## Commit Format

We use [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change (neither feat nor fix) |
| `chore` | Build process, dependencies |
| `docs` | Documentation only |
| `test` | Adding or correcting tests |

### Scope

Use the package or module name:

- `tx-parser` — changes to transaction parser
- `types` — changes to TypeScript interfaces
- `rpc` — changes to RPC fetcher

### Examples

```
feat(tx-parser): add SOL transfer detection

- detect System Program instructions
- extract SOL amount from balance changes
- determine direction (send/receive)

Closes #123
```

```
fix(types): correct ParsedTransaction interface

- add missing protocol field
- make kind required
```

```
docs: update CONTRIBUTING.md with commit format

- add conventional commits section
- add testing guidelines
```

---

## Adding a New Transaction Type

### Step-by-Step

1. **Add program ID** to `packages/tx-parser/src/constants/programIds.ts`:
   ```typescript
   export const VERIFIED_PROGRAM_IDS = {
     // existing...
     SYSTEM_PROGRAM: '11111111111111111111111111111111',
   } as const;
   ```

2. **Add detection** in `packages/tx-parser/src/parsers/base.ts`:
   ```typescript
   if (programIds.has(VERIFIED_PROGRAM_IDS.SYSTEM_PROGRAM)) {
     return { type: 'transfer', protocol: 'system' };
   }
   ```

3. **Update types** in `packages/tx-parser/src/types/index.ts`:
   ```typescript
   export type SupportedProtocol =
     | 'jupiter'
     | 'meteora-dlmm'
     | 'system'  // ← new
     | 'unknown';
   ```

4. **Add parser logic** in the appropriate file (e.g., `parsers/transfer.ts`)

5. **Write tests**:
   - Unit test for detection logic
   - Integration test with real transaction
   - Wallet analysis test for validation

6. **Validate** by running wallet analysis on bibhu's wallet

---

## Anti-Patterns

- ❌ Writing code without an issue
- ❌ Merging without tests
- ❌ Testing only with mocks
- ❌ Large PRs (> 500 lines changed)
- ❌ Unclear variable names (`temp`, `data`, `res`)
- ❌ Silent failures (always log or throw)
- ❌ Ignoring edge cases

---

## Getting Help

- Check existing code in `packages/tx-parser/src/` for patterns
- Review `docs/VISION.md` for product context
- Check `docs/issues/` for similar implementations

---

*Last updated: Feb 10, 2026*
