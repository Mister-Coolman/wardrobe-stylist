# Wardrobe Stylist — Design Spec

**Date:** 2026-10-26 · **Event:** Meta Global AI Developer Hackathon · **Track:** Build for Your World
**Team:** Arjun Rangarajan (solo, with Claude Code) · **Working name:** Wardrobe Stylist (final name TBD)

## 1. Intent

**Problem (firsthand):** "I own plenty of clothes and still wear the same few things." Every morning
is a decision made with no knowledge of what the day holds, and packing for a trip is the same
problem multiplied by every day of the trip.

**Product:** A mobile-first web app. You film your closet once; it builds a digital wardrobe. Each
morning it reads your calendar and the weather, asks about anything not on the calendar, and
proposes an outfit from clothes you actually own, explaining why, optionally rendered on you.
For trips it builds day-by-day outfits and a packing list that respects how often you're willing
to rewear each kind of garment.

**Success criteria**
- Judges can open a deployed link and see a working product.
- The 3-minute demo shows: closet scan → daily outfit with visible self-correction → "anything
  else today?" → trip packing → closet gap card.
- At least four Meta models used, each for something distinct: SAM 3.1, Muse Spark, Muse Image,
  Muse Voice Transcribe (+ Model API search grounding).
- Everything shown was built Oct 27 – Nov 4, provable from the public repo's history.

**Rubric mapping:** Impact (30%) — a daily, personal problem; Meta tooling (25%) — multi-model
pipeline; Technical depth (20%) — generate → verify → revise agent loop; Demo (25%) — visual at
every step.

**Out of scope for the MVP** (designed for, not built unless time allows): laundry tracking UI,
no-repeat-with-same-people rule, full shopping feed, integration into the consumer Meta AI agent
(ask in Discord office hours whether third-party tools/MCP are possible — stretch only).

## 2. Architecture

- **App:** One Next.js (App Router, TypeScript) project. Mobile-first UI; API routes in the same
  project. Deployed on Vercel.
- **Data:** Supabase Postgres + Supabase Storage (videos, cutouts, renders).
- **Auth:** Google sign-in with `calendar.readonly` scope — one login gives identity and calendar.
- **Models:** Meta Model API (OpenAI-SDK compatible): `muse-spark-1.3` (vision tagging, stylist,
  chat agent), Muse Image (try-on / flat lay), `muse-voice-transcribe-1.0`, `sam-3-1`.
- **Weather:** Open-Meteo (free, no key; includes geocoding).

### Model adapters
Every model call goes through a thin interface with a real and a mock implementation, selected by
env var (`MODELS=mock|real`). Mocks return saved fixtures so the app is fully buildable before API
credits arrive.

| Adapter | Real | Responsibility |
|---|---|---|
| `segmenter` | SAM 3.1 | video/photo → per-garment masks + track IDs |
| `tagger` | Muse Spark (vision) | cutout → structured garment attributes |
| `stylist` | Muse Spark | context + wardrobe → candidate outfits (JSON), revisions |
| `renderer` | Muse Image | outfit → try-on or flat-lay image |
| `transcriber` | Muse Voice Transcribe | audio → text |

Fallback if SAM 3.1 API video support is weak: sample frames, segment each, dedupe. Further
fallback: SAM 3 open weights.

## 3. Data model

```
Profile    user_id, home_city, home_lat/lon, person_photo?,
           render_mode: tryon | flatlay | none   (default flatlay)
           wear_limits: {category → max wears before wash | null for unlimited}

Garment    id, user_id, source_media_id, photo_url, cutout_url,
           category, subcategory, colors[], pattern, formality(1–5), warmth(1–5), tags[],
           status: clean | worn | laundry   (default clean)
           wear_limit_override?, wears_since_wash, wear_count, last_worn_at,
           confirmed (bool — set on review screen)

Outfit     id, user_id, garment_ids[], rationale (per-garment "why"), rule_report,
           revision_log, render_mode, render_url?, source: agent | user, context_date

WearLog    id, user_id, date, outfit_id, event_id?, people[]

Event      id, user_id, date, start, end, title, location?, attendees[],
           source: calendar | user

Trip       id, user_id, destination, start_date, end_date, day_plans[] (outfit ids),
           packing_list (garment ids + counts)

ScanJob    id, user_id, media_url, status, progress, found_count, error?
```

Default wear limits: underwear/socks 1, t-shirts 1, sweatpants/athletic 1, dress shirts 2,
sweaters 3, trousers 3, jeans 5, outerwear/shoes/accessories unlimited.

Extension points recorded here so later features need no migration: `status` and
`wears_since_wash` (laundry), `WearLog.people` + `Event.attendees` (no-repeat rule).

## 4. Closet scan

1. Capture in-browser: **sweep** (pan across the closet), **hold-up** (show items one at a time), or
   **single photo**. A photo is a one-frame video; all three share one pipeline.
2. Upload to Storage, create `ScanJob`; client polls progress.
3. `segmenter` with concept prompt "clothing item" → tracked objects.
4. Per track, choose the best frame (largest × sharpest mask) → transparent PNG cutout.
5. `tagger` → `{category, subcategory, colors, pattern, formality, warmth, tags}` validated
   against a schema; invalid output retried once, then left for manual tagging.
6. Dedupe: candidates with similar tags + embeddings compared by Muse Spark (same item?).
7. **Review screen:** grid of found items; confirm / edit tags / delete. Only confirmed garments
   are used by the stylist.

**Day-1 risk check (when credits arrive):** run one real closet video through SAM 3.1 and
confirm text prompts on video, mask format, and size limits.

## 5. Stylist

### Outfit loop (code-orchestrated, deterministic order)
```
gather context: events (calendar + user-added) · weather at event/home location · eligible garments
  → stylist proposes 3 candidate outfits (JSON: garment_ids + per-garment rationale)
  → rule engine: every rule.check(outfit, ctx) → violations[]
  → if all candidates violate: send violations back, stylist revises (max 2 rounds)
  → rank survivors (rule soft-scores + model's ranking) → pick best
  → renderer per render_mode (failure or timeout → "none")
  → store Outfit with rule_report and revision_log (shown in UI)
```

### Rules
Interface: `{ id, kind: hard | soft, check(outfit, ctx) → Violation[], score?(outfit, ctx) }`.
Each rule is one file; adding a rule = adding a file to the registry.

MVP hard rules: `completeness` (top+bottom or one-piece, + shoes), `formality` (matches the day's
most formal event), `weather` (warmth vs. temp; no rain-unsafe items when rain ≥ 50%),
`availability` (status = clean).
Trip rules: `wearLimit` (hard — per-garment uses on the trip ≤ its limit), `capsuleReuse` (soft —
fewer distinct items scores higher).
Later: `noRepeatWithSamePeople`, `laundryCycle`.

### Daily flow
- Dress code is driven by the most formal event; a large formality gap between events
  (gym → client meeting) produces a change-of-clothes suggestion.
- After the first outfit appears, the card asks: "Anything else today that's not on your
  calendar?" Quick chips (gym, dinner out, date, outdoors, nothing) or voice/text. Answers become
  `Event(source: user)` and the loop re-runs.
- "I wore this" → `WearLog` entry, increments `wear_count` / `wears_since_wash`.

### Chat agent
Muse Spark with tools: `get_events`, `get_weather`, `search_wardrobe`, `plan_outfit`,
`plan_trip`, `log_wear`, `add_event`. Voice input via `transcriber`. Free-form requests resolve
to tool calls; outfits always come from the outfit loop, never directly from the chat model.

### Trip packing
Input: destination + dates, or detected from calendar events (e.g. "Flight to ORD"). Per day:
weather at destination + any trip events → outfit loop with `wearLimit` and `capsuleReuse`.
Output: day-by-day outfits, packing checklist (each garment + how many days it's used), and a
warning if the wardrobe cannot satisfy the wear limits (e.g. "you own 3 clean t-shirts for 5 days").

### Closet gap card
Muse Spark proposes 3 candidate missing items. Code computes, for each, how many new
rule-passing outfits it would unlock (simulated garment added to the wardrobe). The top item is
matched to a real product via Model API search grounding. Shown as a single card, not a feed.

## 6. Screens
1. Onboarding: Google sign-in → home city → optional person photo → render mode → wear limits
2. Today: weather strip, events, outfit card (render, why, rules passed, revisions),
   "anything else today?", I wore this, try another
3. Closet: grid, filters, status badges, + Scan
4. Scan: capture → progress → review
5. Mic button (global) → chat agent
6. Trip: input → per-day outfits + packing checklist
7. Settings: render mode, wear limits, home city

Visual design follows `docs/ui-style-guide.md`.

## 7. Error handling
- Every model call has a timeout and a typed error; the UI shows a specific message and a retry.
- Render failure falls back to the cutout grid; never blocks the outfit.
- Stylist output is schema-validated; garment IDs not in the wardrobe are rejected as violations.
- Too few garments for a valid outfit → explain which category is missing (feeds the gap card).
- Calendar not connected → manual events only; weather failure → ask "warm, mild, or cold?".

## 8. Testing
- Rules: unit tests per rule with fixture outfits (pure functions — easiest high-value tests).
- Outfit loop: tests with mock stylist (including one that violates rules, to exercise revision).
- Trip planner: wear-limit satisfiable and unsatisfiable cases.
- Adapters: contract tests against fixtures; a manual smoke script for real APIs.
- Pre-demo: run every demo-script step against real APIs on Nov 3.

## 9. Demo script (~3 min)
0:00 hook · 0:20 closet scan · 0:50 Today with visible self-correction · 1:30 "anything else
today?" by voice · 2:00 trip packing with wear limits · 2:30 gap card · 2:45 Meta models used +
built-during-hackathon statement.

## 10. Schedule
| Day | Goal |
|---|---|
| Tue 10/27 | Scaffold, Supabase, Google auth, schema, adapters + mocks |
| Wed 10/28 | Closet scan UI + pipeline (mock) + review screen |
| Thu 10/29 | Rule engine + outfit loop + Today screen |
| Fri 10/30 | Real calendar + weather, "anything else today?" |
| Sat 10/31 | Render modes |
| Sun 11/1 | Chat agent + voice |
| Mon 11/2 | Trip packing + wear limits |
| Tue 11/3 | Gap card, polish, deploy, full real-API run |
| Wed 11/4 | Demo video, README, submit by afternoon (deadline 9 PM) |

SAM risk check runs first whenever credits arrive. Repo must be public; README states that all
code was written during the hackathon.
