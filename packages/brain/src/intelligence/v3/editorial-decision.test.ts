import { describe, expect, it } from 'vitest'
import { validWalletRepeatPacket } from './fixtures/wallet-repeat.js'
import { buildWalletRepeatStoryKey, decideWalletRepeatPacket } from './editorial-decision.js'
import { validateResearchPacket } from './packet-validator.js'

const now = '2026-05-23T12:00:00.000Z'

describe('feed v3 editorial decision helpers', () => {
  it('builds stable Polymarket wallet-repeat story keys', () => {
    const storyKey = buildWalletRepeatStoryKey({
      wallet: '0xAbC',
      slug: 'Will X Happen?',
      outcome: 'YES',
      direction: 'up',
    })
    expect(storyKey).toBe('polymarket:wallet-repeat:0xabc:will-x-happen:yes:up')
    expect(validWalletRepeatPacket.storyKey).toBe(storyKey)
  })

  it('requires wallet, market, and outcome for story keys', () => {
    expect(() => buildWalletRepeatStoryKey({ wallet: '', slug: 'm', outcome: 'YES', direction: 'up' })).toThrow('wallet is required')
    expect(() => buildWalletRepeatStoryKey({ wallet: '0xabc', slug: null, marketId: null, outcome: 'YES', direction: 'up' })).toThrow('marketId or slug is required')
    expect(() => buildWalletRepeatStoryKey({ wallet: '0xabc', slug: 'm', outcome: '', direction: 'up' })).toThrow('outcome is required')
  })

  it('publishes fresh wallet-repeat packets with receipts and odds context', () => {
    const decision = decideWalletRepeatPacket(validWalletRepeatPacket, { now })
    expect(decision).toMatchObject({
      decision: 'publish',
      surface: 'feed_card',
      priority: 7,
    })
    expect(validateResearchPacket(validWalletRepeatPacket, decision).valid).toBe(true)
  })

  it('holds packets with fewer than two wallet trades', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: validWalletRepeatPacket.facts.slice(0, 1),
    }
    const decision = decideWalletRepeatPacket(packet, { now })
    expect(decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Wallet-repeat story requires at least two wallet trade facts.',
    })
    expect(validateResearchPacket(packet, decision).valid).toBe(true)
  })

  it('holds packets without odds or market context', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: validWalletRepeatPacket.facts.filter((fact) => fact.factType === 'wallet.trade'),
    }
    const decision = decideWalletRepeatPacket(packet, { now })
    expect(decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Wallet-repeat story is missing market or odds context.',
    })
    expect(validateResearchPacket(packet, decision).valid).toBe(true)
  })

  it('holds packets explicitly flagged as missing receipts', () => {
    const decision = decideWalletRepeatPacket(validWalletRepeatPacket, { now, missingReceipts: true })
    expect(decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Missing required receipts for wallet-repeat packet.',
    })
    expect(validateResearchPacket(validWalletRepeatPacket, decision).valid).toBe(true)
  })

  it('suppresses duplicates and stale/noisy packets', () => {
    for (const options of [{ duplicate: true }, { stale: true }, { noisy: true }]) {
      const decision = decideWalletRepeatPacket(validWalletRepeatPacket, { now, ...options })
      expect(decision.decision).toBe('suppress')
      expect(validateResearchPacket(validWalletRepeatPacket, decision).valid).toBe(true)
    }
  })

  it('updates existing threads when there is a material update', () => {
    const packet = { ...validWalletRepeatPacket, threadId: 'thread-1' }
    const decision = decideWalletRepeatPacket(packet, {
      now,
      existingThreadId: 'thread-1',
    })
    expect(decision).toMatchObject({
      decision: 'update',
      surface: 'thread',
      priority: 6,
    })
    expect(validateResearchPacket(packet, decision).valid).toBe(true)
  })

  it('does not emit update decisions without matching packet thread id', () => {
    const decision = decideWalletRepeatPacket(validWalletRepeatPacket, {
      now,
      existingThreadId: 'thread-1',
    })
    expect(decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Existing thread id does not match packet thread id.',
    })
    expect(validateResearchPacket(validWalletRepeatPacket, decision).valid).toBe(true)
  })

  it('suppresses existing stories without material change', () => {
    const packet = {
      ...validWalletRepeatPacket,
      threadId: 'thread-1',
      facts: validWalletRepeatPacket.facts.map((fact) => fact.factType === 'wallet.trade'
        ? { ...fact, values: { ...fact.values, amountUsd: 10 } }
        : fact.factType === 'odds.snapshot'
          ? { ...fact, values: { ...fact.values, oddsDelta: 0.005 } }
          : fact),
    }
    const decision = decideWalletRepeatPacket(packet, {
      now,
      existingThreadId: 'thread-1',
    })
    expect(decision).toMatchObject({
      decision: 'suppress',
      surface: 'none',
      reason: 'Existing wallet-repeat story has no material update.',
    })
    expect(validateResearchPacket(packet, decision).valid).toBe(true)
  })
})
