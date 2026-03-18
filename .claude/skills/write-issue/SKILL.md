---
name: write-issue
description: Write a new PRD issue file to docs/issues/ following the project's established format. Use when planning a new feature, fix, or improvement. Pass the issue number and title as args (e.g. /write-issue 037 Feed content types).
---

Write a new issue PRD for this project.

## Instructions

1. Read `docs/ARCHITECTURE.md` to understand current system state.
2. Read 2-3 of the most recent issues in `docs/issues/` (highest numbered files) to internalize the exact format and level of detail expected.
3. Read `CHANGELOG.md` briefly to understand what has already shipped.
4. If ARGUMENTS are provided, use them as the issue number and title. If no arguments, ask the user for the issue number and title before proceeding.
5. Ask the user for any context needed to write the issue that isn't already clear from the conversation history or codebase. Keep questions minimal — infer what you can.
6. Write the PRD to `docs/issues/<number>-<kebab-title>.md` following the format below exactly.

## Format

```markdown
# #<number> — <Title>

## Problem

What is broken, missing, or suboptimal? Be specific. Reference actual behaviour observed in code or DB if relevant.

## Goal

What does done look like? 1-3 concrete outcomes.

## Dependencies

- Blocked by: #XXX (if applicable)
- Blocks: #XXX (if applicable)
- None (if standalone)

## Scope

List every file that will be created or modified:
- `path/to/file.ts` — what changes
- `path/to/other.ts` — what changes

## DB Migration

(Include this section only if schema changes are needed.)

Run manually via Supabase SQL editor:

\`\`\`sql
-- migration SQL here
\`\`\`

## Changes

Numbered list of changes. Each change should include:
- What to build
- Exact TypeScript interface or function signature where helpful
- Specific logic (not vague — show the shape of the code, not just "add a function")

### 1. <Change title>

...

### 2. <Change title>

...

## Acceptance Criteria

- [ ] Specific, testable outcome
- [ ] Another specific outcome
```

## Rules

- Match the level of detail in existing issues exactly — include real TypeScript snippets, exact field names, specific SQL.
- Do not add sections that don't exist in the format above.
- Do not write vague acceptance criteria ("it works") — every criterion must be checkable by reading DB output or running a command.
- If the issue involves a new LLM prompt or tool, write out the actual prompt text or tool schema, not a description of it.
- File name: `docs/issues/<zero-padded-number>-<kebab-case-title>.md`
