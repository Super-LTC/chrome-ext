# Backend handoff: PostHog event-volume cleanup

## Context

Our PostHog bill is projected at **$673/mo on 4.65M events** for May (currently $137 month-to-date). Free tier is 1M events/mo. This is unsustainable — and we have <30 active facilities.

A diagnostic against the last 14 days of events found one event dwarfs everything else:

| Event | 14d count | % of total |
|---|---|---|
| `openai_call_completed` | **1,777,387** | **~87%** |
| `$set` | 81,858 | 4% |
| `extension_loaded` | 45,062 | 2% |
| `pcc_page_viewed` | 45,062 | 2% |
| (everything else combined) | ~325,000 | ~16% (rounding) |

The chrome-extension side has been fixed in a separate PR (dedup `$set`, throttle nav events, once-per-session bootstrap — saves ~540K events/mo). **This doc is about the backend, which is the bigger problem.**

## What's driving `openai_call_completed`

7-day breakdown by `properties.operation` (top buckets):

| Operation | 7d count | Notes |
|---|---|---|
| `pinecone_embed` (text-embedding-3-large) | 457,442 | Vector embedding for Pinecone — **65% of all openai events** |
| `wound_extraction` | 26,657 | Real product call |
| `raw_generation` | 19,009 | |
| `pcc_query_embed` | 17,821 | Embedding |
| `pgvector_embed_care_plan_focus` | 17,102 | Embedding |
| `icd10_selection` | 10,374 | Real product call |
| `pgvector_embed_clinical_notes` | 6,792 | Embedding |
| `intervention-classification` | 6,511 | |
| `pcc_embed_progress_notes` | 6,181 | Embedding |
| `care-plan-analysis-*` (3 ops) | ~5,000 | |
| `MDS-*-Solver:extract` (3 ops) | ~3,000 | |
| `PDPM:<condition>:mention-check` (~30+ ops) | ~3,000+ | One event per condition × resident |
| `Evidence Validation (evidence-1/2/3)` | 1,137 (3 × 379) | 3 events per validation run |

**~510K of 700K weekly openai events (~73%) are embedding calls.** They have zero product-analytics value — they're triggered by code paths, not user actions.

Worse: ~600K of the 700K weekly `openai_call_completed` events have **no `location` group attached** at all (`properties.$groups.location IS NULL`), so we can't even tell which facility they came from. That means they're firing from server contexts that don't carry tenant identity.

## What needs to change

### 1. Stop emitting `openai_call_completed` for embedding ops *(do this first — biggest win)*

Anywhere we wrap an OpenAI/Pinecone/pgvector embedding call with telemetry, do **not** call `posthog.capture('openai_call_completed', ...)`. Specifically, suppress the capture for any operation matching:

- `pinecone_embed`
- `pcc_query_embed`
- `pcc_embed_*` (e.g. `pcc_embed_progress_notes`, `pcc_embed_practitioner_notes`)
- `pgvector_embed_*` (e.g. `pgvector_embed_care_plan_focus`, `pgvector_embed_clinical_notes`, `pgvector_embed_orders`)
- Any future operation containing `_embed`, `embed_`, or using a `text-embedding-*` model

Easiest implementation: in the wrapper that emits `openai_call_completed`, early-return on PostHog if `model.startsWith('text-embedding-')` OR `operation.includes('embed')`.

**Estimated savings: ~2.2M events/mo.** Single biggest lever — cuts ~50% of total project event volume by itself.

### 2. Aggregate per-condition / per-evidence sub-events into a parent event

Today we emit one event per PDPM condition mention-check (~30 conditions × N residents per analysis run) and three events per Evidence Validation run.

Replace with one parent event per *user-facing operation*:

- `pdpm_analysis_run` — one event when the whole PDPM analysis finishes, with `conditions_checked: 30`, `conditions_matched: 4`, `total_cost_usd`, `total_latency_ms`, `total_input_tokens`, `total_output_tokens` in properties.
- `evidence_validation_run` — one event per validation cycle, with `evidence_count: 3` and aggregate token/cost/latency.

This preserves the analytics signal ("PDPM analyses ran 87 times this week, p95 latency 14s") and kills 60–80% of the sub-event volume.

**Estimated savings: ~300K events/mo.**

### 3. Move LLM cost / perf data to our own DB

Cost & latency tracking belongs in a Postgres table, not PostHog. Suggested shape:

```sql
CREATE TABLE llm_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  facility_id     text,         -- nullable for system jobs
  resident_id     text,         -- nullable
  user_id         text,         -- nullable for system jobs
  operation       text NOT NULL,
  model           text NOT NULL,
  schema_name     text,
  input_tokens    int,
  output_tokens   int,
  cost_usd        numeric(10,6),
  latency_ms      int,
  retry_count     int DEFAULT 0,
  success         boolean NOT NULL,
  error_type      text,
  error_message   text,
  is_harness      boolean DEFAULT false
);
CREATE INDEX llm_calls_ts ON llm_calls (ts DESC);
CREATE INDEX llm_calls_facility_ts ON llm_calls (facility_id, ts DESC);
CREATE INDEX llm_calls_operation_ts ON llm_calls (operation, ts DESC);
```

This gives us:
- **Cost-per-facility-per-month** queries (with joins to `facilities`, `residents` — impossible cleanly in PostHog).
- **p95 latency by operation** for SLO tracking.
- **Error-rate breakdowns** by model / operation.
- **Audit trail** linking LLM calls to clinical entities (the right place for it given healthcare context).

The wrapper that currently emits `openai_call_completed` should:
1. Insert a row into `llm_calls` (always — every call).
2. **Optionally** emit a single product-level PostHog event when a *user-facing* operation completes (e.g. `mds_solver_completed`, `pdpm_analysis_run`) with rolled-up cost/latency.

Do not double-write per-call to PostHog.

### 4. Audit the `~600K events/wk with no location group`

Even after the above changes, the remaining `openai_call_completed` events should always be associated with a facility (`location` group). The fact that 85% of them aren't tells us the call sites don't have tenant context propagated. Two options:

- **Plumb the facility_id through** to the call site so the PostHog group call works, OR
- **Just drop the PostHog emit** for those code paths (they're system jobs without user/tenant context — they belong in the DB only).

I'd default to (b). System cron jobs and batch processors don't need product analytics events.

## Suggested PR sequence

1. **PR 1 — `llm_calls` table + dual-write.** Add the table, write to it from the wrapper. Keep PostHog emit unchanged. Verify shape and volume in DB.
2. **PR 2 — Suppress embeddings in PostHog.** Single early-return in the wrapper. Verify volume drops in PostHog dashboard within 24h.
3. **PR 3 — Aggregate PDPM mention-checks + Evidence Validation.** Roll up to parent events.
4. **PR 4 — Drop `openai_call_completed` from PostHog entirely.** Replace with one rolled-up product event per user-facing operation. Cost analytics are now in the DB.
5. **PR 5 — Internal `/admin/llm-costs` page.** Simple SQL view + table UI: cost per facility per month, per operation breakdown, error rates. Lift-and-shift from what PostHog was sort-of giving us.

## Expected outcome

| Stage | Monthly events | Monthly cost (Boost plan PAYG) |
|---|---|---|
| Current trajectory | 4.65M | ~$673 |
| After chrome-ext fixes (already shipped) | ~4.1M | ~$580 |
| + PR 2 (embeddings off) | ~1.9M | ~$170 |
| + PR 3 (aggregation) | ~1.6M | ~$110 |
| + PR 4 (drop openai event) | **~0.9M** | **$0 (under free tier)** |

Plus we get *better* cost analytics because they're in our DB joined to real entities.

## Investigate: Apr 26 spike

Daily `openai_call_completed` count jumped from 31K → 184K on **2026-04-26** and stayed elevated. Worth a quick `git log --since=2026-04-25 --until=2026-04-27` against whatever repo emits these — likely a feature shipped that day wraps embedding calls in the same telemetry as user-facing OpenAI calls, and that's the proximate cause of the bill explosion. Whoever owns that PR is the right person to drive PR 2.

## Files referenced (chrome-ext side, for context only — do not change)

- `content/utils/analytics.js` — chrome-ext PostHog wrapper (already fixed)
- `content/utils/pcc-nav-observer.js` — chrome-ext nav telemetry (already throttled)
- `content/content.js` — chrome-ext bootstrap (already once-per-session)

The backend uses `posthog-node` (visible in events as `properties.$lib = "posthog-node"`). Look there for the wrapper to fix.
