/**
 * Shared formatting utilities used across Feed, Predict, and Trade screens.
 */

export function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
