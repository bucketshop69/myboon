import { describe, expect, it } from 'vitest'
import { publishWalletRepeatDecision, validWalletRepeatPacket } from './fixtures/wallet-repeat.js'
import { validateApprovedResearchPacket, validateRenderableResearchPacket, validateResearchPacket } from './packet-validator.js'

describe('feed v3 research packet validation', () => {
  it('accepts a valid wallet-repeat packet with publish decision', () => {
    const result = validateResearchPacket(validWalletRepeatPacket, publishWalletRepeatDecision)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts a valid wallet-repeat packet as an approved writer handoff', () => {
    const result = validateApprovedResearchPacket(validWalletRepeatPacket, publishWalletRepeatDecision)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects malformed runtime input without throwing', () => {
    const result = validateResearchPacket({ entities: 'not-array', facts: 'not-array', materiality: null })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('schemaVersion must be 1')
    expect(result.errors).toContain('facts must be an array')
    expect(result.errors).toContain('entities must not be empty')
  })

  it('rejects missing story keys', () => {
    const packet = { ...validWalletRepeatPacket, storyKey: '' }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('storyKey is required')
  })

  it('rejects publish packets without whatChanged', () => {
    const packet = { ...validWalletRepeatPacket, whatChanged: '' }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('whatChanged is required')
  })

  it('rejects facts without receipts', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: [
        {
          ...validWalletRepeatPacket.facts[0]!,
          receipt: { source: 'polymarket' as const, sourceId: '', capturedAt: '' },
        },
        ...validWalletRepeatPacket.facts.slice(1),
      ],
    }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('facts[0].receipt.sourceId is required')
    expect(result.errors).toContain('facts[0].receipt.capturedAt must be an ISO date')
  })

  it('rejects invalid enum values', () => {
    const packet = {
      ...validWalletRepeatPacket,
      segment: 'Polymarket',
      status: 'ready',
    }
    const decision = {
      ...publishWalletRepeatDecision,
      decision: 'approve',
      surface: 'homepage',
    }
    const result = validateResearchPacket(packet, decision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('segment must be one of Smart Money, Breaking Tape, Receipt Check, Thread Update, Crowded Trade, Market Structure')
    expect(result.errors).toContain('status must be one of new, update, developing, killed')
    expect(result.errors).toContain('decision.decision must be one of publish, update, hold, merge, suppress, escalate')
    expect(result.errors).toContain('decision.surface must be one of feed_card, thread, push_alert, daily_report, market_detail, none')
  })

  it('rejects publish decisions with fewer than two wallet trade facts', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: validWalletRepeatPacket.facts.filter((fact) => fact.factType !== 'wallet.trade').concat(validWalletRepeatPacket.facts[0]!),
    }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('publishable wallet.repeat_action packet requires at least two wallet.trade facts')
  })

  it('allows missing market context as hold with uncertainty', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: validWalletRepeatPacket.facts.slice(0, 2),
      uncertainty: ['No market odds snapshot was available near the second trade.'],
      successCriteria: [],
    }
    const decision = {
      ...publishWalletRepeatDecision,
      decision: 'hold' as const,
      surface: 'none' as const,
      reason: 'Missing odds receipt.',
    }
    const result = validateResearchPacket(packet, decision)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects unbounded scores', () => {
    const packet = { ...validWalletRepeatPacket, confidence: 12 }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('confidence must be between 0 and 1')
  })

  it('requires thread id for merge decisions', () => {
    const decision = { ...publishWalletRepeatDecision, decision: 'merge' as const, surface: 'thread' as const }
    const result = validateResearchPacket(validWalletRepeatPacket, decision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('merge decision requires packet.threadId')
  })

  it('requires publish decision for approved writer handoff', () => {
    const decision = { ...publishWalletRepeatDecision, decision: 'hold' as const, surface: 'none' as const }
    const result = validateApprovedResearchPacket(validWalletRepeatPacket, decision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('approved writer handoff requires a publish decision')
  })

  it('allows update decisions for renderable writer handoff', () => {
    const packet = {
      ...validWalletRepeatPacket,
      threadId: 'thread-1',
      status: 'update' as const,
    }
    const decision = {
      ...publishWalletRepeatDecision,
      decision: 'update' as const,
      surface: 'thread' as const,
    }
    const result = validateRenderableResearchPacket(packet, decision)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('requires thread surface for update decisions', () => {
    const packet = {
      ...validWalletRepeatPacket,
      threadId: 'thread-1',
      status: 'update' as const,
    }
    const decision = {
      ...publishWalletRepeatDecision,
      decision: 'update' as const,
      surface: 'feed_card' as const,
    }
    const result = validateResearchPacket(packet, decision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('update decision must use surface thread')
  })

  it('rejects hold decisions for renderable writer handoff', () => {
    const decision = { ...publishWalletRepeatDecision, decision: 'hold' as const, surface: 'none' as const }
    const result = validateRenderableResearchPacket(validWalletRepeatPacket, decision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('renderable writer handoff requires a publish or update decision')
  })

  it('rejects wallet trade facts that do not match packet entities', () => {
    const packet = {
      ...validWalletRepeatPacket,
      facts: [
        {
          ...validWalletRepeatPacket.facts[0]!,
          values: {
            ...validWalletRepeatPacket.facts[0]!.values,
            wallet: '0xdef',
          },
        },
        ...validWalletRepeatPacket.facts.slice(1),
      ],
    }
    const result = validateResearchPacket(packet, publishWalletRepeatDecision)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('wallet.trade fact 0 wallet does not match packet wallet entity')
  })
})
