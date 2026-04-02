'use client'

import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import NewsroomCanvas from './NewsroomCanvas'

const CANVAS_W = 1280
const CANVAS_H = 720

export function NewsroomSection() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      setScale(Math.min(1, w / CANVAS_W))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scaledH = Math.round(CANVAS_H * scale)

  return (
    <section id="newsroom" className="py-24 px-6 border-t border-outline-variant">
      <div className="max-w-5xl mx-auto mb-12 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-headline tracking-widest text-primary uppercase mb-3"
        >
          Under the hood
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-4"
        >
          The newsroom never sleeps.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-on-surface-variant text-base max-w-xl mx-auto"
        >
          Every signal that enters myboon passes through a multi-agent pipeline —
          collectors, analyst, editorial, broadcast. This is what it looks like.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        ref={wrapperRef}
        className="w-full overflow-hidden rounded-xl border border-outline-variant mx-auto max-w-6xl"
        style={{ height: scaledH }}
      >
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <NewsroomCanvas />
        </div>
      </motion.div>
    </section>
  )
}
