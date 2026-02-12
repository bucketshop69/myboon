import { describe, expect, it } from 'vitest';

import { loadAppConfig, parseWalletFilter } from '../config.js';

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
    expect(config.watchedWallets.length).toBeGreaterThan(0);
    expect(config.streamSummaryBatchSize).toBe(10);
  });

  it('throws when HELIUS_RPC_URL is missing', () => {
    expect(() =>
      loadAppConfig({
        env: {}
      })
    ).toThrow('Missing HELIUS_RPC_URL');
  });

  it('reads stream batch size from STREAM_SUMMARY_BATCH_SIZE', () => {
    const config = loadAppConfig({
      env: {
        HELIUS_RPC_URL: 'https://rpc.example.test',
        STREAM_SUMMARY_BATCH_SIZE: '25'
      }
    });

    expect(config.streamSummaryBatchSize).toBe(25);
  });
});

describe('parseWalletFilter', () => {
  it('returns registry wallets for known category', () => {
    const wallets = parseWalletFilter('kol');
    expect(wallets.length).toBeGreaterThan(0);
  });

  it('returns csv wallets as-is', () => {
    const wallets = parseWalletFilter('7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C,8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd');
    expect(wallets).toEqual([
      '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C',
      '8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd'
    ]);
  });

  it('throws for unknown category string', () => {
    expect(() => parseWalletFilter('foo')).toThrow('Invalid WATCHED_WALLETS category');
  });
});
