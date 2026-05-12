'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { HomeCanvasJourneyPhone } from './HomeCanvasJourneyPhone'

interface Feature {
  id: string
  eyebrow: string
  headline: string
  sub: string
  accentClass: string
}

const FEATURES: Feature[] = [
  {
    id: 'feed',
    eyebrow: 'Feed',
    headline: 'See what is moving.',
    sub: 'myboon starts with a live stream of narratives, news, markets, and on-chain signals.',
    accentClass: 'text-primary',
  },
  {
    id: 'full-feed',
    eyebrow: 'Open full feed',
    headline: 'Scroll the full feed.',
    sub: 'The first tap expands the Home preview into the dense feed list.',
    accentClass: 'text-tertiary',
  },
  {
    id: 'feed-details',
    eyebrow: 'Show details',
    headline: 'Open the signal.',
    sub: 'Then a selected feed item opens into a detail sheet with market context attached.',
    accentClass: 'text-primary',
  },
  {
    id: 'markets',
    eyebrow: 'Markets',
    headline: 'Take action on your signals.',
    sub: 'The same Home canvas brings prediction markets and perps under the narrative.',
    accentClass: 'text-primary-container',
  },
  {
    id: 'action-markets',
    eyebrow: 'Action surface',
    headline: 'Choose the market.',
    sub: 'A tap opens the full market list with sports, politics, macro, and crypto lanes.',
    accentClass: 'text-tertiary',
  },
  {
    id: 'wallet',
    eyebrow: 'Wallet',
    headline: 'Scroll into ownership.',
    sub: 'After action, Wallet shows balances, positions, and what the user owns.',
    accentClass: 'text-primary',
  },
]

export function FeaturesSection() {
  const [activeIdx, setActiveIdx] = useState(0)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])

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

  return (
    <section className="relative border-t border-outline-variant/40">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 pt-24 pb-8">
        <p className="font-headline text-xs tracking-[0.25em] uppercase text-on-surface-variant/50">
          How it works
        </p>
      </div>

      <div className="flex max-w-7xl mx-auto">
        <div
          className="hidden lg:flex sticky top-0 h-screen w-1/2 shrink-0 items-center justify-center"
          style={{ alignSelf: 'flex-start' }}
        >
          <div className="perspective-container">
            <HomeCanvasJourneyPhone activeIndex={activeIdx} />
          </div>
        </div>

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
                <p className={`font-headline text-xs tracking-[0.2em] uppercase mb-4 ${feature.accentClass}`}>
                  {feature.eyebrow}
                </p>
                <h2 className="font-headline font-bold text-3xl lg:text-4xl text-on-surface mb-5 leading-tight">
                  {feature.headline}
                </h2>
                <p className="text-on-surface-variant text-base leading-relaxed max-w-sm">
                  {feature.sub}
                </p>
                <div className="mt-8 flex gap-2">
                  {FEATURES.map((step, stepIndex) => (
                    <span
                      key={step.id}
                      className={stepIndex === activeIdx
                        ? 'h-1.5 w-8 rounded-full bg-primary-container'
                        : 'h-1.5 w-3 rounded-full bg-outline-variant/70'}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
