# Claude Code Instructions — pnldotfun

## gstack

gstack is installed at `~/.claude/skills/gstack/`. Use these skills for the tasks listed below.

**Web browsing**: Always use `/browse` from gstack for any web browsing tasks. Never use `mcp__claude-in-chrome__*` tools.

### Available skills

| Skill | Purpose |
|---|---|
| `/office-hours` | 6 forcing questions before writing a PRD |
| `/autoplan` | CEO → design → eng review in one pass |
| `/plan-ceo-review` | Product thinking and 10-star feature discovery |
| `/plan-eng-review` | Architecture, data flow, diagrams, and tests |
| `/plan-design-review` | Design audit rated 0-10 with interactive feedback |
| `/design-consultation` | Build complete design systems from scratch |
| `/design-shotgun` | Generate multiple design variants for comparison |
| `/design-html` | Convert mockups to production HTML |
| `/design-review` | Design audit + fixes |
| `/review` | Find bugs that pass CI but fail in prod |
| `/cso` | OWASP Top 10 + STRIDE threat model security review |
| `/qa` | Test app, find bugs, fix them |
| `/qa-only` | Report bugs without code changes |
| `/investigate` | Systematic root-cause debugging |
| `/ship` | Sync main, run tests, audit coverage, open PR |
| `/land-and-deploy` | Merge PR, wait for CI, verify prod health |
| `/canary` | Post-deploy monitoring for errors and regressions |
| `/benchmark` | Baseline page load times and Core Web Vitals |
| `/browse` | Real Chromium browser automation |
| `/connect-chrome` | Launch Chrome with Side Panel agent |
| `/setup-browser-cookies` | Import cookies from real browser |
| `/setup-deploy` | One-time deploy configuration |
| `/retro` | Weekly structured retrospective |
| `/document-release` | Update all project docs to match shipped changes |
| `/learn` | Manage learned patterns and pitfalls across sessions |
| `/codex` | Independent code review via OpenAI Codex |
| `/careful` | Warn before destructive commands |
| `/freeze` | Lock edits to one directory |
| `/guard` | careful + freeze combined |
| `/unfreeze` | Remove freeze boundary |
| `/gstack-upgrade` | Self-update gstack |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
