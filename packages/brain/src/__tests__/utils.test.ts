import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../minimax.js'
import { isSportsNarrative } from '../publisher-llm.js'
import type { AnthropicMessage } from '../minimax.js'

// --- estimateTokens ---

describe('estimateTokens', () => {
  it('returns 0 for empty messages and empty system prompt', () => {
    expect(estimateTokens([], '')).toBe(0)
  })

  it('counts system prompt chars at 4 chars per token', () => {
    const systemPrompt = 'a'.repeat(400)
    // 400 chars / 4 = 100 tokens
    expect(estimateTokens([], systemPrompt)).toBe(100)
  })

  it('counts string message content', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'a'.repeat(200) },
      { role: 'assistant', content: 'b'.repeat(200) },
    ]
    // 400 chars / 4 = 100 tokens
    expect(estimateTokens(messages, '')).toBe(100)
  })

  it('counts text content blocks', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a'.repeat(400) },
        ],
      },
    ]
    // 400 / 4 = 100
    expect(estimateTokens(messages, '')).toBe(100)
  })

  it('counts tool_result content blocks', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'abc', content: 'x'.repeat(800) },
        ],
      },
    ]
    // 800 / 4 = 200
    expect(estimateTokens(messages, '')).toBe(200)
  })

  it('adds system prompt and message chars together', () => {
    const systemPrompt = 'a'.repeat(400)
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'b'.repeat(400) },
    ]
    // (400 + 400) / 4 = 200
    expect(estimateTokens(messages, systemPrompt)).toBe(200)
  })

  it('uses Math.ceil for fractional tokens', () => {
    // 5 chars → Math.ceil(5/4) = 2
    expect(estimateTokens([], 'hello')).toBe(2)
  })
})

// --- isSportsNarrative ---

describe('isSportsNarrative', () => {
  it('detects Champions League', () => {
    expect(isSportsNarrative('Manchester City vs Arsenal Champions League')).toBe(true)
  })

  it('detects EPL', () => {
    expect(isSportsNarrative('EPL title race')).toBe(true)
  })

  it('detects CS2', () => {
    expect(isSportsNarrative('CS2 major semifinal')).toBe(true)
  })

  it('does not flag geopolitics', () => {
    expect(isSportsNarrative('Iran nuclear ceasefire odds')).toBe(false)
  })

  it('does not flag crypto', () => {
    expect(isSportsNarrative('Bitcoin ETF approval')).toBe(false)
  })

  it('does not flag macro', () => {
    expect(isSportsNarrative('Federal Reserve rate decision')).toBe(false)
  })
})
