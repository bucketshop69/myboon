import type { HyperliquidCandle } from '../client.js'
import type { HyperliquidWalletQualityProfile } from '../wallet-profile.js'

export const DAY_MS = 24 * 3_600_000
export const HOUR_MS = 3_600_000

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${round(value / 1_000_000_000, 1)}B`
  if (abs >= 1_000_000) return `$${round(value / 1_000_000, 1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

export function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function bps(value: number): number {
  return round(value * 10_000, 3)
}

export function compactWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

export function walletLabel(profile: HyperliquidWalletQualityProfile, wallet: string): string {
  return profile.label ?? compactWallet(wallet)
}

export function candleVolumeUsd(candle: HyperliquidCandle): number {
  return candle.volume * candle.close
}
