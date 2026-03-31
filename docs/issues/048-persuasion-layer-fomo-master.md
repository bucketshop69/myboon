# #048 — Cialdini Persuasion Layer: fomo_master Writer + Broadcaster Upgrade

## Problem

The `fomo_master` pipeline produces content that no one has seen yet — zero posts have
gone live. The broadcaster correctly rejects for duplicate topic, but the underlying
writer prompts have a different problem: they're written for pro analysts, not the actual
target audience (meme traders, prediction market participants looking for quick news).

Three specific failures:

1. **Writer prompt is analytical, not FOMO-driven.** "Sound like a pro analyst" is the
   wrong voice for an audience that moves on social proof, urgency, and narrative — not DCF
   models. Different signal shapes (contrarian bet, cluster, authority wallet, fresh wallet)
   all get the same generic instruction to lead with numbers and be specific. That's correct
   but incomplete.

2. **Broadcaster counts rejections as frequency.** The broadcaster receives the full
   timeline including rejected drafts. "Iran posted 15 times this week" triggers hard
   reject even when every prior occurrence was itself rejected and never posted. The
   frequency gate should apply to **posted** content, not the rejection archive.

3. **Duplicate detection is too coarse.** Same market ≠ same story. A contrarian bet,
   a cluster bet, and a resolution angle on the same market are three different pieces of
   content. The current broadcaster has no concept of angle — it only knows topic.

## Goal

Apply Cialdini's influence principles as signal-type-specific persuasion frames in the
writer prompt, and upgrade the broadcaster to use angle-fingerprint duplicate detection
instead of topic-only frequency counting.

Two phases delivered as one issue:

| Phase | Label | What |
|-------|-------|------|
| C | Playbook | Write `PERSUASION_PLAYBOOK` const — 5 archetypes + example posts, injected into writer prompt |
| A | Prompt Rewrite | Rewrite `WRITER_SYSTEM_PROMPT` + `BROADCASTER_SYSTEM_PROMPT`; add `slug` + `archetype` to draft data flow |

## Dependencies

- Blocks: none
- Builds on: #047 (fomo_master graph — all graph nodes already exist)
- No DB migrations required

---

## Scope

**Files to change — one file:**

- `packages/brain/src/graphs/fomo-master-graph.ts`
  - New: `PERSUASION_PLAYBOOK` string constant
  - Changed: `WRITER_SYSTEM_PROMPT` — inject playbook + archetype classification
  - Changed: `BROADCASTER_SYSTEM_PROMPT` — angle fingerprinting + status bug fix
  - Changed: `PendingDraft` interface — add `slug` and `archetype` fields
  - Changed: `writeNode` — writer outputs `archetype` in JSON; node attaches `slug` from signal metadata
  - Changed: `broadcastNode` — passes `{ signal_id, draft_text, slug, archetype }` per draft

**Out of scope:**
- `influencer-graph.ts` — kept analytical for now (different audience: published narrative readers)
- No new graph nodes — this is purely a prompt + data flow change
- `resolution_agent` — separate future issue (blocked on Polymarket CLOB settlement API verification)

---

## Architecture

### Signal Archetype Classification

The writer classifies each signal before writing. Classification is deterministic based on
signal data — priority order (first match wins):

| Priority | Archetype | Condition |
|----------|-----------|-----------|
| 1 | `CONTRARIAN` | `live_odds < 0.30` — betting heavily against consensus |
| 2 | `CLUSTER` | `cluster_context.signal_count >= 3` — multiple wallets, same market, <4h |
| 3 | `AUTHORITY` | `nansen_profile.win_rate >= 0.6` AND `nansen_profile.trade_count >= 10` |
| 4 | `FRESH_WALLET` | `nansen_profile` null OR `nansen_profile.trade_count < 3` |
| 5 | `GENERAL` | Fallback |

`TIME_SENSITIVE` is a **modifier**, not a primary archetype. If the market question text
contains a specific date that appears to be within 48 hours (the LLM infers this from the
question text — e.g. "by March 31", "before April 1"), the writer adds urgency framing
("Xh left", "resolves tonight") to any archetype's post.

Note: `FRESH_WALLET` will be the most common archetype in practice — most wallets tracked
don't have Nansen coverage. This is correct: the curiosity gap frame works well for
unknown entities.

### Data Flow Change

The writer outputs `archetype` in its JSON response. The write node then attaches `slug`
from `signal.metadata.slug` (deterministic — not from LLM). Both fields travel with the
draft through `drafts_pending[]` to the broadcaster.

```
writeNode:
  LLM returns: { drafts: [{ signal_id, draft_text, reasoning, archetype }] }
  code adds:   slug = ranked_signals.find(s => s.id === signal_id)?.metadata?.slug ?? ''
  PendingDraft gets: { ..., slug, archetype }

broadcastNode:
  sends to LLM: { signal_id, draft_text, slug, archetype }
  NOT: LLM infers slug from 280-char post text (unreliable)
```

### Angle Fingerprint

An angle is: `{slug}:{archetype}` — e.g. `iran-ceasefire:CONTRARIAN`.

Broadcaster duplicate logic (replacing current "same market 3+ times" rule):

```
hard reject if:
  - same {slug}:{archetype} appears in full_timeline WHERE status = 'posted' in last 24h
  - (resolution exception: see below)

approve:
  - same slug, different archetype = fresh angle → approve
  - same slug, same archetype, but >24h since last posted = approve
  - no prior posted content on this slug = approve
```

**Status bug fix:** The broadcaster currently receives `full_timeline` containing all
statuses (posted, draft, rejected). It should only count `status='posted'` records toward
frequency limits. The broadcaster system prompt must be explicit: "Count only posts where
status='posted' toward frequency limits. Rejected drafts do not count — they were never
published."

**Resolution angle rule (future-proofing):** `{slug}:RESOLUTION` is always approved once
per slug (first resolution post per market). Second resolution post for same slug = hard
reject. Resolution posts come from the future `resolution_agent` (not this issue).

---

## The Persuasion Playbook (Approach C)

`PERSUASION_PLAYBOOK` is a string constant injected into `WRITER_SYSTEM_PROMPT` as
few-shot examples. It lives in `fomo-master-graph.ts` (or an adjacent
`packages/brain/src/prompts/fomo-master.ts` file if the prompt grows too large).

### Five Archetypes — Lead Formulas

| Archetype | Primary Principle | Lead Formula |
|-----------|------------------|--------------|
| CONTRARIAN | Loss Aversion + Contrast | "The crowd says X. This wallet just bet $Y the other way." |
| CLUSTER | Social Proof | "N wallets. N hours. $X. Same direction. That's not random." |
| AUTHORITY | Authority + Credibility | "A wallet with X% win rate just moved." |
| FRESH_WALLET | Curiosity Gap + FOMO | "Zero history. First bet ever: $X on [market]." |
| GENERAL | Urgency (fallback) | Lead with the largest number or most specific detail. |

TIME_SENSITIVE modifier (any archetype): add "Xh left" or "resolves [day]" when expiry is
detectable from the market question text.

### Examples Per Archetype

**CONTRARIAN:**
```
GOOD: "The market says 90% YES on Iran ceasefire. One wallet just bet $38K on the
other side. One of you is wrong."

GOOD: "Everyone is buying Iran peace by March 31. A wallet that's barely traded
before is paying 12:1 odds to disagree. Either they know something, or they're
about to lose $22K."

GOOD: "$14K against an 88% consensus. This wallet has 0 trades on record.
That's either very dumb or very informed."

BAD: "A wallet bet $14K NO on Iran ceasefire by March 31. Odds currently sit
at 88% YES." [No tension. Just a data point.]
```

**CLUSTER:**
```
GOOD: "3 wallets. 4 hours. $628K. All YES on Iran ceasefire. When smart money
moves in consensus, retail is always last to know."

GOOD: "5 separate wallets have bet the same market today. Total: $1.2M. None
connected on-chain. The thesis is converging."

BAD: "Multiple wallets have placed bets on the Iran ceasefire market today
totaling $628K." [Social proof without the frame — reads like a market summary.]
```

**AUTHORITY:**
```
GOOD: "A wallet with a 71% win rate just bet $14K on Trump tariff escalation.
Third bet on this market this week — total exposure now $38K."

GOOD: "The wallet that called the Fed pause two weeks early just moved on
Bitcoin. $22K. 68% win rate. 23 bets. That's not a tourist."

BAD: "An experienced wallet with a good track record has placed a bet."
[Vague authority is no authority.]
```

**FRESH_WALLET:**
```
GOOD: "Zero history on this wallet. No bets on record. First move ever: $67K
on Israel ground offensive in Lebanon. That's how insiders open."

GOOD: "Brand new wallet. First bet. $50K. The question isn't whether they're
right — it's why someone made this their opening position."

BAD: "A brand-new wallet with no history placed a $67K bet on an Israeli ground
offensive in Lebanon by March 31." [States facts, doesn't create the gap.]
```

**TIME_SENSITIVE (modifier example):**
```
GOOD (FRESH_WALLET + TIME_SENSITIVE):
"Zero history on this wallet. First bet: $22K on US-Iran ceasefire. 38 hours
until this resolves. That's when we find out if they knew something."

GOOD (CLUSTER + TIME_SENSITIVE):
"3 wallets. 4 hours. $628K. All YES on Iran ceasefire. Resolves tonight.
Smart money is already in."
```

---

## Prompt Specifications

### WRITER_SYSTEM_PROMPT (rewrite)

Structure of the new prompt:

```
[Role]
You are the writer for a financial intelligence X account targeting prediction market
traders. Your audience moves on FOMO and social proof — not analytical depth. They
want to feel like they're about to miss something. Write posts that create that feeling.

[Classification]
Before writing each post, classify the signal as one of: CONTRARIAN | CLUSTER |
AUTHORITY | FRESH_WALLET | GENERAL. Use the signal data to classify (priority order
defined below). Output the archetype in your JSON response.

[Priority order for classification]
1. CONTRARIAN: live_odds < 0.30 (betting heavily against consensus)
2. CLUSTER: 3+ wallets bet same market in last 4h
3. AUTHORITY: wallet win_rate >= 60% AND trade_count >= 10
4. FRESH_WALLET: no nansen_profile OR trade_count < 3
5. GENERAL: fallback

[TIME_SENSITIVE modifier]
If the market question text mentions a specific date that appears to be within 48 hours,
add urgency to any post: "Xh left" or "resolves tonight" or "resolves [day]". The LLM
knows today's date.

[Persuasion framework — lead formulas per archetype]
[... inject PERSUASION_PLAYBOOK examples here ...]

[Hard rules]
- Lead with the most specific signal-appropriate detail per archetype (see formulas above)
- Max 280 characters (enforced in code — do not count)
- No hashtags, no threads
- Max 1 emoji per post, only if it adds urgency: 🚨 ⚡ 💰
- NEVER write "Full context in the feed." or any CTA — the post must stand alone
- NEVER be vague about wallet history — use the actual nansen_profile data
- Do NOT include the Polymarket URL (appended in code)

[Output JSON]
{
  "drafts": [
    {
      "signal_id": "uuid",
      "archetype": "CONTRARIAN | CLUSTER | AUTHORITY | FRESH_WALLET | GENERAL",
      "draft_text": "...",
      "reasoning": "why this archetype, what you led with"
    }
  ]
}
```

### BROADCASTER_SYSTEM_PROMPT (rewrite)

Structure of the new prompt:

```
[Role]
You are the chief broadcaster for a financial intelligence X account. You review
draft posts as a batch before any are saved.

[You will receive]
Each draft includes: signal_id, draft_text, slug (the Polymarket market slug),
archetype (the persuasion frame the writer used). You also receive the last 7 days
of x_posts history for duplicate and frequency detection.

[Critical: count only POSTED content toward frequency limits]
The timeline includes posts with status: posted, draft, rejected.
Only count status='posted' posts toward frequency limits.
Rejected drafts were never published — do not treat them as coverage.

[Duplicate detection — angle fingerprint]
An angle is: {slug}:{archetype}. Same market, different archetype = DIFFERENT angle.
Hard reject only if:
- The same {slug}:{archetype} combination has been POSTED in the last 24h
- OR the same slug has been posted 3+ times this week with the SAME archetype

Approve:
- Same slug, different archetype = fresh angle
- Same slug, same archetype, but >24h since last posted occurrence

[Hard reject triggers]
- Same {slug}:{archetype} posted in last 24h
- Contains "Full context in the feed." or any CTA
- No specific dollar amounts in the post

[Soft reject triggers]
- Wallet description is vague — must name win rate, PnL, or trade count
- Most compelling number is buried — it should be in the first line
- Wrong archetype for the signal data (e.g. CLUSTER framing for a single wallet)
- Tone is hype-y

[Soft reject edits]
Provide as [{ issue, fix }] pairs. The fix is directional — tell the writer what
to change, not how to write it.
Example: { "issue": "buried the win rate", "fix": "lead with 71% win rate before
the dollar amount" }

[Output JSON]
{
  "reviews": [
    {
      "draft_id": "signal_id",
      "decision": "approved | soft_reject | hard_reject",
      "reasoning": "...",
      "edits": [{ "issue": "...", "fix": "..." }]
    }
  ]
}
```

---

## Interface Changes

### `PendingDraft` — add slug and archetype

```ts
interface PendingDraft {
  signal_id: string
  draft_text: string
  reasoning: string
  attempt: number
  edits: Array<{ issue: string; fix: string }>
  last_broadcaster_reasoning: string | null
  slug: string          // from signal.metadata.slug — attached by writeNode, not LLM
  archetype: string     // from LLM output in writer response
}
```

### `WriterOutput` — add archetype to drafts

```ts
interface WriterOutput {
  drafts: Array<{
    signal_id: string
    archetype: string     // NEW
    draft_text: string
    reasoning: string
  }>
}
```

### `writeNode` — slug attachment

After parsing the writer's JSON output, the write node enriches each draft with `slug`:

```ts
const signalMap = new Map(state.ranked_signals!.map((s) => [s.id, s]))

const newPending: PendingDraft[] = parsed.drafts.map((d) => {
  const signal = signalMap.get(d.signal_id)
  const slug = (signal?.metadata?.slug as string | undefined) ?? ''
  const prev = pendingMap.get(d.signal_id)
  return {
    signal_id: d.signal_id,
    draft_text: d.draft_text,
    reasoning: d.reasoning,
    archetype: d.archetype,
    slug,
    attempt: prev?.attempt ?? 0,
    edits: [],
    last_broadcaster_reasoning: null,
  }
})
```

### `broadcastNode` — pass slug + archetype to LLM

```ts
const response = await callMinimax(
  [{
    role: 'user',
    content: JSON.stringify({
      drafts: state.drafts_pending.map((p) => ({
        signal_id: p.signal_id,
        draft_text: p.draft_text,
        slug: p.slug,            // NEW
        archetype: p.archetype,  // NEW
      })),
      full_timeline: state.full_timeline,
    }),
  }],
  [],
  BROADCASTER_SYSTEM_PROMPT,
  { temperature: 0.3 }
)
```

---

## Acceptance Criteria

- [ ] `PERSUASION_PLAYBOOK` const exists in `fomo-master-graph.ts` (or prompts file) with
      all 5 archetypes and GOOD/BAD examples
- [ ] `WRITER_SYSTEM_PROMPT` injects `PERSUASION_PLAYBOOK` examples inline
- [ ] Writer prompt includes archetype priority order (CONTRARIAN → CLUSTER → AUTHORITY
      → FRESH_WALLET → GENERAL)
- [ ] Writer prompt includes TIME_SENSITIVE modifier instructions
- [ ] `WriterOutput` interface includes `archetype` field
- [ ] `PendingDraft` interface includes `slug` (string) and `archetype` (string) fields
- [ ] `writeNode` attaches `slug` from `signal.metadata.slug` after parsing LLM output
      (not from LLM — deterministic)
- [ ] `broadcastNode` sends `{ signal_id, draft_text, slug, archetype }` per draft
- [ ] `BROADCASTER_SYSTEM_PROMPT` uses angle fingerprint logic: `{slug}:{archetype}` as
      the duplicate unit
- [ ] `BROADCASTER_SYSTEM_PROMPT` explicitly states: count only `status='posted'` records
      toward frequency limits, not rejected drafts
- [ ] Broadcaster hard rejects only on same `{slug}:{archetype}` posted in last 24h
      (not on same slug regardless of archetype)
- [ ] `resolveNode` and `saveNode` carry `slug` and `archetype` through without dropping them
- [ ] Spot check: a CONTRARIAN draft leads with tension framing ("The crowd says X...")
- [ ] Spot check: a FRESH_WALLET draft leads with curiosity gap ("Zero history...")
- [ ] Spot check: a CLUSTER draft leads with social proof ("N wallets. N hours. $X.")
- [ ] Broadcaster approves a draft about a slug that has prior REJECTED posts (status bug fix)
- [ ] No "Full context in the feed." or CTA in any output — hard reject catches it

## Testing

Run fomo_master manually after prompt changes (`pnpm --filter @myboon/brain fomo-master:start`).
Check the `x_posts` table — approved drafts should show archetype-appropriate lead lines.
The broadcaster_reasoning on approved posts should reference slug + archetype.

If no live signals are available for testing, write a unit test in
`packages/brain/src/__tests__/` that calls `writeNode` with a mock CONTRARIAN signal
(odds=0.20) and asserts the output contains tension framing.
