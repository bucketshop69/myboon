import assert from 'node:assert/strict';
import {
  createMemoryMeteoraPendingStorage,
  createMeteoraPendingStore,
  parseMeteoraPendingExecution,
  type MeteoraPendingExecution,
} from './meteora.pending';

function pending(
  intentId: string,
  walletAddress = 'wallet-a',
  network: MeteoraPendingExecution['network'] = 'mainnet-beta',
): MeteoraPendingExecution {
  return {
    version: 1,
    intentId,
    planId: 'plan-1',
    previewId: 'preview-1',
    walletAddress,
    network,
    poolAddress: 'pool-a',
    action: 'create_position',
    resourceAddress: 'position-a',
    status: 'submitted',
    totalSteps: 1,
    steps: [{
      index: 0,
      signature: 'signature-a',
      blockhash: 'blockhash-a',
      lastValidBlockHeight: 100,
      status: 'submitted',
      submittedAt: 1,
      confirmedAt: null,
      explorerUrl: 'https://explorer.solana.com/tx/signature-a',
      errorCode: null,
    }],
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 30_000,
    preparedBlockhash: null,
    preparedLastValidBlockHeight: null,
  };
}

async function testStoreRoundTripAndScope(): Promise<void> {
  const storage = createMemoryMeteoraPendingStorage();
  const store = createMeteoraPendingStore(storage);
  await store.save(pending('intent-mainnet'));
  await store.save(pending('intent-devnet', 'wallet-a', 'devnet'));
  await store.save(pending('intent-other-wallet', 'wallet-b'));

  assert.equal((await store.get('intent-mainnet'))?.intentId, 'intent-mainnet');
  assert.equal((await store.findActive('WALLET-A', 'mainnet-beta'))?.intentId, 'intent-mainnet');
  assert.equal((await store.findActive('wallet-a', 'devnet'))?.intentId, 'intent-devnet');
  assert.equal((await store.findActive('wallet-c', 'mainnet-beta')), null);

  await store.remove('intent-mainnet');
  assert.equal(await store.get('intent-mainnet'), null);
  assert.deepEqual((await store.list()).map((entry) => entry.intentId), [
    'intent-devnet',
    'intent-other-wallet',
  ]);
}

async function testOnlyPublicMetadataPersists(): Promise<void> {
  const values = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
  const store = createMeteoraPendingStore(storage);
  const unsafe = {
    ...pending('intent-safe'),
    secretKey: [1, 2, 3],
    serializedTransaction: 'must-not-persist',
  } as MeteoraPendingExecution;
  await store.save(unsafe);

  const serialized = [...values.values()].join('\n');
  assert.equal(serialized.includes('secretKey'), false);
  assert.equal(serialized.includes('serializedTransaction'), false);
  assert.equal(serialized.includes('signature-a'), true);
}

function testParserBoundaries(): void {
  assert.equal(parseMeteoraPendingExecution(null), null);
  assert.equal(parseMeteoraPendingExecution({}), null);
  assert.equal(parseMeteoraPendingExecution({ ...pending('bad-total'), totalSteps: 0 }), null);
  assert.equal(parseMeteoraPendingExecution({
    ...pending('bad-step'),
    steps: [{ ...pending('x').steps[0], lastValidBlockHeight: 1.5 }],
  }), null);
  assert.equal(parseMeteoraPendingExecution(pending('valid'))?.intentId, 'valid');
  assert.equal(parseMeteoraPendingExecution({
    ...pending('prepared'),
    status: 'prepared',
    steps: [],
  })?.status, 'prepared');
}

async function main(): Promise<void> {
  await testStoreRoundTripAndScope();
  await testOnlyPublicMetadataPersists();
  testParserBoundaries();
  console.log('Meteora pending metadata tests passed');
}

void main();
