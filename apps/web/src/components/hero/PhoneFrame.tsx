'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { type TabId } from './TabCard'

interface PhoneFrameProps {
  activeTab: TabId
}

const GOLD = '#e8c547'
const GREEN = '#34c77b'
const RED = '#f4584e'
const HI = '#ede8d5'
const MID = '#6b6850'
const LO = '#35342a'
const BG2 = '#141410'
const BG3 = '#1a1a15'
const BORDER = 'rgba(255,255,255,0.08)'

const mono = { fontFamily: "'SF Mono','Fira Code','JetBrains Mono',monospace" }

function FeedScreen() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: BORDER }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: 2, color: MID, textTransform: 'uppercase' }}>Feed</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          <span style={{ ...mono, fontSize: 7, color: HI }}>7xKp...m3Qr</span>
        </div>
      </div>

      {/* Feed cards */}
      <div className="flex-1 overflow-hidden px-3 py-2 space-y-2">
        {/* Narrative card 1 */}
        <div className="rounded-lg p-2.5" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1 h-1 rounded-full" style={{ background: RED }} />
            <span style={{ ...mono, fontSize: 7, letterSpacing: 1.5, color: RED, textTransform: 'uppercase' }}>Breaking</span>
            <span style={{ ...mono, fontSize: 7, color: MID, marginLeft: 'auto' }}>2m</span>
          </div>
          <p style={{ fontSize: 10, fontWeight: 600, color: HI, lineHeight: 1.35, marginBottom: 4 }}>
            Iran deal collapses — Polymarket YES crashes from 62c to 31c in 40 min
          </p>
          <p style={{ fontSize: 8, color: MID, lineHeight: 1.4 }}>
            Three whale wallets dumped $2.4M in YES shares. Oil futures spiking.
          </p>
          <div className="flex gap-1.5 mt-2">
            <span className="rounded px-1.5 py-0.5" style={{ ...mono, fontSize: 7, background: 'rgba(232,197,71,0.08)', color: GOLD, border: `1px solid rgba(232,197,71,0.15)` }}>Geopolitics</span>
            <span className="rounded px-1.5 py-0.5" style={{ ...mono, fontSize: 7, background: 'rgba(244,88,78,0.08)', color: RED, border: `1px solid rgba(244,88,78,0.15)` }}>High Impact</span>
          </div>
        </div>

        {/* Narrative card 2 */}
        <div className="rounded-lg p-2.5" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1 h-1 rounded-full" style={{ background: GREEN }} />
            <span style={{ ...mono, fontSize: 7, letterSpacing: 1.5, color: GREEN, textTransform: 'uppercase' }}>Signal</span>
            <span style={{ ...mono, fontSize: 7, color: MID, marginLeft: 'auto' }}>18m</span>
          </div>
          <p style={{ fontSize: 10, fontWeight: 600, color: HI, lineHeight: 1.35, marginBottom: 4 }}>
            SOL whale accumulation — $8.2M moved from Kraken in 2h
          </p>
          <p style={{ fontSize: 8, color: MID, lineHeight: 1.4 }}>
            Same wallet pattern as pre-Jupiter airdrop. 4 wallets, all funded from same source.
          </p>
        </div>

        {/* Narrative card 3 */}
        <div className="rounded-lg p-2.5" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1 h-1 rounded-full" style={{ background: GOLD }} />
            <span style={{ ...mono, fontSize: 7, letterSpacing: 1.5, color: GOLD, textTransform: 'uppercase' }}>Narrative</span>
            <span style={{ ...mono, fontSize: 7, color: MID, marginLeft: 'auto' }}>1h</span>
          </div>
          <p style={{ fontSize: 10, fontWeight: 600, color: HI, lineHeight: 1.35 }}>
            Madrid UCL odds jumping — Vinicius confirmed fit, market moved +3%
          </p>
        </div>
      </div>
    </div>
  )
}

function PredictScreen() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: BORDER }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: 2, color: MID, textTransform: 'uppercase' }}>Predict</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          <span style={{ ...mono, fontSize: 7, color: HI }}>7xKp...m3Qr</span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 px-3 py-1.5">
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, letterSpacing: 1, background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.3)', color: GOLD }}>All</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, letterSpacing: 1, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>Geopolitics</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, letterSpacing: 1, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>EPL</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, letterSpacing: 1, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>UCL</span>
      </div>

      <div className="flex-1 overflow-hidden px-3 space-y-1.5">
        {/* Section: Geopolitics */}
        <div className="flex justify-between items-center py-1">
          <span style={{ ...mono, fontSize: 7, letterSpacing: 1.5, color: MID, textTransform: 'uppercase' }}>Geopolitics</span>
          <span style={{ ...mono, fontSize: 7, color: LO }}>8 markets</span>
        </div>

        {/* Geo card 1 */}
        <div className="rounded-lg p-2" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex items-start gap-2 mb-1.5">
            <span style={{ fontSize: 14 }}>🇮🇷</span>
            <span style={{ fontSize: 9, color: HI, lineHeight: 1.3 }}>US forces enter Iran by April 30?</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span style={{ ...mono, fontSize: 7, color: GREEN, width: 18 }}>YES</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: LO }}>
              <div className="h-full rounded-full" style={{ width: '62%', background: GREEN }} />
            </div>
            <span style={{ ...mono, fontSize: 7, color: RED, width: 18, textAlign: 'right' }}>NO</span>
          </div>
          <div className="flex justify-between">
            <span style={{ ...mono, fontSize: 7, fontWeight: 700, color: GREEN }}>62%</span>
            <span style={{ ...mono, fontSize: 7, color: MID }}>$14.3M wk</span>
            <span style={{ ...mono, fontSize: 7, fontWeight: 700, color: RED }}>38%</span>
          </div>
        </div>

        {/* Geo card 2 */}
        <div className="rounded-lg p-2" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex items-start gap-2 mb-1.5">
            <span style={{ fontSize: 14 }}>🇨🇳</span>
            <span style={{ fontSize: 9, color: HI, lineHeight: 1.3 }}>China invades Taiwan before 2027?</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span style={{ ...mono, fontSize: 7, color: GREEN, width: 18 }}>YES</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: LO }}>
              <div className="h-full rounded-full" style={{ width: '18%', background: RED }} />
            </div>
            <span style={{ ...mono, fontSize: 7, color: RED, width: 18, textAlign: 'right' }}>NO</span>
          </div>
          <div className="flex justify-between">
            <span style={{ ...mono, fontSize: 7, fontWeight: 700, color: GREEN }}>18%</span>
            <span style={{ ...mono, fontSize: 7, color: MID }}>$2.1M wk</span>
            <span style={{ ...mono, fontSize: 7, fontWeight: 700, color: RED }}>82%</span>
          </div>
        </div>

        {/* Section: UCL */}
        <div className="flex justify-between items-center py-1">
          <span style={{ ...mono, fontSize: 7, letterSpacing: 1.5, color: MID, textTransform: 'uppercase' }}>UCL Semi-final</span>
        </div>

        {/* Sport card */}
        <div className="rounded-lg p-2" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex justify-between mb-1">
            <span style={{ ...mono, fontSize: 6, color: MID, letterSpacing: 1 }}>UCL · Semi-final</span>
            <span style={{ ...mono, fontSize: 6, color: LO }}>Apr 7 · 21:00</span>
          </div>
          <div className="flex justify-between items-center mb-1.5">
            <span style={{ fontSize: 9, fontWeight: 700, color: HI }}>Real Madrid</span>
            <span style={{ ...mono, fontSize: 7, color: LO }}>vs</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: HI }}>Bayern</span>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 text-center rounded py-0.5" style={{ background: 'rgba(52,199,123,0.1)', border: '1px solid rgba(52,199,123,0.2)' }}>
              <div style={{ ...mono, fontSize: 7, color: MID }}>Madrid</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: GREEN }}>47%</div>
            </div>
            <div className="flex-1 text-center rounded py-0.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
              <div style={{ ...mono, fontSize: 7, color: MID }}>Draw</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: HI }}>24%</div>
            </div>
            <div className="flex-1 text-center rounded py-0.5" style={{ background: 'rgba(244,88,78,0.08)', border: '1px solid rgba(244,88,78,0.15)' }}>
              <div style={{ ...mono, fontSize: 7, color: MID }}>Bayern</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: RED }}>29%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TradeScreen() {
  const markets = [
    { sym: 'BTC', sub: 'PERP · 50x', price: '$67,842', change: '+2.4%', up: true },
    { sym: 'ETH', sub: 'PERP · 50x', price: '$3,291', change: '+1.8%', up: true },
    { sym: 'SOL', sub: 'PERP · 20x', price: '$142.30', change: '+5.1%', up: true },
    { sym: 'DOGE', sub: 'PERP · 20x', price: '$0.1482', change: '-1.2%', up: false },
    { sym: 'WIF', sub: 'PERP · 10x', price: '$2.34', change: '+12.7%', up: true },
    { sym: 'BONK', sub: 'PERP · 10x', price: '$0.0000234', change: '-3.1%', up: false },
    { sym: 'JUP', sub: 'PERP · 10x', price: '$1.12', change: '+4.2%', up: true },
    { sym: 'SUI', sub: 'PERP · 20x', price: '$1.84', change: '+6.3%', up: true },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ border: `1px solid ${GOLD}` }}>
            <span style={{ fontSize: 8, color: HI }}>B</span>
          </div>
          <span style={{ ...mono, fontSize: 9, letterSpacing: 2, color: MID, textTransform: 'uppercase' }}>Trade</span>
        </div>
        <span className="rounded px-1.5 py-0.5" style={{ ...mono, fontSize: 7, color: GOLD, background: 'rgba(232,197,71,0.06)', border: '1px solid rgba(232,197,71,0.18)' }}>Connect</span>
      </div>

      {/* Category pills */}
      <div className="flex gap-1 px-3 py-1.5">
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.3)', color: GOLD }}>All</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>Memes</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>L1</span>
        <span className="rounded px-2 py-0.5" style={{ ...mono, fontSize: 7, background: BG2, border: `1px solid ${BORDER}`, color: MID }}>DeFi</span>
      </div>

      {/* Table header */}
      <div className="flex px-3 py-1 border-b" style={{ borderColor: BORDER }}>
        <span style={{ ...mono, fontSize: 7, letterSpacing: 1, color: LO, flex: 1, textTransform: 'uppercase' }}>Market</span>
        <span style={{ ...mono, fontSize: 7, letterSpacing: 1, color: LO, width: 52, textAlign: 'right', textTransform: 'uppercase' }}>Price</span>
        <span style={{ ...mono, fontSize: 7, letterSpacing: 1, color: LO, width: 36, textAlign: 'right', textTransform: 'uppercase' }}>24h</span>
      </div>

      {/* Market rows */}
      <div className="flex-1 overflow-hidden">
        {markets.map((m) => (
          <div key={m.sym} className="flex items-center px-3 py-1 border-b" style={{ borderColor: 'rgba(48,47,32,0.35)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: HI }}>{m.sym}</div>
              <div style={{ ...mono, fontSize: 6, color: LO, letterSpacing: 0.5 }}>{m.sub}</div>
            </div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 600, color: HI, width: 52, textAlign: 'right' }}>{m.price}</div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 600, color: m.up ? GREEN : RED, width: 36, textAlign: 'right' }}>{m.change}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SwapScreen() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: BORDER }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: 2, color: MID, textTransform: 'uppercase' }}>Swap</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          <span style={{ ...mono, fontSize: 7, color: HI }}>7xKp...m3Qr</span>
        </div>
      </div>

      <div className="flex-1 px-3 py-3 flex flex-col gap-2">
        {/* From */}
        <div className="rounded-lg p-3" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex justify-between mb-2">
            <span style={{ ...mono, fontSize: 7, color: MID, textTransform: 'uppercase', letterSpacing: 1 }}>You pay</span>
            <span style={{ ...mono, fontSize: 7, color: LO }}>Balance: 24.8 SOL</span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <span style={{ fontSize: 20, fontWeight: 700, color: HI }}>10</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: BG3, border: `1px solid ${BORDER}` }}>
              <div className="w-4 h-4 rounded-full" style={{ background: 'linear-gradient(135deg, #9945FF, #14F195)' }} />
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: HI }}>SOL</span>
            </div>
          </div>
          <div style={{ ...mono, fontSize: 8, color: MID, marginTop: 4 }}>~$1,423.00</div>
        </div>

        {/* Swap arrow */}
        <div className="flex justify-center -my-1 relative z-10">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: BG3, border: `1px solid ${BORDER}` }}>
            <span style={{ color: GOLD, fontSize: 12 }}>↓</span>
          </div>
        </div>

        {/* To */}
        <div className="rounded-lg p-3" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex justify-between mb-2">
            <span style={{ ...mono, fontSize: 7, color: MID, textTransform: 'uppercase', letterSpacing: 1 }}>You receive</span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <span style={{ fontSize: 20, fontWeight: 700, color: HI }}>92.4M</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: BG3, border: `1px solid ${BORDER}` }}>
              <div className="w-4 h-4 rounded-full" style={{ background: '#FF9900' }} />
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: HI }}>BONK</span>
            </div>
          </div>
        </div>

        {/* Route info */}
        <div className="rounded-lg p-2" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
          <div className="flex justify-between mb-1">
            <span style={{ ...mono, fontSize: 7, color: MID }}>Rate</span>
            <span style={{ ...mono, fontSize: 7, color: HI }}>1 SOL = 9.24M BONK</span>
          </div>
          <div className="flex justify-between mb-1">
            <span style={{ ...mono, fontSize: 7, color: MID }}>Price Impact</span>
            <span style={{ ...mono, fontSize: 7, color: GREEN }}>{'<'}0.01%</span>
          </div>
          <div className="flex justify-between">
            <span style={{ ...mono, fontSize: 7, color: MID }}>Route</span>
            <span style={{ ...mono, fontSize: 7, color: GOLD }}>Jupiter · 2 hops</span>
          </div>
        </div>

        {/* Swap button */}
        <button className="w-full rounded-lg py-2.5 mt-1" style={{ background: GOLD, color: '#393000', fontWeight: 700, fontSize: 11 }}>
          Swap
        </button>
      </div>
    </div>
  )
}

const SCREENS: Record<TabId, React.ReactNode> = {
  feed: <FeedScreen />,
  predict: <PredictScreen />,
  trade: <TradeScreen />,
  swap: <SwapScreen />,
}

const NAV_ICONS: Record<TabId, string> = {
  feed: 'dynamic_feed',
  predict: 'query_stats',
  trade: 'swap_horiz',
  swap: 'account_balance_wallet',
}

export default function PhoneFrame({ activeTab }: PhoneFrameProps) {
  return (
    <div
      className="phone-container relative z-30 rounded-[2.5rem] border-[8px] shadow-2xl shadow-black/80 flex flex-col overflow-hidden ring-1 ring-primary/20"
      style={{
        width: '260px',
        height: '520px',
        background: '#0f0f0c',
        borderColor: '#1a1a15',
      }}
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 rounded-b-xl z-40" style={{ background: '#1a1a15' }} />

      {/* Status bar */}
      <div className="flex justify-between items-center px-5 pt-2 pb-0.5 relative z-10" style={{ height: 28 }}>
        <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: HI }}>9:41</span>
        <div className="flex items-center gap-1">
          <div className="flex gap-px">
            {[3, 5, 7, 9].map((h) => (
              <div key={h} className="rounded-sm" style={{ width: 2, height: h, background: HI }} />
            ))}
          </div>
          <svg width="10" height="6" viewBox="0 0 10 6"><rect x="0.5" y="0.5" width="7" height="5" rx="1" stroke={HI} strokeWidth="0.7" fill="none" /><rect x="8" y="1.5" width="1.5" height="3" rx="0.5" fill={HI} /><rect x="1.5" y="1.5" width="5" height="3" rx="0.5" fill={GREEN} /></svg>
        </div>
      </div>

      {/* Screen Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {SCREENS[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="flex justify-around items-start px-3 pt-2 pb-3 border-t" style={{ borderColor: BORDER, background: 'rgba(15,15,12,0.95)' }}>
        {(Object.keys(NAV_ICONS) as TabId[]).map((tab) => (
          <div key={tab} className="flex flex-col items-center gap-0.5">
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 18,
                color: activeTab === tab ? GOLD : LO,
                fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                transition: 'color 0.2s',
              }}
            >
              {NAV_ICONS[tab]}
            </span>
            {activeTab === tab && (
              <div className="w-1 h-1 rounded-full" style={{ background: GOLD, boxShadow: `0 0 6px ${GOLD}` }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
