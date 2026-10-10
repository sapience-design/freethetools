# 9. Sampling at scale and ceilings on counts

Date: 2026-10-10 · Status: accepted (decided by Sapience Design) · Extends [ADR 0007](0007-visits-and-outcomes.md)

## Context

[ADR 0007](0007-visits-and-outcomes.md) noted that the free Workers and D1 limits cover roughly 25,000 visits a day, because a visit can cost four writes. Past that, writes fail and the totals stop. Separately, the Worker accepts a write from any request with a same-origin `Origin` header, which a script can fake. "Most used" and "Most liked" are home-page sorts, so a script could push a tool to the top.

## Decision

**Sampling.** The summary endpoint (`GET /api/stats/summary`, cached 60 seconds) gains `sample: { visits, events }`. The Worker computes it from the last 7 days' average daily visits (`sampleRateFor` in `worker/logic.js`):

| Average visits a day | Rate |
| --- | --- |
| Under 15,000 | 1 |
| 15,000 to 39,999 | 5 |
| 40,000 to 99,999 | 10 |
| 100,000 or more | 20 |

- The browser reads the rate once per session from the summary and keeps it in session storage. A missing summary (for example a branch preview) means rate 1.
- At a rate of N, the browser sends a visit, view, use or outcome with probability 1/N and adds `weight: N` to the body. Likes are never sampled.
- The Worker accepts `weight` only as a whole number from 1 to 20 that equals the current rate. Anything else counts as 1. It adds the weight instead of 1.
- Branch previews have no database, so they still answer 503.

**Ceilings.** The Worker limits what one request can do:

- A tool's likes for one UTC day stay between -500 and +500.
- Per tool per day, views, uses, successes and errors each stop at 100,000.
- A request body with more than 5 keys is refused.

**Tool list.** The Worker caches the known tool ids per isolate. When an id is missing, it fetches the list again, at most once a minute, before it refuses the id. A new tool then counts after a deploy.

## Consequences

- Counts above the threshold are estimates. Each is the real count plus or minus sampling noise, which shrinks as traffic grows.
- A visitor whose session starts just before a rate change sends weight 1 or a stale weight. The Worker counts it as 1. This undercounts slightly, for at most a minute per change.
- The ceilings are not authentication. A script can still raise counts up to them. They limit the harm; they do not remove it.
- No schema change and no new data. The privacy pledge in [ADR 0006](0006-anonymous-usage-totals.md) is unchanged.
- The free limits then cover far more than 25,000 visits a day. Raise the table if the free plan changes.
