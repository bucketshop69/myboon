import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Load env like the tests do
const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  for (const line of readFileSync(rootEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

import { fetchWalletTransactions } from './rpc.js';
import { parseSingleTransaction } from './parsers/transaction.js';

async function analyzeWallet(wallet: string, limit = 50) {
  console.log(`\n📊 Analyzing wallet: ${wallet}\n`);
  
  const transactions = await fetchWalletTransactions(wallet, { count: limit });
  console.log(`Fetched ${transactions.length} transactions\n`);
  
  let parsed = 0;
  let unparsed = 0;
  const types: Record<string, number> = {};
  const unknownSignatures: string[] = [];
  
  for (const tx of transactions) {
    const result = parseSingleTransaction(tx);
    if (result && result.kind !== 'unknown') {
      parsed++;
      const kind = result.kind;
      types[kind] = (types[kind] || 0) + 1;
    } else {
      unparsed++;
      unknownSignatures.push(tx.signature);
    }
  }
  
  console.log('--- Results ---');
  console.log(`Parsed: ${parsed} (${Math.round(parsed/transactions.length*100)}%)`);
  console.log(`Unparsed: ${unparsed} (${Math.round(unparsed/transactions.length*100)}%)`);
  console.log('\nBreakdown by type:');
  
  for (const [type, count] of Object.entries(types)) {
    console.log(`  ${type}: ${count}`);
  }
  
  if (unknownSignatures.length > 0) {
    console.log(`\nFirst 5 unparsed tx signatures:`);
    unknownSignatures.slice(0, 5).forEach(sig => console.log(`  ${sig}`));
    
    // Save for later inspection
    writeFileSync('/tmp/unparsed.txt', unknownSignatures.join('\n'));
    console.log('\nSaved all unparsed signatures to /tmp/unparsed.txt');
  }
}

const wallet = process.argv[2] || '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C';
analyzeWallet(wallet, 50);
