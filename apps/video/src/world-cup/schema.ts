export interface WorldCupMatchCardProps {
  fixture: {
    id: string
    kickoffAt: string
    homeTeam: string
    awayTeam: string
    stage: string
  }
  market: {
    slug: string
    question: string
    sourceUrl: string
    observedAt: string
    odds: Array<{
      label: string
      probability: number
    }>
    found: boolean
    note?: string
  }
  assets: {
    homeFlag: string
    awayFlag: string
    fallbackStyle: 'country_flag'
  }
  creative: {
    headline: string
    storyAngle: string
    oddsLine: string
    moment: 'pre_match'
  }
}

export const defaultWorldCupMatchCardProps: WorldCupMatchCardProps = {
  fixture: {
    id: '2026-06-17-portugal-dr-congo',
    kickoffAt: '2026-06-17T22:30:00+05:30',
    homeTeam: 'Portugal',
    awayTeam: 'DR Congo',
    stage: 'Group K',
  },
  market: {
    slug: '2026-06-17-portugal-dr-congo',
    question: 'Portugal vs DR Congo',
    sourceUrl: 'https://polymarket.com',
    observedAt: '2026-06-17T12:00:00.000Z',
    found: false,
    odds: [
      { label: 'Portugal', probability: 0.5 },
      { label: 'Draw', probability: 0.25 },
      { label: 'DR Congo', probability: 0.25 },
    ],
    note: 'Trial fallback odds.',
  },
  assets: {
    homeFlag: '🇵🇹',
    awayFlag: '🇨🇩',
    fallbackStyle: 'country_flag',
  },
  creative: {
    headline: 'Portugal vs DR Congo',
    storyAngle: 'Portugal enters as the market favorite, but the contrarian lane is DR Congo at 25%.',
    oddsLine: 'Portugal 50% · Draw 25% · DR Congo 25%',
    moment: 'pre_match',
  },
}
