'use client'

import { type TabId } from './TabCard'

interface PhoneFrameProps {
  hoveredCard: TabId | null
}

const PRIMARY = '#e4d389'
const MUTED = '#cdc6b5'

export default function PhoneFrame({ hoveredCard }: PhoneFrameProps) {
  // Determine which screen to show: default to 'feed' when no hover
  const activeScreen: TabId = hoveredCard ?? 'feed'

  // Nav icon colors
  const navColor = (tab: TabId) => (activeScreen === tab ? PRIMARY : MUTED)

  return (
    <div
      className="phone-container relative z-30 bg-[#0f0e08] rounded-[2.5rem] border-[8px] border-surface-container-highest shadow-2xl shadow-black/80 flex flex-col overflow-hidden ring-1 ring-primary/20"
      style={{ width: '240px', height: '460px' }}
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-surface-container-highest rounded-b-2xl z-40" />

      {/* Screen Content Views */}
      <div className="flex-1 p-5 pt-10 space-y-4 overflow-hidden">

        {/* Feed View */}
        <div
          className="space-y-4"
          style={{ display: activeScreen === 'feed' ? 'block' : 'none' }}
        >
          <div className="flex justify-between items-center mb-6">
            <span className="font-headline font-bold text-lg text-primary">FEED</span>
            <span className="material-symbols-outlined text-primary/60">filter_list</span>
          </div>
          <div className="bg-surface-container rounded-xl p-4 border-l-2 border-primary space-y-2">
            <div className="flex justify-between text-[10px] font-headline text-primary/60 uppercase tracking-widest">
              <span>Signal</span>
              <span>2m</span>
            </div>
            <h4 className="font-headline font-bold text-sm">PUMP: $DEGEN</h4>
            <p className="text-[11px] text-on-surface-variant line-clamp-2">
              Whale 0x72...af swapped 40 ETH.
            </p>
          </div>
          <div className="bg-surface-container rounded-xl p-4 border-l-2 border-tertiary space-y-2">
            <div className="flex justify-between text-[10px] font-headline text-tertiary/60 uppercase tracking-widest">
              <span>Move</span>
              <span>12m</span>
            </div>
            <h4 className="font-headline font-bold text-sm">USDC OUTFLOW</h4>
            <p className="text-[11px] text-on-surface-variant line-clamp-2">
              $12M from Kraken Treasury.
            </p>
          </div>
        </div>

        {/* Predict View */}
        <div
          className="space-y-4"
          style={{ display: activeScreen === 'predict' ? 'block' : 'none' }}
        >
          <div className="flex justify-between items-center mb-6">
            <span className="font-headline font-bold text-lg text-tertiary">PREDICT</span>
            <span className="material-symbols-outlined text-tertiary/60">analytics</span>
          </div>
          <div className="bg-surface-container rounded-xl p-4 space-y-3">
            <h4 className="font-headline font-bold text-sm">ETH above $3k by EOY?</h4>
            <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
              <div className="w-[74%] h-full bg-tertiary" />
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-tertiary">YES 74%</span>
              <span className="text-on-surface-variant">NO 26%</span>
            </div>
          </div>
        </div>

        {/* Trade View */}
        <div
          className="space-y-4"
          style={{ display: activeScreen === 'trade' ? 'block' : 'none' }}
        >
          <div className="flex justify-between items-center mb-6">
            <span className="font-headline font-bold text-lg text-primary">TRADE</span>
            <span className="material-symbols-outlined text-primary/60">monitoring</span>
          </div>
          <div className="bg-surface-container rounded-xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold">SOL/USDC</span>
              <span className="text-tertiary text-xs">+5.4%</span>
            </div>
            <div className="h-20 w-full bg-surface-container-low rounded flex items-end p-2">
              <div className="flex-1 h-1/2 bg-primary/20 mx-0.5" />
              <div className="flex-1 h-2/3 bg-primary/20 mx-0.5" />
              <div className="flex-1 h-3/4 bg-primary mx-0.5" />
              <div className="flex-1 h-1/2 bg-primary mx-0.5" />
            </div>
            <button className="w-full py-2 bg-primary text-on-primary text-xs font-bold rounded">
              Long 10x
            </button>
          </div>
        </div>

        {/* Swap View */}
        <div
          className="space-y-4"
          style={{ display: activeScreen === 'swap' ? 'block' : 'none' }}
        >
          <div className="flex justify-between items-center mb-6">
            <span className="font-headline font-bold text-lg text-primary">SWAP</span>
            <span className="material-symbols-outlined text-primary/60">swap_calls</span>
          </div>
          <div className="space-y-2">
            <div className="bg-surface-container rounded-xl p-3 flex justify-between items-center">
              <div>
                <span className="text-[10px] block opacity-60">Sell</span>
                <span className="font-bold">10 SOL</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold">~$1,420</span>
              </div>
            </div>
            <div className="flex justify-center -my-2 relative z-10">
              <div className="bg-surface-container-highest p-1 rounded-full">
                <span className="material-symbols-outlined text-primary text-sm">
                  arrow_downward
                </span>
              </div>
            </div>
            <div className="bg-surface-container rounded-xl p-3 flex justify-between items-center">
              <div>
                <span className="text-[10px] block opacity-60">Buy</span>
                <span className="font-bold">BONK</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold">92.4M</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* App Nav */}
      <div className="h-16 bg-surface-container-lowest border-t border-outline-variant/20 flex justify-around items-center px-4">
        <span
          className="material-symbols-outlined transition-colors duration-[250ms]"
          style={{ color: navColor('feed'), fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          dynamic_feed
        </span>
        <span
          className="material-symbols-outlined transition-colors duration-[250ms]"
          style={{ color: navColor('predict'), fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          query_stats
        </span>
        <span
          className="material-symbols-outlined transition-colors duration-[250ms]"
          style={{ color: navColor('trade'), fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          swap_horiz
        </span>
        <span
          className="material-symbols-outlined transition-colors duration-[250ms]"
          style={{ color: navColor('swap'), fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          account_balance_wallet
        </span>
      </div>
    </div>
  )
}
