# 010: Identify LP Protocol

## Goal

Enhance LP transaction parsing to extract specific protocol details (add/remove liquidity, positions, fees earned).

## Why

- Basic LP identification done in Issue 007
- Need protocol-specific details for user profiling
- LP behavior is key differentiator (degen vs LP provider)
- Required to track user's DeFi participation

---

## Critical Thinking & Decisions

### Decision 1: LP Data Sources

**Considered:**
- A. Parse instruction data directly
- B. Use token account changes (LP tokens received)
- C. Query on-chain position accounts

**Chosen:** Option A + B (instruction parsing + token balance changes)

**Why:**
- Instructions tell us action (add/remove)
- Token balance changes show amounts
- Position accounts are protocol-specific

### Decision 2: LP Action Types

**Must detect:**
- Add liquidity (single token or dual)
- Remove liquidity
- Claim fees
- Close position

**Nice to have:**
- Stake/unstake LP tokens
- Harvest rewards
- Range changes (Meteora)

**Chosen:** Focus on add/remove for MVP

### Decision 3: LP Token Identification

**Considered:**
- A. Track by pool address
- B. Track by LP token mint
- C. Track by token pair

**Chosen:** Option B (LP token mint)

**Why:**
- LP tokens are standard SPL tokens
- Easy to track in token balances
- Can map to pool info via on-chain data

### Decision 4: Meteora vs Raydium Differences

**Considered:**
- A. Unified parser
- B. Separate parsers per protocol
- C. Unified interface, separate implementations

**Chosen:** Option C (same as perp)

**Why:**
- Different instruction formats
- Same interface for downstream
- Meteora has unique range features

---

## Approach

For LP transactions:

1. Identify which LP protocol (Meteora, Raydium, Sanctum)
2. Parse instruction data to determine action (add/remove)
3. Calculate token amounts from balance changes
4. Return structured LP details

---

## Implementation Steps

### Step 1: Create LP types

```typescript
// src/types/lp.ts

export type LpProtocol = 'meteora' | 'raydium' | 'sanctum' | 'unknown';

export type LpAction = 
  | 'add_liquidity'
  | 'remove_liquidity'
  | 'claim_fees'
  | 'stake'
  | 'unstake'
  | 'unknown';

export interface LpDetails {
  protocol: LpProtocol;
  pool: string; // Pool address or token pair name
  action: LpAction;
  tokenA: {
    mint: string;
    amount: number;
  };
  tokenB: {
    mint: string;
    amount: number;
  };
  lpTokenMint: string;
  lpTokenAmount: number;
  feeAmount?: number;
  timestamp: number;
}

export interface LpPosition {
  protocol: LpProtocol;
  pool: string;
  tokenA: string;
  tokenB: string;
  lpTokenMint: string;
  lpTokenAmount: number;
  range?: {
    lower: number;
    upper: number;
  };
}
```

### Step 2: Create Meteora parser

```typescript
// src/parsers/meteora.ts

import { TransactionResponse } from '@solana/web3.js';
import { LpDetails, LpAction, LpProtocol } from '../types/lp';
import { PROGRAM_IDS } from '../constants';

export function parseMeteoraLpTransaction(
  transaction: TransactionResponse
): LpDetails | null {
  // Check for Meteora program
  const hasMeteoraInstruction = transaction.transaction.message.instructions.some(
    ix => getProgramIdFromInstruction(ix) === PROGRAM_IDS.METEORA
  );
  
  if (!hasMeteoraInstruction) {
    return null;
  }
  
  // Determine action from instruction
  const action = determineLpAction(transaction, 'meteora');
  
  // Calculate token amounts from balance changes
  const tokenAmounts = calculateLpTokenAmounts(transaction);
  
  // Get pool info (simplified - would need pool lookup)
  const poolInfo = getMeteoraPoolInfo(transaction);
  
  return {
    protocol: 'meteora',
    pool: poolInfo,
    action,
    tokenA: tokenAmounts.tokenA,
    tokenB: tokenAmounts.tokenB,
    lpTokenMint: tokenAmounts.lpMint,
    lpTokenAmount: tokenAmounts.lpAmount,
    feeAmount: tokenAmounts.fees,
    timestamp: transaction.blockTime || Date.now(),
  };
}

function determineLpAction(
  transaction: TransactionResponse,
  protocol: string
): LpAction {
  const instructions = transaction.transaction.message.instructions;
  
  // Meteora instruction variants:
  // 0 = create_position
  // 1 = add_liquidity
  // 2 = remove_liquidity
  // etc.
  
  // Simplified: check instruction count and balance changes
  const preBalances = transaction.meta?.preTokenBalances || [];
  const postBalances = transaction.meta?.postTokenBalances || [];
  
  const preLPTokens = preBalances.filter(b => isLpToken(b.mint)).length;
  const postLPTokens = postBalances.filter(b => isLpToken(b.mint)).length;
  
  if (postLPTokens > preLPTokens) {
    return 'add_liquidity';
  } else if (postLPTokens < preLPTokens) {
    return 'remove_liquidity';
  }
  
  return 'unknown';
}

function calculateLpTokenAmounts(
  transaction: TransactionResponse
): {
  tokenA: { mint: string; amount: number };
  tokenB: { mint: string; amount: number };
  lpMint: string;
  lpAmount: number;
  fees: number;
} {
  const preBalances = transaction.meta?.preTokenBalances || [];
  const postBalances = transaction.meta?.postTokenBalances || [];
  
  // Calculate changes
  const changes = new Map<string, { pre: number; post: number }>();
  
  for (const pre of preBalances) {
    const key = pre.mint;
    changes.set(key, { pre: pre.uiAmount, post: 0 });
  }
  
  for (const post of postBalances) {
    const key = post.mint;
    const existing = changes.get(key);
    if (existing) {
      existing.post = post.uiAmount;
    } else {
      changes.set(key, { pre: 0, post: post.uiAmount });
    }
  }
  
  // Identify tokens
  let tokenAMint = '';
  let tokenBmint = '';
  let tokenAAmount = 0;
  let tokenBamount = 0;
  let lpMint = '';
  let lpAmount = 0;
  
  for (const [mint, balance] of changes) {
    const change = balance.post - balance.pre;
    
    // Skip zero changes
    if (Math.abs(change) < 0.0001) continue;
    
    // LP token detection (simplified - in production, check against known pools)
    if (isLpToken(mint)) {
      lpMint = mint;
      lpAmount = Math.abs(change);
    } else {
      // Regular token
      if (!tokenAMint) {
        tokenAMint = mint;
        tokenAAmount = change;
      } else {
        tokenBmint = mint;
        tokenBamount = change;
      }
    }
  }
  
  return {
    tokenA: { mint: tokenAMint, amount: Math.abs(tokenAAmount) },
    tokenB: { mint: tokenBmint, amount: Math.abs(tokenBamount) },
    lpMint,
    lpAmount,
    fees: 0, // Would need fee tracking
  };
}

function isLpToken(mint: string): boolean {
  // In production, check against known LP token mints
  // For MVP, this is a placeholder
  return false; // Would check against registry
}

function getMeteoraPoolInfo(transaction: TransactionResponse): string {
  // Extract pool address from instruction accounts
  // For MVP, return placeholder
  return 'unknown';
}
```

### Step 3: Create LP parser orchestrator

```typescript
// src/parsers/lp.ts

import { TransactionResponse } from '@solana/web3.js';
import { LpDetails } from '../types/lp';
import { parseMeteoraLpTransaction } from './meteora';
import { parseRaydiumLpTransaction } from './raydium';

export function parseLpTransaction(
  transaction: TransactionResponse,
  protocol: string
): LpDetails | null {
  switch (protocol) {
    case 'meteora':
      return parseMeteoraLpTransaction(transaction);
    case 'raydium':
      return parseRaydiumLpTransaction(transaction);
    default:
      return null;
  }
}

// Placeholder for Raydium
function parseRaydiumLpTransaction(
  transaction: TransactionResponse
): LpDetails | null {
  // Raydium has similar structure but different instruction format
  // Implementation would mirror Meteora with Raydium-specific decoding
  
  return null;
}
```

### Step 4: Create LP utilities

```typescript
// src/utils/lp.ts

import { LpPosition } from '../types/lp';

// Get all LP positions for a wallet (from token accounts)
export function identifyLpPositions(
  tokenAccounts: Array<{ mint: string; amount: number }>
): LpPosition[] {
  // Filter for known LP tokens
  // Map to positions
  // In production, would cross-reference with pool registry
  
  return [];
}

// Calculate total LP value
export function calculateLpValue(
  positions: LpPosition[],
  prices: Record<string, number>
): number {
  let totalValue = 0;
  
  for (const pos of positions) {
    // LP value = tokenA value + tokenB value
    // Would need current prices to calculate
    totalValue += 0; // Placeholder
  }
  
  return totalValue;
}

// Detect if user is primarily an LP provider
export function analyzeLpBehavior(
  lpTransactions: LpDetails[]
): {
  isLpProvider: boolean;
  preferredProtocol: string;
  avgFrequency: number;
} {
  if (lpTransactions.length === 0) {
    return {
      isLpProvider: false,
      preferredProtocol: 'unknown',
      avgFrequency: 0,
    };
  }
  
  // Count by protocol
  const protocolCounts: Record<string, number> = {};
  for (const tx of lpTransactions) {
    protocolCounts[tx.protocol] = (protocolCounts[tx.protocol] || 0) + 1;
  }
  
  // Find preferred
  const preferred = Object.entries(protocolCounts)
    .sort((a, b) => b[1] - a[1])[0];
  
  return {
    isLpProvider: lpTransactions.length >= 3,
    preferredProtocol: preferred?.[0] || 'unknown',
    avgFrequency: lpTransactions.length, // Simplified
  };
}
```

### Step 5: Create tests

```typescript
// src/__tests__/lp.test.ts
import { describe, it, expect } from 'vitest';
import { parseMeteoraLpTransaction } from '../parsers/meteora';
import { analyzeLpBehavior } from '../utils/lp';
import { LpDetails } from '../types/lp';

describe('parseMeteoraLpTransaction', () => {
  it('should return null for non-Meteora transaction', () => {
    const mockTx = createMockSwapTransaction();
    const result = parseMeteoraLpTransaction(mockTx);
    expect(result).toBeNull();
  });

  it('should parse Meteora add liquidity', () => {
    const mockTx = createMockLpTransaction('add');
    const result = parseMeteoraLpTransaction(mockTx);
    
    expect(result).not.toBeNull();
    expect(result?.protocol).toBe('meteora');
    expect(result?.action).toBe('add_liquidity');
  });

  it('should parse Meteora remove liquidity', () => {
    const mockTx = createMockLpTransaction('remove');
    const result = parseMeteoraLpTransaction(mockTx);
    
    expect(result).not.toBeNull();
    expect(result?.protocol).toBe('meteora');
    expect(result?.action).toBe('remove_liquidity');
  });
});

describe('analyzeLpBehavior', () => {
  it('should identify non-LP user', () => {
    const result = analyzeLpBehavior([]);
    expect(result.isLpProvider).toBe(false);
    expect(result.preferredProtocol).toBe('unknown');
  });

  it('should identify LP provider', () => {
    const txs: LpDetails[] = [
      createMockLpDetails('meteora'),
      createMockLpDetails('meteora'),
      createMockLpDetails('meteora'),
    ];
    
    const result = analyzeLpBehavior(txs);
    expect(result.isLpProvider).toBe(true);
    expect(result.preferredProtocol).toBe('meteora');
  });
});

// Helpers
function createMockSwapTransaction() {
  return {
    transaction: {
      message: {
        instructions: [{
          programId: { toString: () => 'JUP6LkbZbjS1jKKwapdHNy74zcZemXqb2u8wNFNTqTa' },
        }],
      },
      signatures: ['test-sig'],
    },
    meta: {
      preTokenBalances: [],
      postTokenBalances: [],
      fee: 5000,
      err: null,
    },
    slot: 100,
    blockTime: Date.now(),
  };
}

function createMockLpTransaction(action: 'add' | 'remove') {
  return {
    transaction: {
      message: {
        instructions: [{
          programId: { toString: () => 'MeteoraTFkB5jH7Ebu8E6r1J6L9fG8M2X6N1P4Q7R8S9T0' },
        }],
      },
      signatures: ['test-sig'],
    },
    meta: {
      preTokenBalances: [
        { mint: 'SOL', owner: 'user', uiAmount: 10 },
        { mint: 'USDC', owner: 'user', uiAmount: 1000 },
        { mint: 'LP-METEORA-SOL-USDC', owner: 'user', uiAmount: action === 'add' ? 0 : 50 },
      ],
      postTokenBalances: [
        { mint: 'SOL', owner: 'user', uiAmount: action === 'add' ? 8 : 9 },
        { mint: 'USDC', owner: 'user', uiAmount: action === 'add' ? 800 : 950 },
        { mint: 'LP-METEORA-SOL-USDC', owner: 'user', uiAmount: action === 'add' ? 25 : 0 },
      ],
      fee: 5000,
      err: null,
    },
    slot: 100,
    blockTime: Date.now(),
  };
}

function createMockLpDetails(protocol: string): LpDetails {
  return {
    protocol: protocol as 'meteora',
    pool: 'SOL-USDC',
    action: 'add_liquidity',
    tokenA: { mint: 'SOL', amount: 2 },
    tokenB: { mint: 'USDC', amount: 200 },
    lpTokenMint: 'LP-METEORA-SOL-USDC',
    lpTokenAmount: 25,
    timestamp: Date.now(),
  };
}
```

---

## Config

No additional config. Uses PROGRAM_IDS from Issue 007.

---

## Acceptance Criteria

- [ ] `parseMeteoraLpTransaction(tx)` returns LP details
- [ ] `parseLpTransaction(tx, protocol)` routes to correct parser
- [ ] LP details include: protocol, pool, action, token amounts
- [ ] `analyzeLpBehavior(txs)` identifies if user is LP provider
- [ ] All tests pass

---

## Files to Create

| File | Action |
|------|--------|
| `packages/tx-parser/src/types/lp.ts` | Create |
| `packages/tx-parser/src/parsers/meteora.ts` | Create |
| `packages/tx-parser/src/parsers/lp.ts` | Create |
| `packages/tx-parser/src/utils/lp.ts` | Create |
| `packages/tx-parser/src/__tests__/lp.test.ts` | Create |

## Files to Modify

| File | Change |
|------|--------|
| `packages/tx-parser/src/types/index.ts` | Export lp types |
| `packages/tx-parser/src/parsers/index.ts` | Export lp parsers |
| `packages/tx-parser/src/parsers/transaction.ts` | Use lp parser for details |

---

## Testing Strategy

**Unit Tests:**
- Meteora add liquidity parsing
- Meteora remove liquidity parsing
- Raydium parsing (placeholder)
- LP behavior analysis

**Integration Tests:**
- Parse real Meteora LP transactions from devnet
- Verify token amount calculations

**Known Limitation:**
- LP token detection requires registry
- Pool info lookup needs on-chain queries
- Fee tracking requires additional logic

---

## References

- [Meteora Documentation](https://docs.meteora.ag)
- [Raydium Liquidity](https://docs.raydium.io/raydium/adding-liquidity)
- [Sanctum Protocol](https://docs.sanctum.so)
- [Solana Token Program](https://docs.solana.com/apps/references/ tokens)
