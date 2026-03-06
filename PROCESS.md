# PROCESS.md — pnldotfun Development Process

## How We Work

Lean, discussion-first workflow. No formal milestones or weekly cadence.

---

## Task Flow

```
Discuss + plan in chat
        ↓
Write issue PRD → docs/issues/
        ↓
Coder subagent implements
        ↓
Reviewer subagent checks (REQUIRED before every commit)
        ↓
Commit + push only if reviewer passes
```

---

## Reviewer Rules (non-negotiable)

Before every commit the reviewer subagent must verify:

1. No hardcoded credentials, API keys, tokens, or passwords
2. No `.env` files staged
3. Code matches the task description
4. No obvious bugs or regressions

If anything fails → fix first, reviewer runs again. Nothing reaches remote without passing.

---

## Key Docs

| Doc | Purpose |
|-----|---------|
| `docs/ARCHITECTURE.md` | Product vision, system design, brain layers, decisions log — read at session start |
| `docs/issues/` | PRDs for individual tasks — context for coder subagents |
| `CHANGELOG.md` | History of what shipped |

---

## Rules

1. No coding without a clear task description
2. Reviewer subagent runs before every commit — no exceptions
3. All credentials in `.env` files only — never in code
4. One issue = one focused task
5. `docs/ARCHITECTURE.md` is the source of truth for product direction