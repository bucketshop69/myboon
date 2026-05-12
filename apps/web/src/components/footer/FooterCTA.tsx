'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export function FooterCTA() {
  return (
    <section className="relative border-t border-outline-variant/40 py-32">
      <div className="max-w-3xl mx-auto px-6 lg:px-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-8"
        >
          <Image
            src="/branding/myboon-app-icon-foreground-v2.svg"
            alt="myboon"
            width={128}
            height={128}
            className="h-28 w-28 object-contain opacity-80"
          />

          <h2 className="font-headline font-bold text-2xl lg:text-3xl text-on-surface leading-tight">
            A news feed for markets.
            <br />
            <span className="text-on-surface-variant/60">
              Take action on everything you read.
            </span>
          </h2>

          {/* CTA */}
          <a
            href="https://x.com/myboonapp"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold rounded-xl shadow-2xl shadow-primary/20 hover:scale-[1.03] transition-transform flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-sm">Follow @myboonapp</span>
          </a>

          {/* Store badges teaser */}
          <div className="flex items-center gap-4 text-on-surface-variant/40">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/20">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.296l2.585 1.493a1 1 0 0 1 0 1.732l-2.585 1.493L15.3 12l2.398-2.59zM5.864 3.458L16.8 9.791l-2.302 2.302-8.634-8.635z" />
              </svg>
              <span className="text-xs font-headline">Play Store — Soon</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/20">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              <span className="text-xs font-headline">Seeker dApp Store — Soon</span>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 mt-4">
            <a
              href="https://github.com/bucketshop69/myboon"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-on-surface-variant/40 hover:text-on-surface-variant transition-colors font-headline"
            >
              GitHub
            </a>
            <span className="text-on-surface-variant/20">&middot;</span>
            <span className="text-xs text-on-surface-variant/30 font-headline">
              Built on Solana
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
