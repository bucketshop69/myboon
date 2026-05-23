import { FEED_V3_SCHEMA_VERSION, type EditorialDecision, type PacketFact, type ResearchPacket } from './contracts.js'

export interface WalletRepeatStoryKeyInput {
  wallet: string
  marketId?: string | null
  slug?: string | null
  outcome?: string | null
  direction: 'up' | 'down'
}

export interface WalletRepeatDecisionOptions {
  now: string
  existingThreadId?: string | null
  duplicate?: boolean
  missingReceipts?: boolean
  unresolvedMarket?: boolean
  stale?: boolean
  noisy?: boolean
  materialChangeAfter?: string | null
  materialityThresholds?: {
    minNewTradeAmountUsd?: number
    minOddsDelta?: number
  }
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function buildWalletRepeatStoryKey(input: WalletRepeatStoryKeyInput): string {
  const market = input.marketId || input.slug
  if (!input.wallet.trim()) throw new Error('wallet is required to build wallet repeat story key')
  if (!market?.trim()) throw new Error('marketId or slug is required to build wallet repeat story key')
  if (!input.outcome?.trim()) throw new Error('outcome is required to build wallet repeat story key')

  return [
    'polymarket',
    'wallet-repeat',
    normalizePart(input.wallet),
    normalizePart(market),
    normalizePart(input.outcome),
    input.direction,
  ].join(':')
}

function hasFactReceipt(fact: PacketFact): boolean {
  return Boolean(fact.receipt.source && fact.receipt.sourceId && fact.receipt.capturedAt)
}

function walletTradeFacts(packet: ResearchPacket): PacketFact[] {
  return packet.facts.filter((fact) => fact.factType === 'wallet.trade')
}

function hasOddsContext(packet: ResearchPacket): boolean {
  return packet.facts.some((fact) => fact.factType === 'odds.snapshot' || fact.factType === 'market.snapshot')
}

function numericFactValue(fact: PacketFact, key: string): number | null {
  const value = fact.values[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hasMaterialChange(packet: ResearchPacket, options: WalletRepeatDecisionOptions): boolean {
  const thresholds = {
    minNewTradeAmountUsd: 500,
    minOddsDelta: 0.03,
    ...options.materialityThresholds,
  }
  return packet.facts.some((fact) => {
    if (options.materialChangeAfter && fact.observedAt <= options.materialChangeAfter) return false
    if (fact.factType === 'wallet.trade') {
      return (numericFactValue(fact, 'amountUsd') ?? 0) >= thresholds.minNewTradeAmountUsd
    }
    if (fact.factType === 'odds.snapshot') {
      return Math.abs(numericFactValue(fact, 'oddsDelta') ?? 0) >= thresholds.minOddsDelta
    }
    return false
  })
}

function decision(
  packet: ResearchPacket,
  kind: EditorialDecision['decision'],
  surface: EditorialDecision['surface'],
  priority: number,
  reason: string
): EditorialDecision {
  return {
    schemaVersion: FEED_V3_SCHEMA_VERSION,
    packetId: packet.id,
    decision: kind,
    surface,
    priority,
    reason,
  }
}

export function decideWalletRepeatPacket(
  packet: ResearchPacket,
  options: WalletRepeatDecisionOptions
): EditorialDecision {
  const trades = walletTradeFacts(packet)

  if (options.duplicate) {
    return decision(packet, 'suppress', 'none', 1, 'Duplicate wallet-repeat story with no material change.')
  }

  if (options.noisy) {
    return decision(packet, 'suppress', 'none', 1, 'Noisy or low-quality market is not eligible for feed publication.')
  }

  if (options.stale) {
    return decision(packet, 'suppress', 'none', 2, 'Wallet-repeat activity is stale.')
  }

  if (options.missingReceipts || !packet.facts.every(hasFactReceipt)) {
    return decision(packet, 'hold', 'none', 3, 'Missing required receipts for wallet-repeat packet.')
  }

  if (options.unresolvedMarket) {
    return decision(packet, 'hold', 'none', 3, 'Wallet-repeat story is missing a resolved market slug.')
  }

  if (trades.length < 2) {
    return decision(packet, 'hold', 'none', 3, 'Wallet-repeat story requires at least two wallet trade facts.')
  }

  if (!hasOddsContext(packet)) {
    return decision(packet, 'hold', 'none', 4, 'Wallet-repeat story is missing market or odds context.')
  }

  if (options.existingThreadId && packet.threadId !== options.existingThreadId) {
    return decision(packet, 'hold', 'none', 3, 'Existing thread id does not match packet thread id.')
  }

  if (options.existingThreadId && hasMaterialChange(packet, options)) {
    return decision(packet, 'update', 'thread', 6, 'Existing wallet-repeat story has a material update.')
  }

  if (options.existingThreadId) {
    return decision(packet, 'suppress', 'none', 1, 'Existing wallet-repeat story has no material update.')
  }

  return decision(packet, 'publish', 'feed_card', 7, 'Fresh wallet-repeat story with receipt-backed market context.')
}
