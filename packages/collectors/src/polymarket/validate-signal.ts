import type { Signal } from './signal-types'

export function validateSignal(signal: Signal): void {
  if (signal.type !== 'MARKET_DISCOVERED' && !signal.slug) {
    throw new Error(
      `[collector] Signal ${signal.type} for topic "${signal.topic}" has no slug — skipping`
    )
  }
}
