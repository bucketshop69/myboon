# Fetching Markets — Three Strategies

## 1. By Slug (specific market/event)

```bash
# Event by slug
curl "https://gamma-api.polymarket.com/events?slug=fed-decision-in-october"
curl "https://gamma-api.polymarket.com/events/slug/fed-decision-in-october"

# Market by slug
curl "https://gamma-api.polymarket.com/markets?slug=fed-decision-in-october"
curl "https://gamma-api.polymarket.com/markets/slug/fed-decision-in-october"
```

## 2. By Tags (category/sport filtering)

```bash
# Discover tags
GET /tags
GET /sports  # sports-specific metadata, tag IDs, series info

# Filter by tag
curl "https://gamma-api.polymarket.com/events?tag_id=100381&limit=10&active=true&closed=false"
curl "https://gamma-api.polymarket.com/events?tag_id=100381&related_tags=true&active=true&closed=false"
```

## 3. Via Events Endpoint (all active markets)

```bash
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100"

# Highest volume
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=100"
```

### Key Parameters

| Parameter   | Description |
|-------------|-------------|
| `order`     | `volume_24hr`, `volume`, `liquidity`, `start_date`, `end_date`, `competitive`, `closed_time` |
| `ascending` | Sort direction. Default: `false` |
| `active`    | Filter by active status |
| `closed`    | Default: `false` |
| `limit`     | Results per page |
| `offset`    | Pagination offset |

## Pagination

```bash
# Page 1
curl ".../events?active=true&closed=false&limit=50&offset=0"
# Page 2
curl ".../events?active=true&closed=false&limit=50&offset=50"
```

## Best Practices

1. Individual markets: slug method
2. Category browsing: tag filtering
3. Complete discovery: events endpoint with pagination
4. Always include `active=true` for live markets
5. Use events endpoint — events contain their associated markets
