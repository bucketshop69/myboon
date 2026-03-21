'use client'

export type TabId = 'feed' | 'predict' | 'trade' | 'swap'

interface TabCardProps {
  tab: TabId
  hoveredCard: TabId | null
  onHover: (tab: TabId) => void
  onLeave: () => void
}

const cardConfig = {
  feed: {
    animClass: 'card-feed',
    position: 'absolute top-[5%] left-[5%] lg:left-[15%]',
    icon: 'sensors',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    label: 'FEED',
    description: 'Narrative intelligence before the market moves.',
    mini: (
      <div className="h-8 w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 100 20">
          <path
            d="M0 10 Q 25 2, 50 10 T 100 10"
            fill="none"
            stroke="#c7b770"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    ),
  },
  predict: {
    animClass: 'card-predict',
    position: 'absolute top-[10%] right-[5%] lg:right-[15%]',
    icon: 'analytics',
    iconBg: 'bg-tertiary/10',
    iconColor: 'text-tertiary',
    label: 'PREDICT',
    description: 'Polymarket odds at a glance.',
    mini: (
      <div>
        <div className="flex space-x-1 h-2">
          <div className="flex-1 bg-tertiary rounded-full"></div>
          <div className="w-1/3 bg-surface-container rounded-full"></div>
        </div>
        <div className="flex justify-between mt-1 text-[8px] font-headline uppercase tracking-widest">
          <span className="text-tertiary">YES 74%</span>
          <span className="text-on-surface-variant">NO 26%</span>
        </div>
      </div>
    ),
  },
  trade: {
    animClass: 'card-trade',
    position: 'absolute bottom-[15%] left-[2%] lg:left-[10%]',
    icon: 'trending_up',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    label: 'TRADE',
    description: 'Perps, one tap. High leverage.',
    mini: (
      <div className="flex justify-between items-end">
        <div className="text-lg font-headline font-bold text-on-surface">$2.4k</div>
        <div className="px-1.5 py-0.5 bg-tertiary/10 text-tertiary text-[9px] font-bold rounded">
          +12.4%
        </div>
      </div>
    ),
  },
  swap: {
    animClass: 'card-swap',
    position: 'absolute bottom-[5%] right-[2%] lg:right-[10%]',
    icon: 'currency_exchange',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    label: 'SWAP',
    description: 'Jupiter liquidity, zero friction.',
    mini: (
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          <div className="w-6 h-6 rounded-full bg-[#14140d] border border-outline-variant/30 flex items-center justify-center text-[8px] font-bold">
            SOL
          </div>
          <div className="w-6 h-6 rounded-full bg-[#2b2a23] border border-outline-variant/30 flex items-center justify-center text-[8px] font-bold">
            BONK
          </div>
        </div>
        <span className="material-symbols-outlined text-primary/40 text-sm">sync</span>
      </div>
    ),
  },
}

export default function TabCard({ tab, hoveredCard, onHover, onLeave }: TabCardProps) {
  const config = cardConfig[tab]

  const isActive = hoveredCard === tab
  const isDimmed = hoveredCard !== null && hoveredCard !== tab

  const cardStyle: React.CSSProperties & { scale?: string } = {
    opacity: isDimmed ? 0.3 : 1,
    filter: isDimmed ? 'blur(2px)' : 'blur(0px)',
    borderColor: isActive ? '#c7b770' : undefined,
    zIndex: isActive ? 50 : undefined,
    scale: isActive ? '1.07' : undefined,
  }

  return (
    <div
      className={[
        config.animClass,
        config.position,
        'card-float',
        'w-44 p-3',
        'bg-surface-container-high/90 backdrop-blur-xl',
        'border border-outline-variant/30 rounded-xl',
        'pointer-events-auto cursor-pointer shadow-xl',
      ].join(' ')}
      style={cardStyle}
      onMouseEnter={() => onHover(tab)}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center space-x-3 mb-3">
        <div className={`w-8 h-8 rounded ${config.iconBg} flex items-center justify-center`}>
          <span className={`material-symbols-outlined ${config.iconColor} text-lg`}>
            {config.icon}
          </span>
        </div>
        <span className="font-headline font-bold text-xs tracking-tight">{config.label}</span>
      </div>
      <p className="text-[11px] text-on-surface-variant mb-3 leading-tight">
        {config.description}
      </p>
      {config.mini}
    </div>
  )
}
