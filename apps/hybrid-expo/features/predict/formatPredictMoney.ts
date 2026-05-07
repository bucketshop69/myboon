export function truncateUsd(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const factor = 10 ** decimals;
  const sign = value < 0 ? '-' : '';
  const truncated = Math.trunc(Math.abs(value) * factor) / factor;
  return `${sign}$${truncated.toFixed(decimals)}`;
}

export function truncateSignedUsd(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1 / 10 ** decimals) return '$0.00';
  return `${value > 0 ? '+' : '-'}${truncateUsd(Math.abs(value), decimals)}`;
}

export function portfolioPositionCost(position: { avgPrice?: number | null; size?: number | null }): number {
  return (position.avgPrice ?? 0) * (position.size ?? 0);
}
