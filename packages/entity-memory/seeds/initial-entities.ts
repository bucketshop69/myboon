import type { CreateEntityInput } from '../src/types/index.js';

export const INITIAL_ENTITIES: CreateEntityInput[] = [
  {
    slug: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    type: 'crypto-token',
    verified: true,
    verifiedBy: 'community',
    metadata: {
      category: ['layer1'],
      tags: ['chain:solana']
    }
  },
  {
    slug: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    type: 'crypto-token',
    verified: true,
    verifiedBy: 'community',
    metadata: {
      category: ['store-of-value']
    }
  },
  {
    slug: 'gold',
    name: 'Gold',
    symbol: 'XAU',
    type: 'macro-asset',
    verified: true,
    verifiedBy: 'community',
    metadata: {
      category: ['commodity']
    }
  },
  {
    slug: 'jupiter',
    name: 'Jupiter',
    type: 'protocol',
    verified: true,
    verifiedBy: 'community',
    metadata: {
      category: ['dex']
    }
  }
];
