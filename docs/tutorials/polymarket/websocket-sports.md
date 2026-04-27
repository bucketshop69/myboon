# Sports WebSocket

> Live sports scores and game state. No auth required.

## Endpoint

```
wss://sports-api.polymarket.com/ws
```

No subscription message needed — connect and receive all active sports events.

## Heartbeat

Server sends `ping` every 5s. Respond with `pong` within 10s.

```javascript
ws.onmessage = (event) => {
  if (event.data === "ping") {
    ws.send("pong");
    return;
  }
  // Handle JSON messages...
};
```

## Message: sport_result

Emitted when: match goes live, score changes, period changes, match ends, possession changes.

```json
{
  "gameId": 19439,
  "leagueAbbreviation": "nfl",
  "slug": "nfl-lac-buf-2025-01-26",
  "homeTeam": "LAC",
  "awayTeam": "BUF",
  "status": "InProgress",
  "score": "3-16",
  "period": "Q4",
  "elapsed": "5:18",
  "live": true,
  "ended": false,
  "turn": "lac"
}
```

`slug` format: `{league}-{team1}-{team2}-{date}`
`finished_timestamp` only present when `ended: true`

## Cricket Periods

| Period | Description |
|--------|-------------|
| `1H`   | First innings home |
| `1A`   | First innings away |
| `2H`   | Second innings home |
| `2A`   | Second innings away |
| `SO`   | Super Over |
| `FT`   | Full time |

## Soccer Status Values

| Status | Description |
|--------|-------------|
| `Scheduled` | Not yet started |
| `InProgress` | Currently playing |
| `Break` | Halftime or break |
| `Suspended` | Suspended |
| `PenaltyShootout` | Penalties |
| `Final` | Completed |
| `Awarded` | Result awarded |
| `Postponed` | Postponed |
| `Canceled` | Canceled |
