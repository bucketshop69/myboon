'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Narrative {
  id: string
  content_small: string
  tags: string[]
  created_at: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.myboon.app'

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const FALLBACK: Narrative[] = [
  {
    id: '1',
    content_small:
      'Three whale wallets just placed $1.2M in YES on Iran nuclear deal — largest single-day flow this month. Odds shifted from 34c to 41c in under an hour.',
    tags: ['geopolitics'],
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: '2',
    content_small:
      'BTC funding rate flipped negative on Pacific while Polymarket "BTC above 90K by June" climbed to 67c. Perps positioning diverging from prediction market sentiment.',
    tags: ['crypto'],
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: '3',
    content_small:
      'Liverpool vs Real Madrid UCL semi-final — odds swung 12 points toward Liverpool after team news. Two tracked wallets added $340K in YES positions.',
    tags: ['ucl'],
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
]

export function LiveFeedSection() {
  const [narratives, setNarratives] = useState<Narrative[]>(FALLBACK)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/narratives?limit=4`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Narrative[]) => {
        if (data.length > 0) {
          setNarratives(data.slice(0, 4))
          setIsLive(true)
        }
      })
      .catch(() => {
        /* keep fallback */
      })
  }, [])

  return (
    <section className="relative border-t border-outline-variant/40 py-24">
      <div className="max-w-4xl mx-auto px-6 lg:px-16">
        {/* Section label */}
        <div className="flex items-center gap-3 mb-12">
          {isLive && (
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
          )}
          <p className="font-headline text-xs tracking-[0.25em] uppercase text-on-surface-variant/50">
            {isLive ? 'Live from myboon\u2019s feed' : 'From myboon\u2019s feed'}
          </p>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {narratives.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group rounded-xl p-5 border border-outline-variant/30 bg-surface-container-low/50 hover:border-outline-variant/60 transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-3">
                {n.tags?.[0] && (
                  <span className="text-[10px] font-headline tracking-widest uppercase text-primary/70">
                    {n.tags[0]}
                  </span>
                )}
                <span className="text-[10px] font-headline text-on-surface-variant/30 ml-auto">
                  {timeAgo(n.created_at)}
                </span>
              </div>
              <p className="text-sm text-on-surface leading-relaxed">
                {n.content_small}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
