'use client'

import { useState, useRef, useEffect } from 'react'
import PhoneFrame from '@/components/hero/PhoneFrame'
import { FeaturePanel, FEATURES } from './FeaturePanel'
import { type TabId } from '@/components/hero/TabCard'

export function FeaturesScroll() {
  const [activeIdx, setActiveIdx] = useState(0)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null])

  useEffect(() => {
    const observers = panelRefs.current.map((el, idx) => {
      if (!el) return null
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIdx(idx)
        },
        { threshold: 0.5 }
      )
      obs.observe(el)
      return obs
    })
    return () => { observers.forEach(o => o?.disconnect()) }
  }, [])

  const activeTab = FEATURES[activeIdx].id as TabId

  return (
    <section className="border-t border-outline-variant flex">

      {/* Sticky phone column — desktop only */}
      <div
        className="hidden lg:flex sticky top-0 h-screen w-2/5 shrink-0 items-center justify-center"
        style={{ alignSelf: 'flex-start' }}
      >
        <PhoneFrame activeTab={activeTab} />
      </div>

      {/* Scroll panels column */}
      <div className="flex-1">
        {FEATURES.map((feature, i) => (
          <div
            key={feature.id}
            ref={el => { panelRefs.current[i] = el }}
            className="h-screen flex items-center"
          >
            <FeaturePanel feature={feature} />
          </div>
        ))}
      </div>

    </section>
  )
}
