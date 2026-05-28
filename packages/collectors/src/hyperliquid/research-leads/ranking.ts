import type {
  HyperliquidResearchLead,
  HyperliquidResearchLeadLane,
  HyperliquidResearchLeadStatus,
} from './types.js'

const EMPTY_SUMMARY: Record<HyperliquidResearchLeadLane, { research: number, watch: number, ignore: number }> = {
  volume_spike: { research: 0, watch: 0, ignore: 0 },
  funding_pressure: { research: 0, watch: 0, ignore: 0 },
  price_momentum: { research: 0, watch: 0, ignore: 0 },
  oi_expansion: { research: 0, watch: 0, ignore: 0 },
  price_oi_divergence: { research: 0, watch: 0, ignore: 0 },
  watchlist_wallet: { research: 0, watch: 0, ignore: 0 },
  cross_signal: { research: 0, watch: 0, ignore: 0 },
}

export function rankHyperliquidResearchLeads(leads: HyperliquidResearchLead[]): HyperliquidResearchLead[] {
  const statusRank: Record<HyperliquidResearchLeadStatus, number> = {
    research: 0,
    watch: 1,
    ignore: 2,
  }
  return [...leads].sort((a, b) => {
    return statusRank[a.status] - statusRank[b.status]
      || b.priority - a.priority
      || a.asset.localeCompare(b.asset)
      || a.lane.localeCompare(b.lane)
  })
}

export function summarizeHyperliquidResearchLeads(
  leads: HyperliquidResearchLead[]
): Record<HyperliquidResearchLeadLane, { research: number, watch: number, ignore: number }> {
  const summary = structuredClone(EMPTY_SUMMARY)
  for (const lead of leads) {
    summary[lead.lane][lead.status] += 1
  }
  return summary
}
