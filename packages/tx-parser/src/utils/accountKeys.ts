import type { ParsedMessageAccount, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';

function toPubkeyString(account: ParsedMessageAccount): string {
  return account.pubkey.toBase58();
}

export function getAllAccountKeys(transaction: ParsedTransactionWithMeta): string[] {
  const message = transaction.transaction.message as ParsedTransactionWithMeta['transaction']['message'] & {
    staticAccountKeys?: PublicKey[];
  };

  const accountKeys = Array.isArray(message.staticAccountKeys)
    ? message.staticAccountKeys.map((key) => key.toBase58())
    : message.accountKeys.map(toPubkeyString);

  if (transaction.meta?.loadedAddresses) {
    accountKeys.push(
      ...transaction.meta.loadedAddresses.writable.map((key) => key.toBase58()),
      ...transaction.meta.loadedAddresses.readonly.map((key) => key.toBase58())
    );
  }

  return accountKeys;
}
