'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import PhoneFrame from './PhoneFrame'

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
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 dot-grid opacity-[0.04] pointer-events-none" />
      <div className="absolute inset-0 hero-glow pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 py-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        {/* Left: Content */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex-1 max-w-xl"
        >
          {/* Wordmark */}
          <motion.div variants={fadeUp} className="mb-8">
            <Image
              src="/branding/myboon-wordmark-small@2x.png"
              alt="myboon"
              width={120}
              height={32}
              className="opacity-80"
            />
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="text-4xl lg:text-6xl font-headline font-bold tracking-tight text-on-surface leading-[1.1] mb-6"
          >
            A news feed
            <br />
            for markets.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="text-lg text-on-surface-variant leading-relaxed mb-10 max-w-md"
          >
            Take action on everything you read. myboon watches markets 24/7 and lets you trade what it finds — one app.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href="https://x.com/myboonapp"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3.5 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold rounded-xl shadow-2xl shadow-primary/20 hover:scale-[1.03] transition-transform flex items-center gap-2.5"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm">Follow @myboonapp</span>
            </a>

            <div className="flex items-center gap-3 text-on-surface-variant/60">
              <span className="text-xs font-headline tracking-wide">Coming soon to</span>
              <span className="text-xs font-headline font-medium text-on-surface-variant/80">Play Store</span>
              <span className="text-xs text-on-surface-variant/30">&middot;</span>
              <span className="text-xs font-headline font-medium text-on-surface-variant/80">Seeker Store</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Right: Phone (existing placeholder) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
          className="flex-shrink-0 perspective-container"
        >
          <div className="phone-container">
            <PhoneFrame activeTab="feed" />
          </div>
          {/* Shadow under phone */}
          <div className="w-[280px] h-10 bg-black/50 blur-2xl rounded-full opacity-40 mx-auto -mt-4 pointer-events-none" />
        </motion.div>
      </div>
    </section>
  )
}
