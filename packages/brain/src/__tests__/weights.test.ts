import { describe, it, expect } from 'vitest'

// Inline weight math for signal scoring tests.

function marketSurgeWeight(volume24h: number): number {
  return Math.min(Math.floor(volume24h / 1_000_000) + 5, 10)
}

function eventTrendingWeight(totalVolume24h: number): number {
  return Math.min(Math.floor(totalVolume24h / 5_000_000) + 4, 10)
}

describe('marketSurgeWeight', () => {
  it('returns 5 for 0 volume', () => {
    expect(marketSurgeWeight(0)).toBe(5)
  })

  it('returns 6 for 1_000_000 volume', () => {
    expect(marketSurgeWeight(1_000_000)).toBe(6)
  })

  it('returns 10 for 5_000_000 volume', () => {
    expect(marketSurgeWeight(5_000_000)).toBe(10)
  })

  it('caps at 10 for 10_000_000 volume', () => {
    expect(marketSurgeWeight(10_000_000)).toBe(10)
  })
})

describe('eventTrendingWeight', () => {
  it('returns 4 for 0 volume', () => {
    expect(eventTrendingWeight(0)).toBe(4)
  })

  it('returns 5 for 5_000_000 volume', () => {
    expect(eventTrendingWeight(5_000_000)).toBe(5)
  })

  it('caps at 10 for 30_000_000 volume', () => {
    expect(eventTrendingWeight(30_000_000)).toBe(10)
  })
})
