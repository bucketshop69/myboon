# News Entity Loop

This local/VPS loop runs the news lane through entity manager only:

```sh
pnpm --dir packages/collectors news:run
pnpm --dir packages/collectors entity-manager:news
```

The helper script repeats that sequence every 2 hours by default and uses a lock directory under `packages/collectors/.data/` so overlapping ticks skip instead of running concurrently.

```sh
bash packages/collectors/scripts/news-entity-loop.sh
```

For a single manual tick:

```sh
bash packages/collectors/scripts/news-entity-loop.sh --once
```

Runtime knobs:

```sh
NEWS_ENTITY_LOOP_INTERVAL_SECONDS=7200
NEWS_RUNNER_BATCH_SIZE=1
ENTITY_MANAGER_NEWS_BATCH_SIZE=20
```

Example systemd user service:

```ini
[Unit]
Description=myboon news entity loop

[Service]
Type=simple
WorkingDirectory=/srv/myboon
ExecStart=/usr/bin/env bash packages/collectors/scripts/news-entity-loop.sh
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
```

Local laptop runs stop when the machine sleeps.
