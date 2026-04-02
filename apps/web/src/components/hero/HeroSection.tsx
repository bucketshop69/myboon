'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import PhoneFrame from './PhoneFrame'
import FloatingCards from './FloatingCards'
import { type TabId } from './TabCard'

function showComingSoon(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = 'COMING SOON'
  el.style.opacity = '1'
  setTimeout(() => { el.style.opacity = '0' }, 1800)
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

export default function HeroSection() {
  const [hoveredCard, setHoveredCard] = useState<TabId | null>(null)

  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background: dot grid */}
      <div className="absolute inset-0 dot-grid opacity-[0.05] pointer-events-none" />
      {/* Background: hero glow */}
      <div className="absolute inset-0 hero-glow pointer-events-none" />

      {/* Centered Typography */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-20 text-center max-w-3xl px-6 mb-6"
      >
        <motion.h1
          variants={fadeUp}
          className="text-3xl lg:text-5xl font-headline font-bold tracking-tight text-on-surface leading-tight mb-3"
        >
          Narrative intelligence for{' '}
          <span className="text-primary italic">on-chain</span> traders.
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed"
        >
          Powered by Polymarket signals, on-chain flow, and a multi-agent brain.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-4 flex justify-center">
          <img
            src="/branding/myboon-wordmark-small@2x.png"
            alt="myboon"
            className="h-12 opacity-80"
          />
        </motion.div>
      </motion.div>

      {/* Centerpiece: Phone + Floating Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="relative w-full max-w-5xl flex items-center justify-center perspective-container"
        style={{ height: '520px' }}
      >
        <FloatingCards
          hoveredCard={hoveredCard}
          onHover={setHoveredCard}
          onLeave={() => setHoveredCard(null)}
        />
        <PhoneFrame activeTab={hoveredCard ?? 'feed'} />
        <div className="absolute -bottom-12 w-[400px] h-12 bg-black/60 blur-2xl rounded-full opacity-40 z-10 pointer-events-none" />
      </motion.div>

      {/* CTA + icon row */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.7, ease: EASE }}
        className="mt-6 z-40 flex flex-col items-center gap-4"
      >

        {/* Get Early Access */}
        <div className="relative">
          <button
            onClick={() => showComingSoon('cta-tip')}
            className="px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold rounded-xl shadow-2xl shadow-primary/20 hover:scale-105 transition-all flex items-center space-x-2 group"
          >
            <span className="text-base">Get Early Access</span>
            <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">
              arrow_right_alt
            </span>
          </button>
          <div
            id="cta-tip"
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[#0f0e08] border border-primary text-primary font-headline text-[9px] tracking-[0.2em] px-3 py-1 whitespace-nowrap pointer-events-none opacity-0 transition-opacity duration-150 rounded-[2px]"
          />
        </div>

        {/* Icon row */}
        <div className="flex items-center gap-6">

          {/* Newsroom */}
          <a
            href="#newsroom"
            className="group flex flex-col items-center gap-1"
            title="The Newsroom"
          >
            <span className="material-symbols-outlined text-2xl text-on-surface-variant group-hover:text-primary transition-colors">
              domain
            </span>
            <span className="font-headline text-[8px] tracking-[0.15em] text-[#4a473a] group-hover:text-primary transition-colors">
              NEWSROOM
            </span>
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/bucketshop69/myboon"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-1"
            title="GitHub"
          >
            <svg className="w-6 h-6 text-on-surface-variant group-hover:text-primary transition-colors fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="font-headline text-[8px] tracking-[0.15em] text-[#4a473a] group-hover:text-primary transition-colors">
              GITHUB
            </span>
          </a>

          {/* X */}
          <a
            href="https://x.com/myboonapp"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-1"
            title="X"
          >
            <svg className="w-6 h-6 text-on-surface-variant group-hover:text-primary transition-colors fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="font-headline text-[8px] tracking-[0.15em] text-[#4a473a] group-hover:text-primary transition-colors">
              X
            </span>
          </a>

          {/* Download */}
          <div className="relative">
            <button
              onClick={() => showComingSoon('dl-tip')}
              className="group flex flex-col items-center gap-1"
              title="Download"
            >
              <span className="material-symbols-outlined text-2xl text-on-surface-variant group-hover:text-primary transition-colors">
                download
              </span>
              <span className="font-headline text-[8px] tracking-[0.15em] text-[#4a473a] group-hover:text-primary transition-colors">
                DOWNLOAD
              </span>
            </button>
            <div
              id="dl-tip"
              className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[#0f0e08] border border-primary text-primary font-headline text-[9px] tracking-[0.2em] px-3 py-1 whitespace-nowrap pointer-events-none opacity-0 transition-opacity duration-150 rounded-[2px]"
            />
          </div>

        </div>
      </motion.div>
    </section>
  )
}
