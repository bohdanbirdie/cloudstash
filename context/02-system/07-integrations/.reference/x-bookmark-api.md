# X bookmark API behavior used by Cloudstash

Source: [X Bookmarks by User](https://docs.x.com/x-api/users/bookmarks/introduction),
[X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), and
provider reports linked from
[`docs/features/x-bookmark-sync.md`](../../../../docs/features/x-bookmark-sync.md);
reviewed 2026-08-13. Official guarantees and community observations must be
revalidated independently when provider policy changes.

## Relevant Facts

- The bookmark endpoint exposes pagination and field selection but no
  `since_id`, time range, or bookmark-created timestamp.
- Response order is the only usable recency signal for bookmarks.
- The official endpoint exposes only the recent bookmark window (documented as
  roughly 800); older history cannot be recovered through that API.
- `max_results=100` has produced missing pagination tokens in provider reports;
  Cloudstash uses 50 while walking.
- Per-user OAuth rate limits permit the current 30-second probe cadence, but
  401/402/429 require distinct recovery behavior.
- Provider pricing and limits can change and must be revalidated before changing
  polling/import policy.

## Intent Impact

These facts constrain [CS.SYS.INT-C02](../requirements.md), connect-time
watermark pinning, no full-history promise, conservative pagination, and the rule
that a partial walk cannot advance the watermark.
