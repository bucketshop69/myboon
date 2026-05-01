'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import PhoneFrame from '@/components/hero/PhoneFrame'
import { type TabId } from '@/components/hero/TabCard'

interface Feature {
  id: TabId
  headline: string
  sub: string
  accentClass: string
}

const FEATURES: Feature[] = [
  {
    id: 'feed',
    headline: 'See what\u2019s moving.',
    sub: 'AI watches prediction markets, whale bets, and on-chain signals around the clock. You just open the app.',
    accentClass: 'text-primary',
  },
  {
    id: 'predict',
    headline: 'Bet on it.',
    sub: 'Polymarket odds on geopolitics, crypto, and live sports \u2014 tap to trade from the story that told you about it.',
    accentClass: 'text-tertiary',
  },
  {
    id: 'trade',
    headline: 'Trade it.',
    sub: 'Perpetuals on Solana via Pacific. Up to 50\u00d7 leverage. One tap from feed to position.',
    accentClass: 'text-primary',
  },
]

export function FeaturesSection() {
  const [activeIdx, setActiveIdx] = useState(0)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])

  useEffect(() => {
    const observers = panelRefs.current.map((el, idx) => {
      if (!el) return null
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIdx(idx)
        },
        { threshold: 0.5 },
      )
      obs.observe(el)
      return obs
    })
    return () => {
      observers.forEach((o) => o?.disconnect())
    }
  }, [])

  const activeTab = FEATURES[activeIdx].id

  return (
    <section className="relative border-t border-outline-variant/40">
      {/* Section header */}
      <div className="max-w-7xl mx-auto px-6 lg:px-16 pt-24 pb-8">
        <p className="font-headline text-xs tracking-[0.25em] uppercase text-on-surface-variant/50">
          How it works
        </p>
      </div>

      <div className="flex max-w-7xl mx-auto">
        {/* Sticky phone — desktop only */}
        <div
          className="hidden lg:flex sticky top-0 h-screen w-1/2 shrink-0 items-center justify-center"
          style={{ alignSelf: 'flex-start' }}
        >
          <div className="perspective-container">
            <PhoneFrame activeTab={activeTab} />
          </div>
        </div>

        {/* Scroll panels */}
        <div className="flex-1 lg:w-1/2">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.id}
              ref={(el) => {
                panelRefs.current[i] = el
              }}
              className="h-screen flex items-center"
            >
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-20%' }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="px-6 lg:px-16 max-w-lg"
              >
                <p
                  className={`font-headline text-xs tracking-[0.2em] uppercase mb-4 ${feature.accentClass}`}
                >
                  {feature.id}
                </p>
                <h2 className="font-headline font-bold text-3xl lg:text-4xl text-on-surface mb-5 leading-tight">
                  {feature.headline}
                </h2>
                <p className="text-on-surface-variant text-base leading-relaxed max-w-sm">
                  {feature.sub}
                </p>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
