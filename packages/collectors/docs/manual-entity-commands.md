# Manual Entity commands

Trusted dashboard, Codex, CLI, and agent inputs use the same Entity Manager
service as the automated News and Polymarket paths. Clients never write Supabase
tables directly.

```text
News / Polymarket extraction ─┐
Dashboard / Codex / agents ───┼─> EntityService ─> entities + entity_memories
                              └─> source_marker audit record
```

The core service is `src/entity-manager/entity-service.ts`. Manual input is
normalized by `src/entity-manager/manual-adapter.ts`. The internal API only
provides authenticated transport.

## HTTP flow

Both endpoints require `Authorization: Bearer $INTERNAL_ENTITY_WRITE_TOKEN`.

1. `POST /internal/entity-commands/preview` with `{ "command": ... }`.
2. Review the returned Entity action, field changes, memory actions, and warnings.
3. Send the returned normalized `command` and `planHash` to
   `POST /internal/entity-commands/apply`.

Apply rejects stale plans. `requestId` is the idempotency key: retrying the same
normalized command returns the previously applied Entity, while reusing that ID
for different content is rejected.

```json
{
  "command": {
    "requestId": "manual-unique-request-id",
    "actor": { "kind": "codex", "name": "Codex" },
    "entity": {
      "name": "US and Iran",
      "type": "geopolitical_topic",
      "aliases": ["US–Iran"],
      "summary": "An evolving geopolitical relationship.",
      "showInCarousel": true
    },
    "memories": [
      {
        "memoryType": "timeline_event",
        "title": "Internal event title",
        "summary": "A concise, neutral timeline description.",
        "body": "Optional deeper internal research.",
        "eventAt": "2026-06-01T00:00:00.000Z",
        "sourceLabel": "Research source",
        "sourceUrl": "https://example.com/source"
      }
    ]
  }
}
```

Manual events are stored with `source = manual`; actor and source details remain
in internal context. The audit marker is a `source_marker`, so it is excluded
from public Story timelines.
