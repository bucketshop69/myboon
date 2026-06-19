# Hermes Profile Experiment

This note captures the Hermes profile experiment in plain language. It is only about how we shaped the agent profiles and the lightweight team system around them.

## What We Tried

The goal was to see whether Hermes profiles could act like a small support team around a solo founder/developer workflow.

Instead of using agents as random helpers, we shaped them into scoped team members. Each profile has a clear area, a point of view, and rules for how it should interact with the board and the rest of the team.

The important shift was this:

- Bibhu still makes the final decisions.
- Agents do not autonomously decide product direction.
- Agents help notice gaps, suggest useful work, ask questions, and refine ideas into clearer execution.
- Hermes Kanban is the shared workspace.
- The repository is context, not the place where these agents keep their internal planning notes.

## Profile Shape

The profile system is team-based:

- Feed team profile
- Markets team profile
- Wallet team profile
- Engineering Manager profile
- Software Engineer profile

The Feed, Markets, and Wallet profiles are meant to think from their own area. They can look at the repo, docs, mockups, and outside research, but they should stay inside their lane unless another team is clearly affected.

The Engineering Manager profile is different. Its job is to read the team ideas, check whether they are practical, ask follow-up questions, and help turn useful ideas into scoped work.

## How The Board Works

Hermes Kanban became the main place where the agents coordinate.

The board is not just a task list. It is the shared memory of what the team is discussing.

The working rule is:

- Agents can comment on relevant cards.
- Agents can propose new triage items.
- Agents should not move work forward without Bibhu's signal.
- Bibhu decides what becomes real work.
- The Engineering Manager can help turn approved ideas into clearer engineering tasks.

This keeps control with the founder while still letting the agents contribute useful thinking.

## How We Scoped The Agents

We changed the profiles so they do not behave like general-purpose agents.

Each profile should:

- Know which team it belongs to.
- Check the board before inventing new work.
- Avoid repeating old comments.
- Avoid commenting on another team's work unless the connection is important.
- Use the repo and docs for context.
- Use web research when it would improve judgment.
- Produce useful, concrete comments instead of long abstract essays.

This matters because without scope, agents spend tokens discussing everything. With scope, they behave more like team members.

## Cost And Quality Lessons

The first cron runs were useful but too expensive.

The main problem was not the final answer length. The cost came from agents repeatedly scanning too much context and trying to inspect too much of the board/repo every run.

We adjusted the setup toward:

- Lower reasoning for most team profiles.
- Medium reasoning for the Engineering Manager.
- Smaller outputs.
- Less cross-team commenting.
- Longer cron intervals.
- Kanban-first behavior.
- No repo journal files for agent memory.

The lesson is that quality comes from better profile scope, not from letting every profile think broadly all the time.

## What Worked

The most useful pattern was:

1. A focused team profile proposes or comments on something in its area.
2. The Engineering Manager reviews whether it is actionable.
3. Bibhu decides whether to move it forward.
4. A developer agent or Codex session can implement the approved work.

This matches the way the real workflow is moving: less manual coding, more orchestration, review, and prioritization.

## Current State

This is still an experiment, not a finished operating system.

The strongest version is:

- Team profiles generate focused product/technical thinking.
- Hermes Kanban stores the discussion.
- Engineering Manager turns good ideas into execution shape.
- Bibhu keeps final approval.
- Developer agents execute approved tasks.

The system should stay simple. The goal is not to create a fake company. The goal is to give a solo founder a lightweight team-like thinking layer without losing control.

## Next Improvements

The next useful improvements are:

- Give each team profile better skills for its area.
- Give agents a better way to see the actual app experience, not only code.
- Improve templates for triage comments and proposed work.
- Keep cron runs narrower and cheaper.
- Move long-running Hermes work to the VPS when the setup is stable.

The experiment showed that Hermes profiles can be useful, but only when they are scoped like real team members and grounded in Kanban.
