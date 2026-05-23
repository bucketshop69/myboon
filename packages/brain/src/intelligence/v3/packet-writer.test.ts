import { describe, expect, it } from 'vitest'
import { publishWalletRepeatDecision, validWalletRepeatPacket } from './fixtures/wallet-repeat.js'
import {
  buildPacketWriterPrompt,
  createPacketWriterInput,
  toPacketBackedPublishedRow,
  validatePacketBackedOutput,
} from './packet-writer.js'
import type { PublishedOutput } from '../../publisher-types.js'

const validOutput: PublishedOutput = {
  content_small: '0xabc added 3,500 USDC on YES.\nTotal exposure is 5,500 USDC.\nYES moved to 34c.',
  content_full: 'The packet shows two same-side buys at 29c and 31c, with YES moving from 22c to 34c. Treat it as positioning, not proof of motive.',
  reasoning: 'Uses only packet facts: wallet repeat action, total exposure, trade prices, and odds context.',
  tags: ['polymarket', 'smart-money'],
  priority: 7,
  publisher_score: 8,
  actions: [{ type: 'predict', slug: 'will-x-happen' }],
  content_type: 'signal',
}

describe('feed v3 packet-backed writer handoff', () => {
  it('creates writer input only from an approved publish packet', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)

    expect(input).toMatchObject({
      packetId: validWalletRepeatPacket.id,
      storyKey: validWalletRepeatPacket.storyKey,
      segment: 'Smart Money',
      archetype: 'wallet_repeat_action',
      allowedActions: [{ type: 'predict', slug: 'will-x-happen' }],
    })
    expect(input.facts).toHaveLength(validWalletRepeatPacket.facts.length)
    expect(input.facts[0].receipt).toMatchObject({
      source: 'polymarket',
      sourceId: 'trade-1',
    })
  })

  it('rejects non-publish decisions before writer handoff', () => {
    expect(() => createPacketWriterInput(validWalletRepeatPacket, {
      ...publishWalletRepeatDecision,
      decision: 'hold',
      surface: 'none',
    })).toThrow('approved writer handoff requires a publish decision')
  })

  it('builds a packet-only writer prompt', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const prompt = buildPacketWriterPrompt(input)

    expect(prompt).toContain('using only the approved ResearchPacket')
    expect(prompt).toContain(validWalletRepeatPacket.id)
    expect(prompt).toContain('allowedActions')
    expect(prompt).toContain('Do not discover new facts')
  })

  it('accepts output whose numbers and actions are backed by the packet', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, validOutput)

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects unsupported numeric claims', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, {
      ...validOutput,
      content_small: '0xabc added 99,000 USDC on YES.\nThis is a huge new position.',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('unsupported numeric claim: 99000')
  })

  it('rejects actions that were not approved by the packet', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, {
      ...validOutput,
      actions: [
        { type: 'predict', slug: 'will-x-happen' },
        { type: 'perps', asset: 'BTC' },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('unsupported action: {"type":"perps","asset":"BTC"}')
  })

  it('rejects malformed output schema without throwing', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, {
      ...validOutput,
      content_small: 123,
      actions: 'predict',
      content_type: 'rumor',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('content_small is required')
    expect(result.errors).toContain('actions must be an array')
    expect(result.errors).toContain('content_type must be one of fomo, signal, sports, macro, news, crypto')
  })

  it('rejects approved action types with extra fields', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, {
      ...validOutput,
      actions: [{ type: 'predict', slug: 'will-x-happen', source: 'writer-added' }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('invalid action shape: {"type":"predict","slug":"will-x-happen","source":"writer-added"}')
  })

  it('rejects invented non-numeric causal or motive claims', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const result = validatePacketBackedOutput(input, {
      ...validOutput,
      content_full: 'The wallet doubled down because insider information leaked. That motive is not in the packet.',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('unsupported causal or motive claim')
  })

  it('maps validated output to a packet-backed persistence row', () => {
    const input = createPacketWriterInput(validWalletRepeatPacket, publishWalletRepeatDecision)
    const row = toPacketBackedPublishedRow(input, validOutput)

    expect(row).toMatchObject({
      packet_id: validWalletRepeatPacket.id,
      story_key: validWalletRepeatPacket.storyKey,
      story_candidate_id: validWalletRepeatPacket.storyCandidateId,
      thread_id: null,
      schema_version: 1,
      success_criteria: validWalletRepeatPacket.successCriteria,
    })
    expect(row.evidence_refs).toHaveLength(validWalletRepeatPacket.facts.length)
    expect(row.evidence_refs[0]).toMatchObject({
      factId: 'fact:trade:1',
      source: 'polymarket',
      sourceId: 'trade-1',
    })
  })

  it('includes counter-evidence receipts in packet-backed persistence refs', () => {
    const counterEvidence = {
      ...validWalletRepeatPacket.facts[0],
      id: 'fact:counter:1',
      claim: 'Counter-evidence example is receipt-backed',
      factType: 'market.snapshot',
    }
    const packet = {
      ...validWalletRepeatPacket,
      counterEvidence: [counterEvidence],
    }
    const input = createPacketWriterInput(packet, publishWalletRepeatDecision)
    const row = toPacketBackedPublishedRow(input, validOutput)

    expect(row.evidence_refs).toHaveLength(validWalletRepeatPacket.facts.length + 1)
    expect(row.evidence_refs.at(-1)).toMatchObject({
      factId: 'fact:counter:1',
      source: 'polymarket',
      sourceId: 'trade-1',
    })
  })
})
