# #046 — The Newsroom World (2D Pixel Art Office)

## What This Is

A standalone interactive page at `/world` (its own route, completely separate from the landing page). When you open it, you are looking at a 2D top-down pixel art office building — the entire myboon operation, rendered as a real workplace. Not a diagram. Not an infographic. An actual office that looks alive, with characters walking around, lights on in the rooms, and data visibly flowing between desks.

The closest reference for what this should feel like is **WorkAdventure** (workadventu.re) — a browser-based tool where companies build pixel art offices and their team members walk around as characters, bumping into each other. That same energy, that same aesthetic. Except instead of real people, the characters are myboon's AI agents, and instead of Zoom calls, clicking on a character shows you what that agent is currently doing in the pipeline.

Think of it as: if you could shrink yourself down and walk through the myboon servers, this is what you would see.

---

## The Aesthetic Reference

**WorkAdventure** is the exact visual target. If the designer has not seen it, they should spend 5 minutes on the WorkAdventure demo. The key visual elements to replicate:

- Top-down 2D view, looking straight down at a 45-degree-ish angle at the floor
- Pixel art tiles: wooden or dark tile floors, wall borders, furniture (desks, chairs, monitors, filing cabinets, plants)
- Small humanoid character sprites (roughly 32×48 pixels) that have a 4-frame walk cycle — they bob up and down slightly as they move
- Characters cast tiny pixel drop shadows on the floor
- The office has multiple rooms separated by walls with doorways or open corridors between them
- Everything is rendered on a dark palette — not the bright greens and blues of classic RPGs. Think a moody, late-night newsroom: dark wood floors, dim overhead lighting, monitors glowing in the dark

The color palette must match the myboon design system: deep near-black backgrounds (`#14140d`), gold/amber accents (`#e4d389`) for active/highlighted elements, soft green (`#9de1c0`) for positive signals, and neutral warm grays for furniture and walls.

---

## The Office Layout

The building is viewed as a single floor plan. The rooms are arranged left-to-right in the order data flows through the pipeline. A visitor looking at this page immediately reads the flow by looking left to right, which is natural.

Here is an approximate top-down layout of the office floor plan:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐      │
│  │              │    │              │    │                      │      │
│  │  WIRE ROOM   │───▶│  RESEARCH    │───▶│  EDITORIAL ROOM      │      │
│  │              │    │  DESK        │    │                      │      │
│  │  (Collectors)│    │  (Analyst)   │    │  (Publisher + Critic)│      │
│  │              │    │              │    │                      │      │
│  └──────────────┘    └──────┬───────┘    └──────────┬───────────┘      │
│                             │                       │                   │
│                             ▼                       ▼                   │
│                      ┌──────────────┐    ┌──────────────────────┐      │
│                      │              │    │                      │      │
│                      │   ARCHIVE    │    │   BROADCAST DESK     │      │
│                      │   ROOM       │    │                      │      │
│                      │  (Supabase)  │    │   (Influencer)       │      │
│                      │              │    │                      │      │
│                      └──────────────┘    └──────────────────────┘      │
│                                                                         │
│          ┌────────────────────────────────────────┐                    │
│          │  SERVER ROOM  (MiniMax / Brain Terminal)│                    │
│          └────────────────────────────────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Each box is a physical room with walls you can see from above. Doorways connect rooms. The Server Room runs along the bottom — it is accessible from every agent room because every agent calls the LLM.

---

## The Rooms in Detail

### Wire Room (far left)
This is where data enters the building. It looks like a busy newsdesk receiving live ticker feeds. Multiple monitors on the wall showing scrolling text. Two or three character sprites sit at workstations — these represent the Polymarket collector, the Nansen collector, and the user-tracker. They are always busy: their characters are animated with a typing motion or occasionally stand up and walk to a printer to pick up a printout.

Visually on the wall: a large board or ticker display showing incoming signal types scrolling past — `WHALE_BET`, `ODDS_SHIFT`, `MARKET_DISCOVERED`, `PM_EVENT_TRENDING`. These scroll slowly in pixel font.

### Research Desk (center-left)
One character sits here: the Analyst. Their desk has a pile of papers (signals) on the left side that slowly grows, and a stack of outgoing folders on the right side. The character periodically picks up a paper, appears to read it (animated: tilts head, then stamps it), and places it in the outgoing stack.

There is a large whiteboard on the wall behind the Analyst covered in cluster diagrams — hand-drawn circles connecting related signal topics. This whiteboard is decorative pixel art but gives the impression of genuine analytical work happening.

### Editorial Room (center-right)
Two characters share this room: the Publisher and the Senior Editor (Critic). They sit at adjacent desks facing each other. The Publisher is always typing. Occasionally the Publisher prints something, walks it over to the Editor's desk, and the Editor reads it. The Editor then either stamps it with an APPROVE stamp (green flash) or walks it back to the Publisher's desk with a note (red flash). This is the publisher-critic loop visualized as physical characters interacting.

A large board on the wall tracks recent publications — pixel art headlines pinned to a corkboard, new ones appearing and old ones sliding down as new narratives are published.

### Broadcast Desk (right side)
One character: the Influencer. Their desk has a phone and a small screen showing X/Twitter's bird logo. When the character posts, there is a small animation: they type, then a small envelope sprite flies off the screen to the right.

### Archive Room (below center)
No agent character lives here permanently — but characters from other rooms walk in and out. Filing cabinets line the walls, labeled with the table names: SIGNALS, NARRATIVES, PUBLISHED, X_POSTS. When an agent writes to the database, their character walks into this room, opens a drawer, puts something in, and walks back. When an agent reads from the database, they walk in, open a drawer, take something out.

This room makes Supabase feel tangible — it is the physical manifestation of the database.

### Server Room (bottom, spanning the width)
A long horizontal room at the bottom of the building. No characters walk here — it is purely infrastructure. Rows of server racks glow with pulsing amber lights. A large terminal screen at the center displays `MiniMax M2.7 — ONLINE` in pixel font with a blinking cursor. Glowing cable lines run from this room upward through the floor into each agent room above it, visualizing that every agent calls the same LLM.

---

## Character Design

Each agent character is a unique 32×48 pixel sprite. They all share the same basic humanoid shape (small pixel person) but have distinguishing visual features so they are immediately recognizable:

- **Analyst** — wears glasses, has a slightly messy desk, carries a clipboard sprite
- **Publisher** — sits upright, wears a dark blazer, has a coffee cup sprite on the desk
- **Senior Editor / Critic** — older-looking sprite, reading glasses on nose, red pen in hand
- **Influencer** — more casual outfit, has a phone sprite they hold up occasionally

Every character has at minimum two animation states:
- **Idle** — seated at desk, slight breathing bob (2-frame: lean forward slightly, lean back)
- **Walking** — 4-direction walk cycle when moving between rooms (4 frames per direction = 16 frames total)

Optionally, characters can have a **working** animation: a fast 2-frame typing motion while seated.

Characters do not stand still for long. They should feel alive. The Analyst gets up every 30 seconds (real time) and walks to the Archive Room. The Publisher occasionally walks to the Editor. The Editor occasionally stands, stretches (2-frame), and sits back down. These idle behaviors run on randomized timers so the office never looks frozen.

---

## Data Flow Visualization

Between rooms, small animated particles travel along the corridors and doorways between rooms — these are the data flowing through the pipeline. They look like tiny glowing envelopes, folders, or dots in the gold color traveling from room to room at a moderate pace.

The flow:
- Wire Room → Research Desk: constant trickle of small white dots (incoming signals)
- Research Desk → Archive Room: occasional folder sprite walking animation (narrative saved as draft)
- Archive Room → Editorial Room: occasional folder sprite (publisher reading draft)
- Editorial Room → Archive Room: occasional envelope sprite (published narrative written)
- Editorial Room → Broadcast Desk: occasional small page sprite (influencer picks up published narrative)
- Every agent room ↔ Server Room: a pulsing glowing line through the floor (LLM calls — not particle-based, just an ambient pulse)

---

## Interaction Model

The page is not playable in the WorkAdventure sense — the visitor does not control a character. Instead, the camera is fixed showing the full office floor plan at once (zoomed out to fit everything on screen). The office runs automatically like a diorama.

**Hover:** Hovering any character or room dims everything else slightly and shows a tooltip card beside the hovered element. The card uses the myboon design system (dark background, gold border) and explains in plain English what that character/room does.

Example tooltip for the Analyst character:
> **The Analyst**
> Reads every incoming signal every 15 minutes. Groups related signals into narrative clusters — if three whale wallets all bet on the same UCL outcome within an hour, that's one cluster. Scores each cluster 1–10. Only clusters scoring 7 or above get passed to the Editorial Room.

Example tooltip for the Wire Room:
> **Wire Room**
> Data arrives here first. Every 5 minutes: tracked wallet activity. Every 2 hours: top Polymarket markets by volume. Every 30 minutes: trending Nansen prediction market events. All raw, unprocessed — the Analyst handles what it means.

**Click:** Clicking a character or room opens a full side panel (slides in from the right) with a deeper explanation — the same content as the tooltip but expanded, with details about which files/scripts power that agent, what it writes to the database, and any recent real activity (e.g. "Last ran 4 minutes ago — produced 3 narrative clusters").

---

## Technical Approach

This is a browser canvas experience built with **Phaser.js** (the same engine WorkAdventure uses). Phaser handles:
- Tilemap rendering (JSON tilemap exported from Tiled map editor)
- Sprite animation state machines (idle, walk, work)
- Particle systems for the data flow dots
- Camera control (fixed, no player movement)
- Input handling (hover detection over sprite bounds, click events)

The tilemap itself is authored in **Tiled** (free map editor) and exported as JSON. The pixel art tiles and character spritesheets are either:
1. Sourced from a free pixel art RPG asset pack (LPC — Liberated Pixel Cup — assets are free and widely used) and recolored to match the myboon palette, or
2. Drawn specifically for this project at 16×16 tile size

The page lives at `apps/web/src/app/world/page.tsx` in the Next.js app. It renders a full-viewport canvas with no scrolling. The Phaser game instance mounts inside a React `useEffect` on a `<div>` ref.

---

## Scope

- `apps/web/src/app/world/page.tsx` — new route, renders the Phaser canvas full viewport
- `apps/web/src/components/world/NewsroomGame.tsx` — React component that initializes and owns the Phaser game instance
- `apps/web/src/components/world/scenes/NewsroomScene.ts` — main Phaser scene: loads tilemap, spawns characters, starts animations and particles
- `apps/web/src/components/world/characters/` — one file per agent character: sprite config, animation frames, idle behavior timers, tooltip content
- `apps/web/public/assets/world/` — tileset PNG, character spritesheets, particle sprites, tilemap JSON
- `apps/web/src/components/world/TooltipCard.tsx` — hover tooltip component rendered in React DOM overlaid on the canvas
- `apps/web/src/components/world/SidePanel.tsx` — click side panel, slides in from right

## Dependencies

- Blocked by: #045 (apps/web must exist first)
- None otherwise

---

## Acceptance Criteria

- [ ] `/world` route exists and loads without error
- [ ] Full office floor plan is visible on a 1280px desktop viewport without scrolling
- [ ] All five rooms are present (Wire Room, Research, Editorial, Broadcast, Archive) and labeled in pixel font
- [ ] Server Room is present at the bottom with pulsing amber server rack lights
- [ ] All four agent characters are present in their rooms with idle animations running
- [ ] Characters perform room-to-room walks on automated timers (Analyst → Archive, Publisher → Editor, etc.)
- [ ] Data flow particles animate continuously between rooms along the corridor paths
- [ ] Hovering any character or room shows a tooltip with plain-English description
- [ ] Clicking any character or room opens the side panel with expanded detail
- [ ] Side panel content exists for all rooms and all agent characters
- [ ] The color palette matches the myboon design system (dark background, gold accents, soft green signals)
- [ ] Page loads within 3 seconds on a standard connection (assets are optimized/spritesheet-packed)
- [ ] A link from the landing page (`/`) navigates to `/world` — small text link or button in the hero, something like "See how it works →"
