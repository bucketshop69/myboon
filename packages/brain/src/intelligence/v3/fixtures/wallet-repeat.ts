import { oddsMoveCriterion } from '../../contracts.js'
import { FEED_V3_SCHEMA_VERSION, type EditorialDecision, type PacketFact, type ResearchPacket } from '../contracts.js'

const now = '2026-05-23T10:00:00.000Z'

const receipt = (sourceId: string) => ({
  source: 'polymarket' as const,
  sourceId,
  capturedAt: now,
  rawRef: `legacy-signal:${sourceId}`,
})

export const walletRepeatFacts: PacketFact[] = [
  {
    id: 'fact:trade:1',
    normalizedFactIds: ['normalized:trade:1'],
    claim: '0xabc bought 2,000 USDC of YES at 29c',
    factType: 'wallet.trade',
    observedAt: '2026-05-23T08:00:00.000Z',
    values: {
      wallet: '0xabc',
      marketSlug: 'will-x-happen',
      outcome: 'YES',
      amountUsd: 2000,
      price: 0.29,
    },
    receipt: receipt('trade-1'),
    confidence: 0.95,
  },
  {
    id: 'fact:trade:2',
    normalizedFactIds: ['normalized:trade:2'],
    claim: '0xabc bought 3,500 USDC of YES at 31c',
    factType: 'wallet.trade',
    observedAt: '2026-05-23T11:20:00.000Z',
    values: {
      wallet: '0xabc',
      marketSlug: 'will-x-happen',
      outcome: 'YES',
      amountUsd: 3500,
      price: 0.31,
    },
    receipt: receipt('trade-2'),
    confidence: 0.95,
  },
  {
    id: 'fact:odds:1',
    normalizedFactIds: ['normalized:odds:1'],
    claim: 'YES moved from 22c to 34c around the sequence',
    factType: 'odds.snapshot',
    observedAt: '2026-05-23T11:30:00.000Z',
    values: {
      marketSlug: 'will-x-happen',
      fromPrice: 0.22,
      toPrice: 0.34,
      oddsDelta: 0.12,
    },
    receipt: receipt('odds-1'),
    confidence: 0.9,
  },
]

export const validWalletRepeatPacket: ResearchPacket = {
  schemaVersion: FEED_V3_SCHEMA_VERSION,
  id: 'packet:wallet-repeat:0xabc:will-x-happen:yes:up',
  storyCandidateId: 'candidate:wallet-repeat:0xabc:will-x-happen:yes:up',
  storyKey: 'polymarket:wallet-repeat:0xabc:will-x-happen:yes:up',
  segment: 'Smart Money',
  archetype: 'wallet_repeat_action',
  status: 'new',
  headlineClaim: 'Wallet 0xabc doubled down on YES',
  thesis: 'The same wallet added to the same side after the market had already repriced.',
  whyNow: 'The second buy happened after the first trade and after YES had moved away from 22c.',
  whatChanged: 'Position increased from 2,000 USDC to 5,500 USDC total exposure while YES moved from 22c to 34c.',
  entities: [
    { type: 'wallet', id: '0xabc', canonicalName: '0xabc' },
    { type: 'market', id: 'will-x-happen', canonicalName: 'Will X happen?' },
    { type: 'outcome', id: 'YES', canonicalName: 'YES' },
  ],
  facts: walletRepeatFacts,
  counterEvidence: [],
  materiality: {
    score: 0.78,
    reasons: ['repeat wallet action', 'meaningful total exposure', 'odds repriced during sequence'],
  },
  freshness: 0.88,
  confidence: 0.82,
  uncertainty: ['Polymarket activity API may not represent full position inventory.'],
  recommendedActions: [{ type: 'predict', slug: 'will-x-happen' }],
  successCriteria: [oddsMoveCriterion('up', 0.03, 24)],
  editorialConstraints: ['Do not imply motive or insider knowledge.'],
  createdAt: now,
}

export const publishWalletRepeatDecision: EditorialDecision = {
  schemaVersion: FEED_V3_SCHEMA_VERSION,
  packetId: validWalletRepeatPacket.id,
  decision: 'publish',
  surface: 'feed_card',
  priority: 7,
  reason: 'Fresh repeat action with receipt-backed odds movement.',
}
