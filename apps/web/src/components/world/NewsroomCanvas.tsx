'use client'

import { useEffect, useRef, useState } from 'react'

/* ================================================================
   TYPES
================================================================ */
interface RoomInfo {
  title: string
  body: string
  stats: [string, string][]
  detail?: string
}

interface Room {
  x: number; y: number; w: number; h: number
  name: string; sub: string
  info: RoomInfo
}

interface CharInfo {
  title: string
  body: string
  stats: [string, string][]
}

interface RoutePoint {
  x: number; y: number
}

interface Character {
  hd: string; bd: string; name: string
  info: CharInfo
  routes: RoutePoint[]
  walkInterval: number; walkSpeed: number
  // runtime state (set during init)
  x: number; y: number
  homeX: number; homeY: number
  bob: number; walkPhase: number
  state: 'idle' | 'walking' | 'visiting' | 'returning'
  destX: number; destY: number
  nextWalkT: number; visitUntilT: number
}

interface Particle {
  pi: number; t: number; spd: number; op: number
}

interface PathDef {
  ax: number; ay: number; bx: number; by: number
  col: string; r: number; n: number
}

interface TooltipState {
  title: string
  body: string
  x: number
  y: number
}

interface PanelSection {
  label: string
  content: string | null
  rows: [string, string][] | null
}

interface PanelState {
  title: string
  sections: PanelSection[]
}

/* ================================================================
   STATIC DATA — rooms, chars, paths defined once at module level
   so ARCHIVE_VISIT reference equality is preserved across renders
================================================================ */
const W = 1280, H = 720

const ROOMS: Record<string, Room> = {
  wire: {
    x: 18, y: 28, w: 218, h: 252, name: 'WIRE ROOM', sub: 'Data Ingestion',
    info: {
      title: 'WIRE ROOM',
      body: 'Data arrives here first.\nEvery 5 min: tracked wallet activity.\nEvery 2h: top Polymarket markets by volume.\nAll raw — the Analyst handles what it means.',
      stats: [['Status', '● LIVE'], ['Poll interval', '5 min'], ['Last ping', '47s ago'], ['Signals/hr', '~140']],
      detail: 'Two collector agents run continuously in this room. The Polymarket Collector scrapes top markets by volume and whale bets. The User Tracker watches user-defined filters.\n\nAll signals land in the SIGNALS table in Supabase, completely unanalyzed.'
    }
  },
  research: {
    x: 254, y: 28, w: 198, h: 252, name: 'RESEARCH DESK', sub: 'Signal Analysis',
    info: {
      title: 'RESEARCH DESK',
      body: 'Reads every incoming signal every 15 min.\nGroups related signals into narrative clusters — if three whale wallets all bet on the same UCL outcome in one hour, that is one cluster.\nScores each cluster 1-10. Only 7+ proceeds.',
      stats: [['Status', '● ACTIVE'], ['Interval', '15 min'], ['Last run', '3m ago'], ['Clusters today', '8']],
      detail: 'The Analyst reads all unprocessed signals from SIGNALS, groups them by topic proximity using vector similarity, and scores each cluster via MiniMax M2.7.\n\nThreshold: 7/10 minimum to pass to Editorial. Lower-scored clusters are archived but not escalated.'
    }
  },
  editorial: {
    x: 470, y: 28, w: 272, h: 252, name: 'EDITORIAL ROOM', sub: 'Publisher + Critic Loop',
    info: {
      title: 'EDITORIAL ROOM',
      body: 'Publisher drafts the narrative.\nSenior Editor reviews for accuracy and tone.\nIf rejected, Publisher revises.\nLoop runs until approved or 3 iterations — then flagged for human review.',
      stats: [['Status', '● RUNNING'], ['Drafts today', '12'], ['Approved', '9'], ['Loops', '3']],
      detail: 'The Publisher agent receives a scored cluster and drafts a plain-English narrative explaining what the data means and predicts.\n\nThe Senior Editor (Critic) scores the draft on accuracy, tone, and predictive clarity. If rejected, the Publisher revises. Max 3 loops before human review is flagged.'
    }
  },
  archive: {
    x: 254, y: 298, w: 198, h: 172, name: 'ARCHIVE ROOM', sub: 'Supabase Database',
    info: {
      title: 'ARCHIVE ROOM',
      body: 'The physical database.\nFiling cabinets hold SIGNALS, NARRATIVES, PUBLISHED, and X_POSTS tables.\nAgents walk in and out — every database operation appears as a character visit.',
      stats: [['Engine', 'Supabase'], ['Signals', '4,821'], ['Narratives', '203'], ['Published', '89']],
      detail: 'Every read and write to Supabase is visualized as an agent physically walking to this room, opening a drawer, and returning.\n\nTables: SIGNALS (raw data), NARRATIVES (drafted clusters), PUBLISHED (approved narratives), X_POSTS (sent posts + engagement).'
    }
  },
  broadcast: {
    x: 470, y: 298, w: 272, h: 172, name: 'BROADCAST DESK', sub: 'Content Distribution',
    info: {
      title: 'BROADCAST DESK',
      body: 'The Influencer agent picks up approved narratives and formats them as tweets.\nPosts to X/Twitter with market-specific hashtags and prediction framing.\nMaximum 8 posts per day.',
      stats: [['Status', '● STANDBY'], ['Posts today', '6'], ['Avg engagement', '2.4%'], ['Next post', '~18 min']],
      detail: 'The Influencer agent monitors the PUBLISHED table for new approved narratives. When one arrives, it formats it as a tweet thread or single post optimized for X engagement.\n\nPost timing is regulated — max 8 posts/day with randomized intervals to avoid detection.'
    }
  },
  server: {
    x: 18, y: 490, w: 724, h: 95, name: 'SERVER ROOM', sub: 'MiniMax M2.7 // LLM Infrastructure',
    info: {
      title: 'SERVER ROOM',
      body: 'MiniMax M2.7 LLM infrastructure.\nEvery agent routes all inference through this layer.\nNo agent characters live here — purely infrastructure.\nGlowing cables run from every desk above.',
      stats: [['Model', 'MiniMax M2.7'], ['Status', '● ONLINE'], ['Calls today', '847'], ['Avg latency', '1.2s']],
      detail: 'The Server Room runs the shared MiniMax M2.7 language model that every agent depends on.\n\nThe Analyst calls it to score clusters. The Publisher calls it to draft narratives. The Editor calls it to critique. The Influencer calls it to format posts.\n\nDashed cables connect upward through the floor into each agent room.'
    }
  },
}

const R = ROOMS

// ARCHIVE_VISIT is a stable object reference — used for reference equality in DB WRITE label
const ARCHIVE_VISIT: RoutePoint = { x: R.archive.x + 99, y: R.archive.y + 90 }

const DESKS: Record<string, { x: number; y: number }> = {
  col1:      { x: R.wire.x + 12 + 26,         y: R.wire.y + 52 + 2 },
  col2:      { x: R.wire.x + 88 + 26,         y: R.wire.y + 108 + 2 },
  tracker:   { x: R.wire.x + 12 + 26,         y: R.wire.y + 168 + 2 },
  analyst:   { x: R.research.x + 25 + 30,     y: R.research.y + 90 + 2 },
  publisher: { x: R.editorial.x + 18 + 31,    y: R.editorial.y + 90 + 2 },
  editor:    { x: R.editorial.x + 142 + 31,   y: R.editorial.y + 90 + 2 },
  influencer:{ x: R.broadcast.x + 28 + 41,    y: R.broadcast.y + 46 + 4 },
}

// Characters — routes use the stable ARCHIVE_VISIT reference
const CHARS_TEMPLATE: Record<string, Omit<Character, 'x'|'y'|'homeX'|'homeY'|'bob'|'walkPhase'|'state'|'destX'|'destY'|'nextWalkT'|'visitUntilT'>> = {
  col1: {
    hd: '#c8a06a', bd: '#3a5080', name: 'PM Collector',
    info: {
      title: 'POLYMARKET COLLECTOR',
      body: 'Scrapes Polymarket every 2h for top markets by volume.\nIdentifies odds shifts >5% and new trending events.\nWrites raw signals directly to the SIGNALS table.',
      stats: [['Last run', '1h 43m ago'], ['Markets scraped', '24'], ['Signals written', '18']]
    },
    routes: [{ x: R.wire.x + 88 + 26, y: R.wire.y + 60 }],
    walkInterval: 14, walkSpeed: 1.3,
  },
  col2: {
    hd: '#c0986a', bd: '#3a5540', name: 'Whale Tracker',
    info: {
      title: 'WHALE TRACKER',
      body: 'Tracks whale wallet movements via Polymarket APIs.\nLogs any new position over $10k as a WHALE_BET signal.\nWrites to SIGNALS table immediately.',
      stats: [['Last run', '2m ago'], ['Wallets tracked', '47'], ['Signals written', '3']]
    },
    routes: [{ x: R.wire.x + 12 + 26, y: R.wire.y + 130 }],
    walkInterval: 19, walkSpeed: 1.3,
  },
  tracker: {
    hd: '#b08858', bd: '#603838', name: 'User Tracker',
    info: {
      title: 'USER TRACKER',
      body: 'Monitors user-defined market filters every 30 min.\nWrites alerts to SIGNALS table when conditions are matched.',
      stats: [['Last run', '12m ago'], ['Filters active', '8'], ['Alerts today', '5']]
    },
    routes: [], walkInterval: 999, walkSpeed: 1.2,
  },
  analyst: {
    hd: '#b89070', bd: '#284872', name: 'The Analyst',
    info: {
      title: 'THE ANALYST',
      body: 'Reads every incoming signal every 15 min.\nGroups related signals into narrative clusters.\nScores each cluster 1-10 using MiniMax.\nOnly 7+ proceed to Editorial.',
      stats: [['Last run', '3m ago'], ['Clusters scored', '8'], ['Passed to Editorial', '5']]
    },
    routes: [ARCHIVE_VISIT],
    walkInterval: 10, walkSpeed: 1.5,
  },
  publisher: {
    hd: '#c8a878', bd: '#1c1c2c', name: 'The Publisher',
    info: {
      title: 'THE PUBLISHER',
      body: 'Receives scored clusters and drafts narratives in plain English.\nRevises based on Editor feedback.\nPublishes to the PUBLISHED table once approved.',
      stats: [['Drafts today', '12'], ['Revisions written', '7'], ['Approved', '9']]
    },
    routes: [{ x: DESKS.editor.x, y: DESKS.editor.y + 6 }],
    walkInterval: 13, walkSpeed: 1.4,
  },
  editor: {
    hd: '#b89868', bd: '#382818', name: 'Senior Editor',
    info: {
      title: 'SENIOR EDITOR (CRITIC)',
      body: 'Reviews every Publisher draft for accuracy, tone,\nand predictive clarity.\nApproves with a stamp or rejects with specific written\nfeedback for the Publisher to act on.',
      stats: [['Reviews today', '12'], ['Approval rate', '75%'], ['Avg feedback', '2.1 notes']]
    },
    routes: [], walkInterval: 999, walkSpeed: 1.2,
  },
  influencer: {
    hd: '#c8a070', bd: '#582840', name: 'The Influencer',
    info: {
      title: 'THE INFLUENCER',
      body: 'Formats approved narratives as tweets.\nPosts to X/Twitter with market-specific hashtags.\nTracks engagement. Max 8 posts per day.',
      stats: [['Posts today', '6'], ['Avg engagement', '2.4%'], ['Followers reached', '~12k']]
    },
    routes: [], walkInterval: 999, walkSpeed: 1.2,
  },
}

const PATHS: PathDef[] = [
  { ax: R.wire.x + R.wire.w, ay: R.wire.y + 80, bx: R.research.x, by: R.research.y + 80, col: '#e4d389', r: 3.0, n: 6 },
  { ax: R.research.x + 90, ay: R.research.y + R.research.h, bx: R.archive.x + 90, by: R.archive.y, col: '#9de1c0', r: 2.8, n: 4 },
  { ax: R.research.x + R.research.w, ay: R.research.y + 80, bx: R.editorial.x, by: R.editorial.y + 80, col: '#e4d389', r: 3.0, n: 5 },
  { ax: R.editorial.x + 100, ay: R.editorial.y + R.editorial.h, bx: R.broadcast.x + 100, by: R.broadcast.y, col: '#e4d389', r: 2.8, n: 3 },
  { ax: R.editorial.x + 30, ay: R.editorial.y + R.editorial.h, bx: R.archive.x + R.archive.w, by: R.archive.y + 50, col: '#9de1c0', r: 2.5, n: 3 },
]

const TICKER = ['WHALE_BET \u25b6 UCL_FINAL', 'ODDS_SHIFT +7.3%', 'MARKET_DISCOVERED', 'PM_TRENDING', 'WHALE \u25b6 $45k', 'WALLET 0x3a..f2', 'NEW_POSITION \u25b6 YES', 'ODDS_MOVE -4.1%']

/* ================================================================
   COMPONENT
================================================================ */
export default function NewsroomCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Refs for state setters so canvas event handlers avoid stale closures
  const setTooltipRef = useRef(setTooltip)
  const setPanelRef = useRef(setPanel)
  const setPanelOpenRef = useRef(setPanelOpen)
  useEffect(() => { setTooltipRef.current = setTooltip }, [setTooltip])
  useEffect(() => { setPanelRef.current = setPanel }, [setPanel])
  useEffect(() => { setPanelOpenRef.current = setPanelOpen }, [setPanelOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cv: HTMLCanvasElement = canvas  // non-null alias for closure capture
    const ctxRaw = cv.getContext('2d')
    if (!ctxRaw) return
    const ctx: CanvasRenderingContext2D = ctxRaw  // non-null alias for closure capture

    cv.width = W
    cv.height = H

    /* ---- init characters ---- */
    const CHARS: Record<string, Character> = {}
    for (const [k, tmpl] of Object.entries(CHARS_TEMPLATE)) {
      const d = DESKS[k]
      CHARS[k] = {
        ...tmpl,
        x: d.x, y: d.y,
        homeX: d.x, homeY: d.y,
        bob: Math.random() * Math.PI * 2,
        walkPhase: 0,
        state: 'idle',
        destX: d.x, destY: d.y,
        nextWalkT: 2 + Math.random() * tmpl.walkInterval,
        visitUntilT: 0,
      }
    }

    /* ---- init particles ---- */
    const PARTS: Particle[] = []
    PATHS.forEach((p, i) => {
      for (let j = 0; j < p.n; j++) {
        PARTS.push({ pi: i, t: Math.random(), spd: 0.003 + Math.random() * 0.003, op: 0.6 + Math.random() * 0.4 })
      }
    })

    /* ---- globals ---- */
    let T = 0
    let tickOff = 0
    let hovEl: { type: 'char' | 'room'; id: string } | null = null

    /* ---- zoom / pan state (mutable refs, no React state) ---- */
    let zoom = 1.2
    let panX = 184   // 640 - 380 * 1.2
    let panY = -8    // 360 - 306 * 1.2

    /* ---- drag state ---- */
    let isDragging = false
    let dragStartX = 0, dragStartY = 0
    let panStartX = 0, panStartY = 0
    let dragMoved = false

    /* ---- helpers ---- */
    function toWorld(ex: number, ey: number) {
      const r = cv.getBoundingClientRect()
      const canvasX = (ex - r.left) * W / r.width
      const canvasY = (ey - r.top) * H / r.height
      return { x: (canvasX - panX) / zoom, y: (canvasY - panY) / zoom }
    }
    function fr(x: number, y: number, w: number, h: number) { ctx.fillRect(x | 0, y | 0, w | 0, h | 0) }
    function sr(x: number, y: number, w: number, h: number) { ctx.strokeRect((x | 0) + 0.5, (y | 0) + 0.5, (w | 0) - 1, (h | 0) - 1) }
    function ft(t: string, x: number, y: number) { ctx.fillText(t, x | 0, y | 0) }

    /* ---- draw helpers ---- */
    function drawFloor(rm: Room) {
      ctx.fillStyle = '#191910'
      fr(rm.x, rm.y, rm.w, rm.h)
      const ts = 16
      for (let tx = 0; tx < rm.w; tx += ts) {
        for (let ty = 0; ty < rm.h; ty += ts) {
          if (((tx / ts | 0) + (ty / ts | 0)) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.016)'
            fr(rm.x + tx, rm.y + ty, ts, ts)
          }
        }
      }
    }
    function drawWalls(rm: Room, hov: boolean) {
      ctx.strokeStyle = hov ? '#e4d389' : '#2a2820'
      ctx.lineWidth = hov ? 2 : 1.5
      sr(rm.x, rm.y, rm.w, rm.h)
      ctx.strokeStyle = hov ? 'rgba(228,211,137,0.15)' : '#1e1c14'
      ctx.lineWidth = hov ? 4 : 3
      sr(rm.x + 2, rm.y + 2, rm.w - 4, rm.h - 4)
    }
    function drawRoomLabel(rm: Room) {
      ctx.textAlign = 'center'
      ctx.font = "6.5px 'Press Start 2P',monospace"
      ctx.fillStyle = 'rgba(228,211,137,0.2)'
      ft(rm.name, rm.x + rm.w / 2, rm.y + rm.h - 9)
      ctx.font = "5px 'Press Start 2P',monospace"
      ctx.fillStyle = 'rgba(228,211,137,0.1)'
      ft(rm.sub, rm.x + rm.w / 2, rm.y + rm.h - 20)
    }
    function drawDesk(x: number, y: number, w: number, h: number, monCol: string | null) {
      ctx.fillStyle = '#2e2518'; fr(x, y, w, h)
      ctx.fillStyle = '#221c12'; fr(x, y + h - 3, w, 3)
      if (monCol) {
        const mw = Math.min(w - 8, 26), mh = 17
        const mx2 = x + (w - mw) / 2, my2 = y + 3
        ctx.fillStyle = '#060d0d'; fr(mx2, my2, mw, mh)
        ctx.fillStyle = monCol
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(T * 1.9 + x * 0.05)
        fr(mx2 + 1, my2 + 1, mw - 2, mh - 2)
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        for (let i = 0; i < 4; i++) fr(mx2 + 2, my2 + 2 + i * 3.5, 3 + Math.floor(Math.random() * 10), 1.5)
      }
    }
    function drawCab(x: number, y: number) {
      ctx.fillStyle = '#201e14'; fr(x, y, 20, 28)
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#2a2818'; fr(x + 1, y + 2 + i * 9, 18, 7)
        ctx.fillStyle = '#5a5030'; fr(x + 7, y + 4 + i * 9, 6, 2)
      }
    }

    /* ---- room interiors ---- */
    function drawWireRoom() {
      const rm = R.wire
      const bx = rm.x + 8, by = rm.y + 8, bw = rm.w - 16, bh = 26
      ctx.fillStyle = '#070707'; fr(bx, by, bw, bh)
      ctx.strokeStyle = 'rgba(106,96,48,0.5)'; ctx.lineWidth = 0.8; sr(bx, by, bw, bh)
      tickOff += 0.22
      ctx.save()
      ctx.beginPath(); ctx.rect(bx + 1, by + 1, bw - 2, bh - 2); ctx.clip()
      const full = TICKER.join('   //   ')
      ctx.font = "5px 'Press Start 2P',monospace"
      ctx.fillStyle = '#e4d389'; ctx.textAlign = 'left'
      const cw = 3.1, tw = full.length * cw
      ctx.fillText(full + '   //   ' + full, bx + 3 - (tickOff % tw), by + 17)
      ctx.restore()
      drawDesk(rm.x + 12, rm.y + 52, 52, 24, '#2ab090')
      drawDesk(rm.x + 88, rm.y + 108, 52, 24, '#c0901a')
      drawDesk(rm.x + 12, rm.y + 168, 52, 24, '#2ab090')
      ctx.fillStyle = '#1a1812'; fr(rm.x + 148, rm.y + 98, 44, 32)
      ctx.fillStyle = '#0a0a08'; fr(rm.x + 152, rm.y + 104, 36, 8)
      ctx.fillStyle = 'rgba(42,176,144,0.22)'; fr(rm.x + 158, rm.y + 106, 24, 4)
    }
    function drawResearchRoom() {
      const rm = R.research
      const bx = rm.x + 8, by = rm.y + 10, bw = rm.w - 16, bh = 52
      ctx.fillStyle = '#1a1810'; fr(bx, by, bw, bh)
      ctx.strokeStyle = 'rgba(228,211,137,0.12)'; ctx.lineWidth = 1; sr(bx, by, bw, bh)
      const circles = [{ x: 28, y: 25, r: 13 }, { x: 60, y: 30, r: 16 }, { x: 98, y: 19, r: 10 }, { x: 136, y: 27, r: 14 }]
      circles.forEach(ci => {
        ctx.strokeStyle = `rgba(228,211,137,${0.16 + 0.1 * Math.sin(T + ci.x * 0.05)})`
        ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.arc(bx + ci.x, by + ci.y, ci.r, 0, Math.PI * 2); ctx.stroke()
      })
      ctx.strokeStyle = 'rgba(157,225,192,0.22)'; ctx.lineWidth = 0.8
      ctx.beginPath()
      circles.forEach((ci, i) => { i === 0 ? ctx.moveTo(bx + ci.x, by + ci.y) : ctx.lineTo(bx + ci.x, by + ci.y) })
      ctx.stroke()
      ctx.fillStyle = 'rgba(228,211,137,0.15)'; ctx.strokeStyle = 'rgba(228,211,137,0.35)'; ctx.lineWidth = 0.8
      circles.forEach(ci => { ctx.beginPath(); ctx.arc(bx + ci.x, by + ci.y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke() })
      drawDesk(rm.x + 25, rm.y + 90, 60, 26, '#c0901a')
      for (let i = 3; i >= 0; i--) { ctx.fillStyle = `rgba(220,208,150,${0.42 + i * 0.08})`; fr(rm.x + 25 + i * 1.5, rm.y + 124 + i, 20, 12) }
      for (let i = 3; i >= 0; i--) { ctx.fillStyle = `rgba(220,208,150,${0.32 + i * 0.06})`; fr(rm.x + 97 + i * 1.5, rm.y + 108 + i, 20, 12) }
    }
    function drawEditorialRoom() {
      const rm = R.editorial
      const bx = rm.x + 8, by = rm.y + 10, bw = rm.w - 16, bh = 52
      ctx.fillStyle = '#281e10'; fr(bx, by, bw, bh)
      const pins = [{ x: 16, y: 9, w: 58 }, { x: 88, y: 7, w: 68 }, { x: 172, y: 13, w: 50 }, { x: 26, y: 30, w: 54 }, { x: 110, y: 28, w: 64 }]
      pins.forEach(p => {
        ctx.fillStyle = '#eee8ca'; fr(bx + p.x, by + p.y, p.w, 14)
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; fr(bx + p.x + 3, by + p.y + 3, p.w - 6, 2); fr(bx + p.x + 3, by + p.y + 7, (p.w - 6) * 0.6, 2)
        ctx.fillStyle = '#c02828'
        ctx.beginPath(); ctx.arc(bx + p.x + p.w / 2, by + p.y - 2, 2.5, 0, Math.PI * 2); ctx.fill()
      })
      drawDesk(rm.x + 18, rm.y + 90, 62, 26, '#2ab090')
      drawDesk(rm.x + 142, rm.y + 90, 62, 26, '#c0901a')
      ctx.fillStyle = '#c02828'; fr(rm.x + 172, rm.y + 102, 10, 8)
      ctx.fillStyle = '#1a0808'; fr(rm.x + 173, rm.y + 110, 8, 4)
    }
    function drawArchiveRoom() {
      const rm = R.archive
      for (let i = 0; i < 6; i++) drawCab(rm.x + 8 + i * 28, rm.y + 12)
      const labels = ['SIGNALS', 'NARRATIVES', 'PUBLISHED', 'X_POSTS']
      ctx.font = "4px 'Press Start 2P',monospace"; ctx.fillStyle = 'rgba(106,96,48,0.6)'; ctx.textAlign = 'center'
      labels.forEach((l, i) => ft(l, rm.x + 18 + i * 47, rm.y + 50))
      for (let i = 0; i < 3; i++) drawCab(rm.x + 8 + i * 28, rm.y + 70)
      ctx.font = "4px 'Press Start 2P',monospace"; ctx.fillStyle = 'rgba(106,96,48,0.25)'; ctx.textAlign = 'left'
      ft('READ / WRITE', rm.x + 8, rm.y + rm.h - 8)
    }
    function drawBroadcastRoom() {
      const rm = R.broadcast
      drawDesk(rm.x + 28, rm.y + 46, 82, 30, '#c0901a')
      ctx.fillStyle = '#0a0a08'; fr(rm.x + 122, rm.y + 52, 12, 20)
      ctx.strokeStyle = 'rgba(42,176,144,0.38)'; ctx.lineWidth = 0.6; sr(rm.x + 123, rm.y + 53, 10, 16)
      ctx.save(); ctx.font = '28px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.022)'; ctx.textAlign = 'center'
      ctx.fillText('\u{1D54F}', rm.x + 220, rm.y + 138); ctx.restore()
      if (Math.sin(T * 0.35) > 0.7) {
        const prog = (Math.sin(T * 0.35) - 0.7) / 0.3
        const ex = rm.x + 28 + 41 + prog * 90, ey = rm.y + 46 + 4 - prog * 18
        ctx.fillStyle = 'rgba(228,211,137,0.55)'; fr(ex, ey, 8, 6)
        ctx.strokeStyle = 'rgba(228,211,137,0.3)'; ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 4, ey + 4); ctx.lineTo(ex + 8, ey); ctx.stroke()
      }
    }
    function drawServerRoom() {
      const rm = R.server
      ctx.fillStyle = '#0f0f0a'; fr(rm.x, rm.y, rm.w, rm.h)
      const ts = 16
      for (let tx = 0; tx < rm.w; tx += ts) for (let ty = 0; ty < rm.h; ty += ts) {
        if (((tx / ts | 0) + (ty / ts | 0)) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.01)'; fr(rm.x + tx, rm.y + ty, ts, ts) }
      }
      for (let i = 0; i < 15; i++) {
        const rx = rm.x + 20 + i * 46, ry = rm.y + 16
        ctx.fillStyle = '#141410'; fr(rx, ry, 36, 62)
        ctx.strokeStyle = '#222218'; ctx.lineWidth = 0.8; sr(rx, ry, 36, 62)
        for (let j = 0; j < 8; j++) {
          ctx.fillStyle = Math.sin(T * 2.8 + i * 0.6 + j * 1.2) > 0.2 ? '#d08820' : '#302008'
          fr(rx + 3, ry + 3 + j * 7.2, 6, 4)
          ctx.fillStyle = Math.sin(T * 1.9 + i * 0.4 + j * 0.8) > 0.4 ? '#1a8050' : '#082018'
          fr(rx + 11, ry + 3 + j * 7.2, 3, 4)
        }
      }
      const tx2 = rm.x + rm.w / 2 - 58, ty2 = rm.y + 13
      ctx.fillStyle = '#080808'; fr(tx2, ty2, 116, 68)
      ctx.strokeStyle = 'rgba(106,96,48,0.55)'; ctx.lineWidth = 1; sr(tx2, ty2, 116, 68)
      ctx.textAlign = 'center'
      ctx.font = "6.5px 'Press Start 2P',monospace"; ctx.fillStyle = '#e4d389'; ft('MiniMax M2.7', tx2 + 58, ty2 + 20)
      ctx.font = "5.5px 'Press Start 2P',monospace"; ctx.fillStyle = '#9de1c0'; ft('\u25cf ONLINE', tx2 + 58, ty2 + 36)
      if (Math.floor(T * 2) % 2 === 0) { ctx.fillStyle = 'rgba(228,211,137,0.55)'; ft('_', tx2 + 58, ty2 + 52) }
      const isHov = hovEl !== null && hovEl.type === 'room' && hovEl.id === 'server'
      drawWalls(rm, isHov)
      drawRoomLabel(rm)
    }

    /* ---- cables ---- */
    function drawCables() {
      ;(['wire', 'research', 'editorial', 'archive', 'broadcast'] as const).forEach((id, i) => {
        const rm = ROOMS[id]
        const cx = rm.x + rm.w / 2, sy = ROOMS.server.y
        const pulse = (Math.sin(T * 1.9 + i * 0.72) + 1) / 2
        ctx.strokeStyle = `rgba(208,136,32,${0.07 + pulse * 0.14})`
        ctx.lineWidth = 2; ctx.setLineDash([3.5, 5.5])
        ctx.beginPath(); ctx.moveTo(cx, rm.y + rm.h); ctx.lineTo(cx, sy); ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = `rgba(228,211,137,${0.04 + pulse * 0.07})`
        ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.moveTo(cx, rm.y + rm.h); ctx.lineTo(cx, sy); ctx.stroke()
      })
    }

    /* ---- particles ---- */
    function drawParticles() {
      PARTS.forEach(p => {
        p.t += p.spd; if (p.t > 1) p.t = 0
        const path = PATHS[p.pi]
        const ppx = path.ax + (path.bx - path.ax) * p.t
        const ppy = path.ay + (path.by - path.ay) * p.t
        const fade = p.op * (0.4 + 0.6 * Math.sin(p.t * Math.PI))
        ctx.globalAlpha = fade * 0.15
        ctx.fillStyle = path.col
        ctx.beginPath(); ctx.arc(ppx, ppy, path.r + 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = fade
        ctx.beginPath(); ctx.arc(ppx, ppy, path.r, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      })
    }

    /* ---- character update ---- */
    function updateChars() {
      for (const [, ch] of Object.entries(CHARS)) {
        if (!ch.routes || ch.routes.length === 0) continue

        if (ch.state === 'idle') {
          if (T >= ch.nextWalkT) {
            const dest = ch.routes[Math.floor(Math.random() * ch.routes.length)]
            ch.destX = dest.x; ch.destY = dest.y
            ch.state = 'walking'
          }
        } else if (ch.state === 'walking') {
          const dx = ch.destX - ch.x, dy = ch.destY - ch.y, dist = Math.hypot(dx, dy)
          if (dist < ch.walkSpeed) {
            ch.x = ch.destX; ch.y = ch.destY
            ch.state = 'visiting'
            ch.visitUntilT = T + 2.5 + Math.random() * 3.5
          } else {
            ch.x += (dx / dist) * ch.walkSpeed
            ch.y += (dy / dist) * ch.walkSpeed
            ch.walkPhase += 0.2
          }
        } else if (ch.state === 'visiting') {
          if (T >= ch.visitUntilT) {
            ch.destX = ch.homeX; ch.destY = ch.homeY
            ch.state = 'returning'
          }
        } else if (ch.state === 'returning') {
          const dx = ch.homeX - ch.x, dy = ch.homeY - ch.y, dist = Math.hypot(dx, dy)
          if (dist < ch.walkSpeed) {
            ch.x = ch.homeX; ch.y = ch.homeY
            ch.state = 'idle'
            ch.nextWalkT = T + ch.walkInterval + Math.random() * ch.walkInterval * 0.8
          } else {
            ch.x += (dx / dist) * ch.walkSpeed
            ch.y += (dy / dist) * ch.walkSpeed
            ch.walkPhase += 0.2
          }
        }
      }
    }

    /* ---- character draw ---- */
    function drawChar(ch: Character, isHov: boolean) {
      const isWalk = ch.state === 'walking' || ch.state === 'returning'
      const bob = isWalk ? 0 : Math.sin(T * 1.6 + ch.bob) * 1.8
      const swing = isWalk ? Math.sin(ch.walkPhase) * 5 : 0
      const cx = ch.x, cy = ch.y + bob

      ctx.fillStyle = 'rgba(0,0,0,0.24)'
      ctx.beginPath(); ctx.ellipse(cx, ch.y + 14, 10, 3.2, 0, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = '#1a1610'
      fr(cx - 4.5, cy + 12 + swing, 3.5, 8)
      fr(cx + 1, cy + 12 - swing, 3.5, 8)

      ctx.fillStyle = ch.bd
      fr(cx - 6, cy, 12, 13)
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      fr(cx - 6, cy, 12, 3)

      ctx.fillStyle = ch.bd
      fr(cx - 9, cy + 1.5 - swing * 0.4, 3, 7)
      fr(cx + 6, cy + 1.5 + swing * 0.4, 3, 7)

      ctx.fillStyle = ch.hd
      fr(cx - 5.5, cy - 10, 11, 10)

      ctx.fillStyle = '#111'
      fr(cx - 3.5, cy - 7, 2.5, 2.5)
      fr(cx + 1, cy - 7, 2.5, 2.5)

      ctx.fillStyle = 'rgba(160,130,90,0.3)'
      fr(cx - 1, cy - 4.5, 2, 1.5)

      if (isHov) {
        ctx.strokeStyle = '#e4d389'; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.ellipse(cx, cy + 2, 14, 23, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.textAlign = 'center'
        ctx.font = "6.5px 'Press Start 2P',monospace"; ctx.fillStyle = '#e4d389'
        ft(ch.name, cx, cy - 22)
      }

      // DB WRITE label — reference equality with ARCHIVE_VISIT is preserved (module-level const)
      if (ch.state === 'visiting' && ch.routes && ch.routes.length && ch.routes[0] === ARCHIVE_VISIT) {
        ctx.textAlign = 'center'
        ctx.font = "5px 'Press Start 2P',monospace"
        ctx.fillStyle = 'rgba(157,225,192,0.65)'
        ft('DB WRITE', cx, cy - 22)
      }
    }

    /* ---- hit tests ---- */
    function hitChar(lx: number, ly: number) {
      for (const [k, ch] of Object.entries(CHARS)) {
        if (Math.hypot(lx - ch.x, ly - ch.y) < 16) return { type: 'char' as const, id: k }
      }
      return null
    }
    function hitRoom(lx: number, ly: number) {
      for (const [k, rm] of Object.entries(ROOMS)) {
        if (lx >= rm.x && lx <= rm.x + rm.w && ly >= rm.y && ly <= rm.y + rm.h) return { type: 'room' as const, id: k }
      }
      return null
    }

    /* ---- build panel content ---- */
    function buildPanel(info: RoomInfo | CharInfo): PanelState {
      const sections: PanelSection[] = [
        { label: 'OVERVIEW', content: info.body, rows: null },
        { label: 'LIVE STATS', content: null, rows: info.stats },
      ]
      if ('detail' in info && info.detail) {
        sections.push({ label: 'HOW IT WORKS', content: info.detail, rows: null })
      }
      return { title: info.title, sections }
    }

    /* ---- event listeners ---- */
    function onMouseMove(e: MouseEvent) {
      // Pan logic — takes priority over hover when dragging
      if (isDragging) {
        const dx = e.clientX - dragStartX
        const dy = e.clientY - dragStartY
        if (Math.hypot(dx, dy) > 3) dragMoved = true
        const r = cv.getBoundingClientRect()
        panX = panStartX + dx * W / r.width
        panY = panStartY + dy * H / r.height
        return
      }

      const l = toWorld(e.clientX, e.clientY)
      const ch = hitChar(l.x, l.y)
      if (ch) {
        hovEl = ch
        const info = CHARS[ch.id].info
        setTooltipRef.current({ title: info.title, body: info.body, x: e.clientX, y: e.clientY })
        cv.style.cursor = 'pointer'
        return
      }
      const rm = hitRoom(l.x, l.y)
      if (rm) {
        hovEl = rm
        const info = ROOMS[rm.id].info
        setTooltipRef.current({ title: info.title, body: info.body, x: e.clientX, y: e.clientY })
        cv.style.cursor = 'pointer'
        return
      }
      hovEl = null
      setTooltipRef.current(null)
      cv.style.cursor = 'default'
    }
    function onClick(e: MouseEvent) {
      const l = toWorld(e.clientX, e.clientY)
      const ch = hitChar(l.x, l.y)
      if (ch) { setPanelRef.current(buildPanel(CHARS[ch.id].info)); setPanelOpenRef.current(true); return }
      const rm = hitRoom(l.x, l.y)
      if (rm) { setPanelRef.current(buildPanel(ROOMS[rm.id].info)); setPanelOpenRef.current(true); return }
      setPanelOpenRef.current(false)
    }
    function onMouseDown(e: MouseEvent) {
      isDragging = true
      dragMoved = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      panStartX = panX
      panStartY = panY
      cv.style.cursor = 'grabbing'
    }
    function onMouseUp(e: MouseEvent) {
      isDragging = false
      cv.style.cursor = 'default'
      if (!dragMoved) {
        onClick(e)
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      const canvasX = (e.clientX - r.left) * W / r.width
      const canvasY = (e.clientY - r.top) * H / r.height
      // world point under cursor — must stay fixed during zoom
      const worldX = (canvasX - panX) / zoom
      const worldY = (canvasY - panY) / zoom
      zoom *= e.deltaY < 0 ? 1.1 : 0.9
      zoom = Math.max(0.4, Math.min(4.0, zoom))
      panX = canvasX - worldX * zoom
      panY = canvasY - worldY * zoom
    }

    cv.addEventListener('mousemove', onMouseMove)
    cv.addEventListener('mousedown', onMouseDown)
    cv.addEventListener('mouseup', onMouseUp)
    cv.addEventListener('wheel', onWheel, { passive: false })

    /* ---- main loop ---- */
    let rafId: number
    function frame() {
      T += 0.016
      updateChars()

      ctx.fillStyle = '#14140d'
      ctx.fillRect(0, 0, W, H)

      // Apply zoom/pan transform for all world-space drawing
      ctx.setTransform(zoom, 0, 0, zoom, panX, panY)

      ctx.strokeStyle = 'rgba(255,255,255,0.01)'; ctx.lineWidth = 0.5
      for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

      drawCables()

      const dim = hovEl !== null
      ;(['wire', 'research', 'editorial', 'archive', 'broadcast'] as const).forEach(id => {
        const rm = ROOMS[id]
        const isHov = hovEl !== null && hovEl.type === 'room' && hovEl.id === id
        if (dim && !isHov) ctx.globalAlpha = 0.38
        drawFloor(rm)
        if (id === 'wire') drawWireRoom()
        else if (id === 'research') drawResearchRoom()
        else if (id === 'editorial') drawEditorialRoom()
        else if (id === 'archive') drawArchiveRoom()
        else if (id === 'broadcast') drawBroadcastRoom()
        drawWalls(rm, isHov)
        drawRoomLabel(rm)
        ctx.globalAlpha = 1
      })

      const srvHov = hovEl !== null && hovEl.type === 'room' && hovEl.id === 'server'
      if (dim && !srvHov) ctx.globalAlpha = 0.38
      drawServerRoom()
      ctx.globalAlpha = 1

      for (const [k, ch] of Object.entries(CHARS)) {
        const isHov = hovEl !== null && hovEl.type === 'char' && hovEl.id === k
        if (dim && !isHov) ctx.globalAlpha = 0.32
        drawChar(ch, isHov)
        ctx.globalAlpha = 1
      }

      drawParticles()

      // Reset transform before drawing fixed UI elements (watermark stays at canvas edge)
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      ctx.textAlign = 'right'
      ctx.font = "5.5px 'Press Start 2P',monospace"
      ctx.fillStyle = 'rgba(228,211,137,0.1)'
      ft('myboon.com/world', 748, 713)

      rafId = requestAnimationFrame(frame)
    }
    frame()

    return () => {
      cancelAnimationFrame(rafId)
      cv.removeEventListener('mousemove', onMouseMove)
      cv.removeEventListener('mousedown', onMouseDown)
      cv.removeEventListener('mouseup', onMouseUp)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [])

  /* ---- tooltip positioning ---- */
  function ttStyle(tt: TooltipState): React.CSSProperties {
    let left = tt.x + 22
    let top = tt.y - 10
    if (typeof window !== 'undefined') {
      if (left + 330 > window.innerWidth) left = tt.x - 340
      if (top < 10) top = 10
      if (top + 200 > window.innerHeight) top = window.innerHeight - 210
    }
    return { left, top }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#0c0c08',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      {/* Canvas — letterboxed 16:9 */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          width: 'min(100vw, calc(100vh * 1.7778))',
          height: 'min(100vh, calc(100vw * 0.5625))',
        }}
      />

      {/* HUD */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20,
          pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(12,12,8,0.94) 55%, transparent)',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        <span style={{ fontSize: 11, color: '#e4d389', letterSpacing: 3 }}>myboon // NEWSROOM</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 7, color: '#9de1c0', letterSpacing: 1 }}>
            {'▶ ALL SYSTEMS ONLINE'}
          </span>
          <span style={{ fontSize: 6, color: '#4a4838', letterSpacing: 1 }}>
            SCROLL TO ZOOM · DRAG TO PAN · HOVER TO INSPECT · CLICK FOR DETAIL
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            background: 'rgba(10,10,7,0.98)',
            border: '1px solid #e4d389',
            padding: '14px 18px',
            width: 320,
            pointerEvents: 'none',
            zIndex: 200,
            borderRadius: 2,
            fontFamily: "'Press Start 2P', monospace",
            ...ttStyle(tooltip),
          }}
        >
          <div style={{ fontSize: 8, color: '#e4d389', marginBottom: 10, lineHeight: 2 }}>
            {tooltip.title}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: '#6a6850',
              lineHeight: 1.85,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {tooltip.body}
          </div>
        </div>
      )}

      {/* Side panel */}
      <div
        style={{
          position: 'fixed',
          top: 0, right: 0,
          width: 340,
          height: '100vh',
          background: 'rgba(10,10,7,0.99)',
          borderLeft: '1px solid #232118',
          zIndex: 100,
          transform: panelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
          overflowY: 'auto',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        <button
          onClick={() => setPanelOpen(false)}
          style={{
            position: 'absolute',
            top: 14, right: 16,
            background: 'none',
            border: '1px solid #2a2820',
            color: '#4a4838',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            padding: '6px 10px',
            cursor: 'pointer',
            letterSpacing: 1,
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#e4d389'; (e.target as HTMLButtonElement).style.color = '#e4d389' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = '#2a2820'; (e.target as HTMLButtonElement).style.color = '#4a4838' }}
        >
          ✕ CLOSE
        </button>

        {panel && (
          <>
            <div style={{ padding: '50px 26px 18px', borderBottom: '1px solid #1e1c12' }}>
              <div style={{ fontSize: 10, color: '#e4d389', lineHeight: 2, letterSpacing: 1 }}>
                {panel.title}
              </div>
            </div>
            <div style={{ padding: '18px 26px' }}>
              {panel.sections.map((sec, si) => (
                <div key={si} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 6, color: '#9de1c0', letterSpacing: 2, marginBottom: 8 }}>
                    {sec.label}
                  </div>
                  {sec.content && (
                    <div
                      style={{ fontSize: 11, color: '#5e5c48', lineHeight: 2, fontFamily: 'monospace', marginBottom: 10 }}
                      dangerouslySetInnerHTML={{ __html: sec.content.replace(/\n\n/g, '</div><div style="margin-bottom:10px;font-size:11px;color:#5e5c48;line-height:2;font-family:monospace">').replace(/\n/g, '<br>') }}
                    />
                  )}
                  {sec.rows && sec.rows.map(([k, v], ri) => (
                    <div
                      key={ri}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '7px 0',
                        borderBottom: '1px solid #181810',
                        fontFamily: 'monospace',
                      }}
                    >
                      <span style={{ fontSize: 10, color: '#42412e' }}>{k}</span>
                      <span style={{ fontSize: 10, color: '#e4d389' }}>{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Live feed widget */}
      <div
        style={{
          position: 'fixed',
          bottom: 18,
          left: 24,
          width: 268,
          zIndex: 20,
          pointerEvents: 'none',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        <div style={{ fontSize: 6, color: '#32301e', letterSpacing: 2, marginBottom: 7 }}>LIVE FEED</div>

        {[
          { dot: 'g', time: '2m ago', text: 'Analyst scored cluster #52: 8.4/10 → passed to Editorial' },
          { dot: 'n', time: '7m ago', text: 'Publisher draft approved on 1st review' },
          { dot: '',  time: '11m ago', text: '3 whale wallet signals ingested via Polymarket' },
          { dot: 'g', time: '18m ago', text: 'Influencer posted to X — UCL Final narrative' },
          { dot: '',  time: '24m ago', text: 'Polymarket scan complete — 24 markets indexed' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 5, height: 5, borderRadius: '50%', marginTop: 3, flexShrink: 0,
                background: item.dot === 'g' ? '#e4d389' : item.dot === 'n' ? '#9de1c0' : '#3a3828',
              }}
            />
            <div style={{ fontSize: 6, color: '#28261a', minWidth: 40, paddingTop: 1, fontFamily: 'monospace' }}>
              {item.time}
            </div>
            <div style={{ fontSize: 8, color: '#3e3c2a', lineHeight: 1.6, fontFamily: 'monospace' }}>
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
