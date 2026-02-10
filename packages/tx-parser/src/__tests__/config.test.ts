import { describe, expect, it } from 'vitest';

import { loadAppConfig } from '../config.js';

describe('loadAppConfig', () => {
  it('reads config from provided environment', () => {
    const config = loadAppConfig({
      env: {
        HELIUS_RPC_URL: 'https://rpc.example.test',
        EXAMPLE_WALLET: 'wallet-1'
      }
    });

    expect(config.heliusRpcUrl).toBe('https://rpc.example.test');
    expect(config.exampleWallet).toBe('wallet-1');
    expect(config.defaultTxCount).toBe(50);
    expect(config.defaultCommitment).toBe('confirmed');
  });

  it('throws when HELIUS_RPC_URL is missing', () => {
    expect(() =>
      loadAppConfig({
        env: {}
      })
    ).toThrow('Missing HELIUS_RPC_URL');
  });
});
