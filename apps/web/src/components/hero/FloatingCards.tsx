'use client'

import TabCard, { type TabId } from './TabCard'

interface FloatingCardsProps {
  hoveredCard: TabId | null
  onHover: (tab: TabId) => void
  onLeave: () => void
}

export default function FloatingCards({ hoveredCard, onHover, onLeave }: FloatingCardsProps) {
  return (
    <div className="cards-group absolute inset-0 z-40 pointer-events-none">
      <TabCard tab="feed" hoveredCard={hoveredCard} onHover={onHover} onLeave={onLeave} />
      <TabCard tab="predict" hoveredCard={hoveredCard} onHover={onHover} onLeave={onLeave} />
      <TabCard tab="trade" hoveredCard={hoveredCard} onHover={onHover} onLeave={onLeave} />
      <TabCard tab="swap" hoveredCard={hoveredCard} onHover={onHover} onLeave={onLeave} />
    </div>
  )
}
