export function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toFixed(0)}`
}

export function annualizedFundingPct(fundingRate: number): number {
  // Pacific funding rate is per-period (typically per 8h).
  // Annualize: rate * 3 periods/day * 365 days * 100 to get %
  return parseFloat((fundingRate * 3 * 365 * 100).toFixed(2))
}

/** Returns 'long' if price dropped (longs liquidated) or 'short' if price rose */
export function sideLiquidated(priceMovePercent: number): 'long' | 'short' {
  return priceMovePercent < 0 ? 'long' : 'short'
}
