import { PublicKey } from '@solana/web3.js'
import Decimal from 'decimal.js'
import { MeteoraClientError } from './errors.js'
import type { MeteoraStrategy } from './types.js'

export const SOLANA_U64_MAX = 18_446_744_073_709_551_615n

export function assertPublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value)
  } catch (cause) {
    throw new MeteoraClientError('INVALID_ADDRESS', `${field} is not a valid Solana address`, null, cause)
  }
}

export function assertAtomicAmount(value: string, field: string): string {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new MeteoraClientError('AMOUNT_FORMAT_INVALID', `${field} must be a non-negative atomic integer string`)
  }
  if (BigInt(value) > SOLANA_U64_MAX) {
    throw new MeteoraClientError('AMOUNT_OVERFLOW', `${field} exceeds Solana's u64 token amount limit`)
  }
  return value
}

export function assertPositiveAtomicAmount(value: string, field: string): string {
  const atomic = assertAtomicAmount(value, field)
  if (atomic === '0') {
    throw new MeteoraClientError('AMOUNT_NOT_POSITIVE', `${field} must be greater than zero`)
  }
  return atomic
}

export function decimalToAtomicAmount(value: string, decimals: number, field: string): string {
  if (value.length === 0) {
    throw new MeteoraClientError('EMPTY_AMOUNT', `${field} is required`)
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new MeteoraClientError('INVALID_ARGUMENT', `${field} token decimals must be an integer between 0 and 18`)
  }
  if (!/^(0|[1-9]\d*)(?:\.(\d+))?$/.test(value)) {
    throw new MeteoraClientError(
      'AMOUNT_FORMAT_INVALID',
      `${field} must be a plain unsigned decimal without whitespace or scientific notation`,
    )
  }

  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > decimals) {
    throw new MeteoraClientError(
      'AMOUNT_PRECISION_EXCEEDED',
      `${field} supports at most ${decimals} decimal places`,
    )
  }

  const atomic = BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (atomic === 0n) {
    throw new MeteoraClientError('AMOUNT_NOT_POSITIVE', `${field} must be greater than zero`)
  }
  if (atomic > SOLANA_U64_MAX) {
    throw new MeteoraClientError('AMOUNT_OVERFLOW', `${field} exceeds Solana's u64 token amount limit`)
  }
  return atomic.toString()
}

export function assertBps(value: number, field: string, min = 0, max = 10_000): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new MeteoraClientError('INVALID_ARGUMENT', `${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

export function assertFinitePositiveDecimal(value: string, field: string): Decimal {
  if (value.length === 0) {
    throw new MeteoraClientError('EMPTY_AMOUNT', `${field} is required`)
  }
  if (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new MeteoraClientError(
      'AMOUNT_FORMAT_INVALID',
      `${field} must be a plain unsigned decimal without whitespace or scientific notation`,
    )
  }
  try {
    const decimal = new Decimal(value)
    if (!decimal.isFinite()) throw new Error('not finite')
    if (decimal.lte(0)) {
      throw new MeteoraClientError('AMOUNT_NOT_POSITIVE', `${field} must be greater than zero`)
    }
    return decimal
  } catch (cause) {
    if (cause instanceof MeteoraClientError) throw cause
    throw new MeteoraClientError('INVALID_ARGUMENT', `${field} must be a positive decimal string`, null, cause)
  }
}

export function assertBinRange(minBinId: number, maxBinId: number): void {
  if (!Number.isInteger(minBinId) || !Number.isInteger(maxBinId) || minBinId > maxBinId) {
    throw new MeteoraClientError('INVALID_ARGUMENT', 'minBinId and maxBinId must define a valid integer range')
  }
}

export function rangeForBinCount(activeBinId: number, binCount: number): { minBinId: number; maxBinId: number } {
  if (!Number.isInteger(activeBinId) || !Number.isInteger(binCount) || binCount < 1) {
    throw new MeteoraClientError('INVALID_ARGUMENT', 'activeBinId and binCount must be valid integers')
  }

  const binsBelow = Math.floor((binCount - 1) / 2)
  const binsAbove = binCount - 1 - binsBelow
  return {
    minBinId: activeBinId - binsBelow,
    maxBinId: activeBinId + binsAbove,
  }
}

export function strategyToSdkValue(strategy: MeteoraStrategy): 0 | 1 | 2 {
  if (strategy === 'spot') return 0
  if (strategy === 'curve') return 1
  if (strategy === 'bid_ask') return 2
  throw new MeteoraClientError('INVALID_ARGUMENT', `Unsupported Meteora strategy: ${String(strategy)}`)
}
