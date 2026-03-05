/**
 * POC script: inspect raw DLMM instruction data to extract real discriminators
 * Run: node --env-file=../../.env --loader ts-node/esm inspect-dlmm.ts
 * Or build first: pnpm build && node dist/inspect-dlmm.js
 */

import { Connection } from '@solana/web3.js';

const SIGNATURES = {
  ADD_LIQUIDITY:
    '4yNXiMrbHQ3nxrMh1EsoFfz2vfugz7Atq8hwuiEBxsntRsqCxATWgcBzjAyUnkoKd5aXAyL4jFfqKoTEvFur7pbs',
  REMOVE_LIQUIDITY:
    '5fnVBAjEbbR7LSXdtmf9srZ2YdpZ7Tw9e1YsdNXJMEnYgH5fCFexgUn8bFbkALxJWGesBbWfRLZgS4V9J4WM1F7P'
};

const DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map(Array.from(BASE58_ALPHABET).map((char, idx) => [char, idx]));

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  if (decimals <= 0) {
    return rawAmount.toString();
  }

  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const fraction = rawAmount % base;
  const trimmedFraction = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

  if (trimmedFraction.length === 0) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmedFraction}`;
}

function decodeInstructionData(data: string): Buffer | null {
  let value = 0n;
  for (const char of data) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) {
      return null;
    }
    value = value * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  bytes.reverse();

  let leadingZeroes = 0;
  while (leadingZeroes < data.length && data[leadingZeroes] === '1') {
    leadingZeroes += 1;
  }

  const decoded = new Uint8Array(leadingZeroes + bytes.length);
  for (let i = 0; i < leadingZeroes; i++) {
    decoded[i] = 0;
  }
  for (let i = 0; i < bytes.length; i++) {
    decoded[leadingZeroes + i] = bytes[i];
  }

  if (decoded.length === 0) {
    return null;
  }

  return Buffer.from(decoded);
}

async function inspect(label: string, signature: string, connection: Connection) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TX: ${label}`);
  console.log(`SIG: ${signature}`);
  console.log('='.repeat(60));

  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    console.log('NOT FOUND');
    return;
  }

  const accountKeys = tx.transaction.message.accountKeys;
  console.log('\n--- Account Keys ---');
  accountKeys.forEach((k, i) => {
    console.log(`  [${i}] ${k.pubkey.toBase58()}${k.signer ? ' (signer)' : ''}${k.writable ? ' (writable)' : ''}`);
  });

  console.log('\n--- Top-level Instructions ---');
  tx.transaction.message.instructions.forEach((ix, i) => {
    const programId = 'programId' in ix ? ix.programId.toBase58() : 'unknown';
    const isDlmm = programId === DLMM_PROGRAM;
    console.log(`\n  [${i}] Program: ${programId}${isDlmm ? ' ← DLMM' : ''}`);

    if ('data' in ix && typeof ix.data === 'string') {
      const raw = decodeInstructionData(ix.data);
      if (!raw) {
        console.log(`      data decode failed (expected base58): ${ix.data.slice(0, 40)}...`);
        return;
      }
      const disc = raw.slice(0, 8).toString('hex');
      console.log(`      data (base58): ${ix.data.slice(0, 40)}...`);
      console.log(`      discriminator: ${disc}`);
      console.log(`      full bytes (hex): ${raw.toString('hex')}`);
    } else if ('parsed' in ix) {
      console.log(`      parsed type: ${(ix as any).parsed?.type ?? 'unknown'}`);
    }

    if ('accounts' in ix && Array.isArray(ix.accounts)) {
      console.log(`      accounts: [${ix.accounts.join(', ')}]`);
    }
  });

  console.log('\n--- Inner Instructions ---');
  (tx.meta?.innerInstructions ?? []).forEach((inner) => {
    console.log(`\n  outer index [${inner.index}]:`);
    inner.instructions.forEach((ix, i) => {
      const programId = 'programId' in ix ? ix.programId.toBase58() : 'unknown';
      const isDlmm = programId === DLMM_PROGRAM;
      console.log(`    [${i}] Program: ${programId}${isDlmm ? ' ← DLMM' : ''}`);

      if ('data' in ix && typeof ix.data === 'string') {
        const raw = decodeInstructionData(ix.data);
        if (!raw) {
          console.log(`        data decode failed (expected base58): ${ix.data.slice(0, 40)}...`);
          return;
        }
        const disc = raw.slice(0, 8).toString('hex');
        console.log(`        discriminator: ${disc}`);
      } else if ('parsed' in ix) {
        console.log(`        parsed type: ${(ix as any).parsed?.type ?? 'unknown'}`);
      }
    });
  });

  console.log('\n--- Token Balance Changes ---');
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const preMap = new Map(pre.map((b) => [`${b.accountIndex}:${b.mint}`, b] as const));
  const postMap = new Map(post.map((b) => [`${b.accountIndex}:${b.mint}`, b] as const));
  const keys = new Set([...preMap.keys(), ...postMap.keys()]);

  for (const key of keys) {
    const preBalance = preMap.get(key);
    const postBalance = postMap.get(key);
    const balance = postBalance ?? preBalance;
    if (!balance) {
      continue;
    }

    const preAmount = BigInt(preBalance?.uiTokenAmount.amount ?? '0');
    const postAmount = BigInt(postBalance?.uiTokenAmount.amount ?? '0');
    const rawDiff = postAmount - preAmount;
    if (rawDiff === 0n) {
      continue;
    }

    const decimals = postBalance?.uiTokenAmount.decimals ?? preBalance?.uiTokenAmount.decimals ?? 0;
    const owner = postBalance?.owner ?? preBalance?.owner ?? 'unknown';
    const absolute = rawDiff < 0n ? -rawDiff : rawDiff;
    const amount = formatTokenAmount(absolute, decimals);

    console.log(
      `  account=${balance.accountIndex} mint=${balance.mint.slice(0, 8)}... owner=${owner.slice(0, 8)}... diff=${rawDiff < 0n ? '-' : '+'}${amount}`
    );
  }
}

async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) {
    throw new Error('HELIUS_RPC_URL not set');
  }

  const connection = new Connection(rpcUrl, 'confirmed');

  await inspect('ADD_LIQUIDITY', SIGNATURES.ADD_LIQUIDITY, connection);
  await inspect('REMOVE_LIQUIDITY', SIGNATURES.REMOVE_LIQUIDITY, connection);
}

main().catch(console.error);
