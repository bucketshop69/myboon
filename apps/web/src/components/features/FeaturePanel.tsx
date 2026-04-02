'use client'

import { motion } from 'framer-motion'
import { type TabId } from '@/components/hero/TabCard'

export interface FeatureDef {
  id: TabId
  icon: string
  headline: string
  body: string
  accentClass: string
}

export const FEATURES: FeatureDef[] = [
  {
    id: 'feed',
    icon: 'sensors',
    headline: 'The feed the market reads first.',
    body: 'Narrative intelligence synthesized from Polymarket signals, on-chain whale flow, and a multi-agent brain — delivered before the market prices it in.',
    accentClass: 'text-primary',
  },
  {
    id: 'predict',
    icon: 'bar_chart',
    headline: 'Polymarket odds, without the noise.',
    body: 'Live market probabilities surfaced by topic, not by recency. Know what\'s moving before you see it in the price.',
    accentClass: 'text-tertiary',
  },
  {
    id: 'trade',
    icon: 'trending_up',
    headline: 'Perps, one tap.',
    body: 'Pacific Protocol perpetuals on Solana. Up to 10× leverage. Execution from the same app you use to read the narrative.',
    accentClass: 'text-primary',
  },
  {
    id: 'swap',
    icon: 'swap_horiz',
    headline: 'Jupiter liquidity. No routing fees.',
    body: 'Best execution across all Solana DEX routes, surfaced inline. Swap the token the narrative is about, from the card that told you about it.',
    accentClass: 'text-primary',
  },
]

export function FeaturePanel({ feature }: { feature: FeatureDef }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-20%' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="px-8 lg:px-16 max-w-lg"
    >
      <div className="mb-5 w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/40">
        <span className={`material-symbols-outlined ${feature.accentClass}`}>{feature.icon}</span>
      </div>
      <p className={`font-headline text-xs tracking-widest uppercase mb-3 ${feature.accentClass}`}>
        {feature.id}
      </p>
      <h2 className="font-headline font-bold text-2xl lg:text-3xl text-on-surface mb-5 leading-tight">
        {feature.headline}
      </h2>
      <p className="text-on-surface-variant text-base leading-relaxed">
        {feature.body}
      </p>
    </motion.div>
  )
}
