# #046 — Landing Page: Workflow Section (RPG Newsroom)

## Problem

The hero section (#045) shows what the product looks like. The workflow section needs to show how it works — specifically, the multi-agent intelligence pipeline that powers the feed. This pipeline is genuinely interesting and technically differentiated: real-time signals from multiple sources, three layers of LLM agents clustering and publishing narratives, an X influence layer. But no one can see it. It exists entirely in server logs and Supabase rows.

Describing this pipeline as a bulleted list or a flow diagram would be accurate but forgettable. The architecture needs to be shown in a way that communicates the intelligence and craft behind the system. A pixel art top-down RPG newsroom accomplishes this: it is immediately distinctive, it is interactive, and it makes the technical pipeline feel alive rather than abstract.

## Goal

1. A scrollable section on the landing page, positioned below the hero, that visualizes the full myboon signal-to-narrative pipeline as a pixel art top-down RPG environment
2. Each part of the pipeline — signal sources, agents, database, tools, output — is mapped to a room or zone in the newsroom, with a character or object representing it
3. The map is not decorative — hovering any element surfaces a tooltip or side panel explaining what that part does in plain language
4. The design is extensible: when new agents or tools are added in the future, they slot into the existing map as new desks, characters, or workstations without requiring a redesign

## Dependencies

- Blocked by: #045 (this section lives on the same page, below the hero)
- None otherwise

## Scope

- `apps/web/src/components/workflow/` — all workflow section components
- `apps/web/src/app/page.tsx` — workflow section rendered below hero
- Pixel art assets — either created inline via CSS pixel art techniques, sourced from a royalty-free pixel art asset pack, or drawn as SVGs with a pixelated rendering style

---

## The Newsroom Metaphor

The pipeline is a **newsroom**. The metaphor holds at every level:

- Signals are the **wire feeds** — raw information arriving from the outside world
- The Analyst is the **research desk** — reads the wires, clusters the important stories, decides what's worth pursuing
- The Publisher is the **Editor-in-Chief** — takes the analyst's clusters, writes the final narrative, decides what goes to print
- The Critic is the **Senior Editor** — reviews the Editor-in-Chief's drafts before publication, flags quality issues
- The Influencer is the **broadcast desk** — takes what was published and writes the X posts
- Supabase is the **archive room** — physical filing cabinets and server racks storing every signal, narrative, and post
- MiniMax (the LLM) is the **brain terminal** — a shared piece of equipment that every agent desk consults; the intelligence that powers all the agents
- Polymarket collector, Nansen CLI, and other tools are **workstations** — specialized equipment at each desk

---

## Floor Plan Layout

The newsroom occupies the full width of the section. It is a top-down 2D map viewed from a slight isometric or overhead angle. The rooms are arranged so that the data flow reads left-to-right and top-to-bottom — signal sources on the far left, output (X posts, Feed) on the far right, with the processing rooms in between.

**Room arrangement (left to right):**

```
[ Wire Room ]  →  [ Research Desk ]  →  [ Editorial Room ]  →  [ Broadcast Desk ]
                           ↕                      ↕
                    [ Archive Room ]         [ Brain Terminal ]
```

The Archive Room sits below the Research Desk and Editorial Room — both of them read from and write to it constantly. The Brain Terminal sits below or between the agent desks — every agent desk has a glowing cable or connection line running to it, visualizing that they all call the same LLM.

The rooms are separated by walls, hallways, or partitions — giving the map a sense of physical space. There are windows, decorative details (plants, whiteboards, pinned papers on walls), and ambient objects that reinforce the newsroom atmosphere without cluttering the functional layout.

---

## Visual Style

**Pixel art, top-down, 16x16 or 32x32 tile grid.** The aesthetic is classic RPG — think early Pokémon or Stardew Valley overhead view — but with a modern dark color palette that matches the landing page. Where classic pixel art RPGs use bright, saturated palettes, this uses the myboon palette: near-black backgrounds, muted mid-tones for floors and walls, accent colors from the design token system (greens for positive signals, reds for negative, whites for neutral text).

The pixel art can be implemented in several ways. In order of preference:
- CSS pixel art for simple geometric characters and objects (achievable with box-shadow techniques or SVG with `image-rendering: pixelated`)
- A small set of custom SVG sprites with `image-rendering: pixelated` applied so they render with hard pixel edges
- A royalty-free pixel art tileset adapted to the dark palette via CSS filters

The characters (agents) are small 16x32 pixel sprites — simple humanoid figures seated at desks or standing at workstations. They have idle animations: a subtle two-frame animation (one frame of the character leaning forward, one frame leaning back) on a slow loop. Each agent character has a distinct visual identifier — a different hat, color, or accessory — so they are distinguishable at a glance.

The environment tiles (floors, walls, desks, filing cabinets, terminals) should feel coherent as a set. The floor is a dark tile pattern. Walls have a slightly lighter border. Desks are wooden-tone rectangles. The Brain Terminal is a glowing screen or server rack with a pulsing green or blue light.

---

## Animation and Signal Flow

The most important animated element is the **signal flow**. Small particles — dots or dashes — travel along defined paths between rooms, visualizing data moving through the pipeline in real time (or in a looping simulation of real time).

- From Wire Room to Research Desk: a stream of small white/blue dots flowing along a path, representing incoming signals
- From Research Desk to Archive Room: slower, occasional dots representing narratives being saved (draft status)
- From Archive Room to Editorial Room: dots flowing upward, representing the publisher reading from the archive
- From Editorial Room to Archive Room: dots flowing back down, representing published narratives being written
- From Editorial Room to Broadcast Desk: dots representing the influencer picking up published narratives
- From every agent desk to the Brain Terminal: a pulsing line or occasional dot representing the LLM call

The particles do not need to be physically accurate. They run on a looping animation that simulates the real data flow. The timing should feel plausible: the Wire Room sends a steady trickle, the Research Desk processes in bursts, the Editorial Room publishes occasionally.

---

## Interactive Tooltips

Every major element in the map is hoverable. When the user hovers a room, character, or workstation, a tooltip or side panel appears explaining what that element does in plain language written for someone who does not know what LangGraph or PostgREST is.

**Example tooltip content:**

- **Wire Room** → "Every 5 minutes, we scan tracked Polymarket wallets for new bets. Every 2 hours, we scan for trending markets. Every 30 minutes, Nansen surfaces the most active prediction market events. All of this raw data lands here first."
- **Research Desk (Analyst)** → "The Analyst reads every unprocessed signal and groups them into clusters. A spike in UCL bets + a volume surge on Man City markets + a tracked wallet going big on the same outcome — that's one cluster. The Analyst scores it and decides if it's worth a narrative."
- **Editorial Room (Publisher + Senior Editor)** → "The Publisher writes the narrative: a punchy summary, a deep analysis, and a decision on how to frame it — is this a whale bet (fomo), a pattern across wallets (signal), or a real-world event driving market movement (news)? The Senior Editor reviews the draft and can send it back for revision. Anything scoring below 8/10 doesn't get published."
- **Archive Room (Supabase)** → "Every signal, narrative draft, and published piece is stored here. The Publisher checks this first before writing — if we already covered this story, we either skip it or write an update that references the original piece."
- **Brain Terminal (MiniMax)** → "The shared intelligence layer. Every agent in the newsroom calls this when they need to think — cluster signals, write narratives, review drafts, compose posts. It's a single LLM that all three layers use, prompted differently for each role."
- **Broadcast Desk (Influencer)** → "After something is published, the Influencer reads it and writes an X post. The post has to be under 280 characters, lead with the insight, and end with a soft hook back to the app. A human reviews every draft before it goes live."

The tooltip should appear as a small dark panel positioned near the hovered element — floating above the map rather than pushing layout. It should appear on a short delay (150ms) and fade in, so rapid mouse movement does not trigger flashing.

---

## Department and Element Taxonomy

This taxonomy defines how the pipeline is categorized visually and in all future additions. Following these rules ensures the map stays coherent as the product grows.

**Departments (rooms with walls and floor space):**
A department is a distinct functional area of the pipeline. Each department has a name label visible in the map (small pixel font, positioned above the room). Adding a new major function to the pipeline means adding a new department.
- Wire Room, Research Desk, Editorial Room, Broadcast Desk, Archive Room

**Agents (characters — humanoid sprites at desks):**
An agent is an LLM-powered process that reads input, reasons, and produces output. Each agent is one character. Adding a new LLM agent means adding one new character sprite to the appropriate department.
- Analyst (Research Desk), Publisher (Editorial Room), Critic/Senior Editor (Editorial Room — a second character at a separate desk), Influencer (Broadcast Desk)

**Tools (workstation objects — non-humanoid, equipment-style sprites):**
A tool is an external API or service that an agent uses — not the agent itself, but the instrument. Tools appear as desk equipment: a monitor, a terminal, a specialized machine. Adding a new tool means adding a new workstation object to the relevant department.
- Polymarket Client (Wire Room workstation), Nansen CLI (Wire Room workstation), MiniMax Terminal (Brain Terminal — shared), Supabase Client (Archive Room — the filing cabinet interface)

**Data stores (physical storage objects):**
A data store is a Supabase table or other persistence layer. Represented as filing cabinets with labeled drawers, bookshelves, or server racks. Each major table gets a labeled drawer.
- Signals table → a filing cabinet drawer labeled "Signals"
- Narratives table → a filing cabinet drawer labeled "Narratives"
- Published Narratives → a filing cabinet drawer labeled "Published"
- X Posts → a filing cabinet drawer labeled "Drafts"

**Connections (animated paths between elements):**
Every data flow between departments is a visible path on the floor — like a cable or hallway marked with directional arrows. Signal particles travel along these paths.

---

## Section Framing

Above the RPG map, a short section header — something like "How the feed is built" or "Inside the newsroom." One sentence of supporting copy beneath: "Three layers of agents, running continuously, turning raw prediction market signals into publishable intelligence."

Below the map (or to the side on wide screens), a simple legend listing what each visual element type means — a small agent sprite icon labeled "Agent", a workstation icon labeled "Tool", a filing cabinet icon labeled "Data", so new visitors understand the visual grammar immediately.

---

## Extensibility Rules

The map must be designed so that future additions do not require redesigning the layout. These rules govern future growth:

1. New **agents** slot into existing department rooms as additional character sprites at new desks — the room simply becomes more populated
2. New **tools** slot into existing department rooms as additional workstation objects at the edges of the room
3. New **departments** (e.g. a Kalshi collector room, an on-chain signal room) appear as new rooms added to the left of the Wire Room, extending the map leftward without displacing anything existing
4. New **data stores** appear as additional labeled drawers in the Archive Room
5. The signal flow paths between rooms are explicitly defined as a data structure (an array of connection objects), not hardcoded CSS — so adding a new room means adding entries to this array rather than touching layout code

---

## Acceptance Criteria

- [ ] Workflow section renders below the hero section on the landing page
- [ ] The full newsroom map is visible on desktop without horizontal scrolling
- [ ] All five departments (Wire Room, Research Desk, Editorial Room, Broadcast Desk, Archive Room) are present and labeled
- [ ] Agent characters are visible in their respective departments with idle animations (minimum 2-frame loop)
- [ ] Signal flow particles animate continuously along the defined paths between departments
- [ ] Every room, agent, and major workstation is hoverable and surfaces a tooltip with plain-language description
- [ ] Brain Terminal is visually distinct and has connection lines to each agent department
- [ ] The Archive Room shows labeled drawer/cabinet representations of the four main tables (Signals, Narratives, Published, Drafts)
- [ ] A legend is present explaining agent, tool, and data visual grammar
- [ ] Adding a new agent or tool requires only adding to a data/config array — not modifying layout components directly
- [ ] Section header and one-sentence copy are present above the map
- [ ] On mobile viewports, the map is horizontally scrollable (not collapsed/hidden) — the pixel art remains legible at smaller sizes
