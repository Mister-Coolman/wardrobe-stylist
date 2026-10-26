# Wardrobe Stylist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, mobile-first web app that turns a closet video into a digital wardrobe and plans daily and trip outfits from calendar, weather and owned clothes, using SAM 3.1, Muse Spark, Muse Image and Muse Voice Transcribe.

**Architecture:** One Next.js App Router project (UI + API routes) on Vercel, Supabase Postgres + Storage for data and media. All Meta model calls go through five adapters with mock and real implementations selected by `MODELS=mock|real`. Outfits come from a code-orchestrated propose → rule-check → revise loop; rules are pure functions in a registry.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Vitest, Playwright, Zod, `openai` SDK (pointed at Meta Model API), `@supabase/supabase-js`, Auth.js v5 (`next-auth@5`) with Google, `sharp`, Open-Meteo, Phosphor icons (`@phosphor-icons/react`).

**Spec:** `docs/superpowers/specs/2026-10-26-wardrobe-stylist-design.md` · **Visual rules:** `docs/ui-style-guide.md` (and `docs/share/ui-style-guide.html` for mockups)

## Global Constraints

- No product code before **Tue 27 Oct 2026**; submission by the afternoon of **Wed 4 Nov 2026** (hard deadline 9 PM). Repo public on GitHub; README states all code was written during the hackathon.
- Node ≥ 20, TypeScript `strict: true`.
- Every Meta model call goes through an adapter in `src/lib/models/`; no component or route imports `openai` directly. `MODELS=mock` must run the whole app with no network calls to Meta.
- Model IDs: `muse-spark-1.3`, `muse-voice-transcribe-1.0`, `sam-3-1`, Muse Image. Base URL from `META_API_BASE_URL`, key from `META_API_KEY`.
- Every model call has a timeout (default 30 s, renders 45 s) and throws a typed `ModelError`.
- Stylist output is schema-validated (Zod); garment IDs not in the wardrobe are violations.
- Default rewear limits — underwear/socks 1, t-shirts 1, sweatpants/athletic 1, dress shirts 2, sweaters 3, trousers 3, jeans 5, outerwear/shoes/accessories unlimited.
- Revision loop: 3 candidates, at most 2 revision rounds.
- Default `render_mode` is `flatlay`; render failure or timeout falls back to `none`, never blocks the outfit.
- UI follows `docs/ui-style-guide.md`: tokens only (no raw hex in components), Instrument Serif + Instrument Sans, accent ≤ 2 uses per screen, no gradients, no Inter/Roboto/Geist, no `#000`/`#fff`, radius by role (0/2/6/12), no "AI" or ✨ in UI copy, 16 px minimum body and input text, 44 px touch targets, `prefers-reduced-motion` honored.
- `npm run check:slop` (Task 1) must pass before every commit that touches `src/app` or `src/components`.
- Dates: "today" is the user's local date, computed from the `tz` stored on the profile, never server UTC.

## Review Focus

1. **Wardrobe can't make a valid outfit** (empty closet, no shoes, everything in laundry) → explain which category is missing, never crash or show a blank card. Test owned by Task 5.
2. **Model returns junk** (malformed JSON, unknown garment IDs, fewer than 3 candidates) → treated as violations and revised; after 2 rounds, best-effort outfit plus an honest note. Test owned by Task 5.
3. **Late, all-day and cross-midnight events / non-UTC users** → events land on the user's local date; all-day events don't set formality to "smart". Test owned by Task 8.
4. **Trip wear limits can't be met** (5 days, 3 clean tees) → plan still produced, with a specific shortfall warning. Test owned by Task 14.
5. **Scan finds nothing or the same garment repeatedly** (blurry video, one item filmed twice) → "no clothes found" message with a retry; duplicates merged. Test owned by Task 9.

---

## File Structure

```
src/
  lib/
    domain/types.ts          all shared domain types (Garment, Outfit, Event, Profile, Weather, Candidate…)
    domain/wearLimits.ts     defaults + limitFor()
    domain/dates.ts          localDate(), eventsOnDate()
    rules/types.ts           Rule, Violation, RuleContext
    rules/*.ts               one file per rule
    rules/registry.ts        dailyRules, tripRules, runRules()
    stylist/dayContext.ts    buildDayContext(): dress code, weather location, change suggestion
    stylist/loop.ts          planOutfit(): propose → check → revise → pick → render
    stylist/trip.ts          planTrip()
    stylist/gap.ts           closetGaps()
    models/types.ts          adapter interfaces + ModelError
    models/index.ts          getModels() factory (mock|real)
    models/mock/*.ts         fixture-backed mocks
    models/real/*.ts         Meta Model API implementations
    models/fixtures/*        sample cutouts, tags, outfits
    scan/pipeline.ts         runScan(): segment → best frame → cutout → tag → dedupe
    scan/cutout.ts           bestFrame(), cutout()
    integrations/calendar.ts Google Calendar → Event[]
    integrations/weather.ts  Open-Meteo → Weather
    agent/tools.ts           tool definitions + dispatch
    agent/chat.ts            runChat()
    db/schema.sql            (supabase/migrations/0001_init.sql)
    db/repo.ts               typed data access
  app/                       routes (see each task)
  components/                UI components (see each task)
tests/                       mirrors src/lib; e2e/ for Playwright
scripts/check-slop.mjs       ban-list grep
```

---

### Task 1: Scaffold, design tokens, slop check (Tue 27 Oct)

**Files:**
- Create: Next.js app via `npx create-next-app@15 . --ts --app --src-dir --tailwind --eslint --no-import-alias`
- Create: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/{Button,Tag,Label}.tsx`, `scripts/check-slop.mjs`, `vitest.config.ts`, `.env.example`, `README.md`
- Test: `tests/checkSlop.test.ts`

**Interfaces:**
- Produces: CSS variables `--paper --paper-raised --studio --ink --ink-muted --ink-faint --rule --accent --ok --warn --error` (light + `.dark`/`prefers-color-scheme` values from style guide §2); Tailwind theme mapped to them with default colors, shadows and radii **removed**; `<Button variant="primary|secondary|tertiary" loading?>`, `<Tag selected?>`, `<Label>`; `npm run check:slop` exits 1 on any ban-list hit.

- [ ] **Step 1: Write failing test** — `check-slop` flags each banned pattern in a temp fixture file and passes a clean file:
```ts
test('flags banned patterns', () => {
  for (const bad of ['bg-gradient-to-r', 'from-purple-500', "font-family: Inter", '#ffffff', 'shadow-lg', 'rounded-2xl', 'transition-all', 'animate-bounce', 'Sparkles', 'Get started', 'lorem'])
    expect(scan(`<div className="${bad}">`)).not.toHaveLength(0)
})
test('passes clean markup', () => expect(scan('<div className="bg-paper text-ink">')).toEqual([]))
```
- [ ] **Step 2:** `npx vitest run tests/checkSlop.test.ts` → FAIL (`scan` not defined).
- [ ] **Step 3:** Implement `export function scan(text: string): {pattern: string; line: number}[]` in `scripts/check-slop.mjs` using the regex list in style guide §9; CLI walks `src/app` and `src/components`, prints hits, exits 1. A line containing `slop-ok:` followed by a reason is exempt.
- [ ] **Step 4:** Tokens + fonts: `next/font/google` Instrument Serif (400, italic) and Instrument Sans (400/500/600) as `--serif`/`--sans`; `<meta name="theme-color">`; body `bg-paper text-ink`. Build `Button`, `Tag`, `Label` per style guide §6.
- [ ] **Step 5:** `npx vitest run && npm run check:slop && npm run build` → all pass. Init GitHub repo (public), push.
- [ ] **Step 6: Commit** `feat: scaffold app with design tokens and slop check`

### Task 2: Domain types and wear limits

**Files:** Create `src/lib/domain/types.ts`, `src/lib/domain/wearLimits.ts` · Test `tests/domain/wearLimits.test.ts`

**Interfaces — Produces:**
```ts
type Category = 'top'|'bottom'|'onepiece'|'outerwear'|'shoes'|'accessory'|'underwear'|'socks'
type Subcategory = 'tshirt'|'dress_shirt'|'shirt'|'sweater'|'jeans'|'trousers'|'shorts'|'skirt'|'sweatpants'|'athletic'|'dress'|'coat'|'jacket'|'boots'|'sneakers'|'dress_shoes'|'other'
interface Garment { id: string; userId: string; name: string; category: Category; subcategory: Subcategory;
  colors: string[]; pattern: string; formality: 1|2|3|4|5; warmth: 1|2|3|4|5; rainSafe: boolean; tags: string[];
  status: 'clean'|'worn'|'laundry'; wearLimitOverride: number|null; wearsSinceWash: number; wearCount: number;
  lastWornAt: string|null; cutoutUrl: string; photoUrl: string; confirmed: boolean }
type WearLimits = Partial<Record<Subcategory|Category, number|null>>   // null = unlimited
interface Profile { userId: string; homeCity: string; homeLat: number; homeLon: number; tz: string;
  personPhotoUrl: string|null; renderMode: RenderMode; wearLimits: WearLimits; styleProfile: StyleProfile|null }
type RenderMode = 'tryon'|'flatlay'|'none'
interface CalendarEvent { id: string; userId: string; date: string; start: string|null; end: string|null; allDay: boolean;
  title: string; location: string|null; attendees: string[]; source: 'calendar'|'user'; formality?: 1|2|3|4|5 }
interface Weather { tempHighC: number; tempLowC: number; rainProbability: number; windKph: number; summary: string }
interface Candidate { garmentIds: string[]; rationale: Record<string,string>; title: string }
interface Outfit extends Candidate { id: string; userId: string; contextDate: string; ruleReport: RuleResult[];
  revisionLog: RevisionEntry[]; renderMode: RenderMode; renderUrl: string|null; source: 'agent'|'user' }
interface RevisionEntry { round: number; rejected: { candidate: Candidate; violations: Violation[] }[] }
interface StyleProfile { summary: string; traits: string[]; palette: string[]; avoid: string[]; sourceImages: string[] }
export const DEFAULT_WEAR_LIMITS: WearLimits
export function limitFor(g: Garment, limits: WearLimits): number|null   // override > subcategory > category > null
```
(`Trip` and `ScanJob` are added to this file in Task 6. `Violation`, `RuleResult` re-exported from `rules/types.ts`, Task 3. `rainSafe` is a small addition to the spec's Garment: the tagger sets it false for suede, canvas sneakers, silk, etc.)

- [ ] **Step 1: Failing tests:** `limitFor` → tshirt 1, jeans 5, dress_shirt 2, sweater 3, trousers 3, socks 1, coat `null`; `wearLimitOverride: 2` on jeans → 2; user limit `{jeans: 3}` overrides default.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: domain types and wear limits`

### Task 3: Rule engine and MVP rules (Tue 27 Oct)

**Files:** Create `src/lib/rules/{types,completeness,formality,weather,availability,registry}.ts` · Test `tests/rules/*.test.ts`, `tests/fixtures/wardrobe.ts`

**Interfaces — Produces:**
```ts
interface Violation { ruleId: string; garmentIds: string[]; message: string }   // message is user-facing copy
interface RuleResult { ruleId: string; passed: boolean; note: string }           // shown as a fitting note
interface DayContext { date: string; events: CalendarEvent[]; weather: Weather; requiredFormality: 1|2|3|4|5;
  changeSuggestion: string|null }
interface TripUsage { counts: Record<string, number> }   // garmentId → uses so far in the trip
interface RuleContext { garments: Map<string, Garment>; day: DayContext; profile: Profile; trip?: TripUsage }
interface Rule { id: string; kind: 'hard'|'soft'; check(c: Candidate, ctx: RuleContext): Violation[];
  score?(c: Candidate, ctx: RuleContext): number; note(c: Candidate, ctx: RuleContext): string }
export const dailyRules: Rule[]       // completeness, formality, weather, availability (+ styleMatch when Task 20 lands)
export function runRules(c: Candidate, ctx: RuleContext, rules: Rule[]): { violations: Violation[]; results: RuleResult[]; softScore: number }
```
Rule definitions (pinned values):
- `completeness`: needs (`top` + `bottom`) or `onepiece`, plus `shoes`; also every id must exist in `garments` (unknown id → violation "Unknown piece").
- `formality`: outfit formality = **min** formality of its top/bottom/onepiece/shoes; violation if `< requiredFormality` or `> requiredFormality + 2`.
- `weather`: outfit warmth = sum of warmth of top/onepiece/outerwear layers. Required band by `tempLowC`: `≥ 22` → 1–4; `15–21` → 2–6; `8–14` → 4–8; `< 8` → ≥ 7. If `rainProbability ≥ 50`, every garment must be `rainSafe`.
- `availability`: every garment `status === 'clean'`.

- [ ] **Step 1: Failing tests** (fixture wardrobe in `tests/fixtures/wardrobe.ts` mirrors the mockup: navy overcoat w4, oat crewneck w3 f3, white oxford f4, charcoal trousers f4, selvedge jeans f2, suede loafers f4 `rainSafe:false`, leather boots f3 rainSafe, white sneakers f2, rust tee f1 laundry):
  - missing shoes → `completeness` violation; unknown id → violation.
  - required 4, jeans (f2) in outfit → formality violation; required 2 with dress shoes (f4) → passes.
  - tempLow 9, rain 80, loafers → weather violation naming loafers; boots → passes.
  - rust tee (laundry) → availability violation.
  - `runRules` on a valid outfit returns 4 passed results with non-empty notes.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: rule engine with MVP rules`

### Task 4: Model adapters, mocks, factory (Tue 27 Oct)

**Files:** Create `src/lib/models/{types,index}.ts`, `src/lib/models/mock/{segmenter,tagger,stylist,renderer,transcriber,chat}.ts`, `src/lib/models/fixtures/` · Test `tests/models/mock.test.ts`

**Interfaces — Produces:**
```ts
class ModelError extends Error { constructor(public adapter: string, public kind: 'timeout'|'bad_output'|'http'|'unavailable', msg: string) }
interface FrameMask { frameIndex: number; maskPng: Buffer; area: number; bbox: [number,number,number,number] }
interface SegmentTrack { trackId: string; masks: FrameMask[] }
interface Segmenter { segment(frameUrls: string[]): Promise<SegmentTrack[]> }
type GarmentTags = Pick<Garment,'name'|'category'|'subcategory'|'colors'|'pattern'|'formality'|'warmth'|'rainSafe'|'tags'>
interface Tagger { tag(cutoutUrl: string): Promise<GarmentTags>; sameItem(a: string, b: string): Promise<boolean> }
interface ProposeInput { day: DayContext; wardrobe: Garment[]; count: number; extraGuidance?: string; styleProfile?: StyleProfile|null }
interface Stylist {
  classifyEvents(events: CalendarEvent[]): Promise<Record<string, 1|2|3|4|5>>
  propose(input: ProposeInput): Promise<Candidate[]>
  revise(input: ProposeInput & { rejected: { candidate: Candidate; violations: Violation[] }[] }): Promise<Candidate[]>
  suggestGaps(wardrobe: Garment[]): Promise<GarmentTags[]>
  styleFromImages?(imageUrls: string[]): Promise<StyleProfile> }
interface Renderer { render(req: { mode: 'tryon'|'flatlay'; cutoutUrls: string[]; personPhotoUrl?: string }): Promise<{ url: string }> }
interface Transcriber { transcribe(audio: Buffer, mime: string): Promise<string> }
interface ChatModel { complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatTurn> }   // OpenAI chat-completions shapes
interface Models { segmenter: Segmenter; tagger: Tagger; stylist: Stylist; renderer: Renderer; transcriber: Transcriber; chat: ChatModel }
export function getModels(): Models   // reads MODELS env; default 'mock'
```
Mock behavior: stylist `propose` picks deterministically from the wardrobe by formality/warmth and returns **one rule-breaking candidate first** (rain-unsafe shoes when it rains) so the revision path is exercised; `classifyEvents` uses keywords (`client|interview|board|wedding` → 4, `dinner|drinks|date` → 3, `gym|run|yoga` → 1, else 2); renderer returns a fixture image URL; segmenter returns fixture tracks; transcriber returns the fixture string `"drinks after work"`.

- [ ] **Step 1: Failing tests:** `getModels()` with `MODELS=mock` returns all six adapters; mock `propose` returns `count` candidates whose ids all exist in the wardrobe; `classifyEvents([{title:'Client review'}])` → 4.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: model adapter interfaces and mocks`

### Task 5: Outfit loop (Thu 29 Oct)

**Files:** Create `src/lib/stylist/loop.ts` · Test `tests/stylist/loop.test.ts`

**Interfaces:**
- Consumes: `Stylist`, `Renderer` (Task 4); `runRules`, `dailyRules` (Task 3); `DayContext`.
- Produces:
```ts
interface PlanOutfitInput { day: DayContext; wardrobe: Garment[]; profile: Profile; models: Pick<Models,'stylist'|'renderer'>;
  rules?: Rule[]; trip?: TripUsage; renderMode?: RenderMode }
type PlanOutfitResult =
  | { ok: true; outfit: Omit<Outfit,'id'|'userId'>; bestEffort: boolean }
  | { ok: false; reason: 'insufficient_wardrobe'; missing: Category[] }
export async function planOutfit(input: PlanOutfitInput): Promise<PlanOutfitResult>
```
Algorithm: eligible = confirmed garments (availability enforced by rule). Pre-check: if no `shoes`, or neither (`top` and `bottom`) nor `onepiece` exists among clean garments → `insufficient_wardrobe` with the missing categories. Propose 3 → run hard rules → survivors? Else revise with all rejections (max 2 rounds, logging each round in `revisionLog`). Survivors ranked by `softScore` desc, then stylist order. If none after 2 rounds → pick candidate with fewest violations, `bestEffort: true`, and include its violations as failed `RuleResult`s. Render per mode (`none` skips); on `ModelError` set `renderMode:'none'`, `renderUrl:null`.

- [ ] **Step 1: Failing tests:**
  - rainy day: first mock candidate (loafers) rejected; result has `revisionLog.length === 1` and outfit uses boots.
  - stylist returning an unknown garment id three times → `bestEffort: true`, failed result for `completeness`.
  - stylist throwing `ModelError('stylist','bad_output')` on first propose → retried once, then succeeds.
  - wardrobe with no shoes → `{ ok:false, reason:'insufficient_wardrobe', missing:['shoes'] }`.
  - renderer throws → `renderMode:'none'`, outfit still returned.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: outfit loop with rule-checked revision`

### Task 6: Database and data access (Tue 27 Oct)

**Files:** Create `supabase/migrations/0001_init.sql`, `src/lib/db/{client,repo}.ts` · Test `tests/db/repo.test.ts` (against local Supabase via `npx supabase start`)

**Interfaces — Produces** (`repo.ts`, all scoped by `userId`, camelCase ↔ snake_case mapping inside):
```ts
getProfile(userId): Promise<Profile|null>; upsertProfile(p: Profile): Promise<void>
listGarments(userId, opts?: { confirmed?: boolean }): Promise<Garment[]>; insertGarments(gs: Omit<Garment,'id'>[]): Promise<Garment[]>
updateGarment(userId, id, patch: Partial<Garment>): Promise<void>; deleteGarment(userId, id): Promise<void>
saveOutfit(o: Omit<Outfit,'id'>): Promise<Outfit>; getOutfit(userId, id): Promise<Outfit|null>; latestOutfitFor(userId, date): Promise<Outfit|null>
logWear(userId, outfitId, date, eventId?: string, people?: string[]): Promise<void>   // also increments wear_count/wears_since_wash, sets last_worn_at, in one transaction (SQL function log_wear)
listUserEvents(userId, date): Promise<CalendarEvent[]>; addUserEvent(e: Omit<CalendarEvent,'id'>): Promise<CalendarEvent>
createScanJob(userId, mediaUrl, frameUrls: string[]): Promise<ScanJob>; updateScanJob(id, patch): Promise<void>; getScanJob(userId, id): Promise<ScanJob|null>
saveTrip(t: Omit<Trip,'id'>): Promise<Trip>; getTrip(userId, id): Promise<Trip|null>; listTrips(userId): Promise<Trip[]>
```
Tables exactly as spec §3 (`profiles, garments, outfits, wear_logs, events, trips, scan_jobs`) plus `polls`, `poll_votes` (Task 19). Storage buckets: `media` (private, signed URLs). `ScanJob = { id; userId; mediaUrl; frameUrls: string[]; status: 'queued'|'segmenting'|'tagging'|'review'|'failed'; progress: number; foundCount: number; error: string|null }`; `Trip = { id; userId; destination; lat; lon; startDate; endDate; dayPlans: {date; outfitId|null; note}[]; packingList: {garmentId; days: number}[]; warnings: string[] }`.

- [ ] **Step 1: Failing test:** insert two garments → `logWear` on an outfit containing one → its `wearCount` 1, `wearsSinceWash` 1, other unchanged; a second user's `listGarments` returns none of them.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write migration + repo. **Step 4:** `npx supabase db reset && npx vitest run tests/db` → PASS.
- [ ] **Step 5: Commit** `feat: database schema and repo`

### Task 7: Sign-in and app shell (Tue 27 Oct)

**Files:** Create `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, `src/app/(app)/layout.tsx`, `src/components/shell/{BottomNav,MicButton}.tsx`, `src/lib/session.ts` · Test `tests/e2e/shell.spec.ts`

**Interfaces — Produces:** `requireUser(): Promise<{ userId: string; email: string; googleAccessToken: string|null }>` (server-only; redirects to `/onboarding` when signed out). Google provider with scopes `openid email profile https://www.googleapis.com/auth/calendar.readonly`, `access_type=offline`, `prompt=consent`; refresh the access token in the `jwt` callback when expired. `DEV_USER_EMAIL` env bypasses Google in development and in e2e. Shell: bottom nav Today · Closet · Trips (Phosphor light icons, accent on active), mic button docked above the nav.

- [ ] **Step 1: Failing e2e:** with `DEV_USER_EMAIL` set, visiting `/today` shows nav with 3 links and `aria-current="page"` on Today; signed-out visit to `/today` redirects to `/onboarding`.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/shell.spec.ts` → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run check:slop` passes.
- [ ] **Step 5: Commit** `feat: Google sign-in and app shell`

### Task 8: Calendar, weather, day context (Fri 30 Oct)

**Files:** Create `src/lib/domain/dates.ts`, `src/lib/integrations/{calendar,weather}.ts`, `src/lib/stylist/dayContext.ts` · Test `tests/stylist/dayContext.test.ts`, `tests/integrations/*.test.ts` (fetch mocked)

**Interfaces — Produces:**
```ts
localDate(tz: string, now?: Date): string                          // 'YYYY-MM-DD'
fetchCalendarEvents(accessToken: string, date: string, tz: string): Promise<CalendarEvent[]>   // Google events.list, singleEvents=true, timeMin/timeMax = local day bounds
geocode(place: string): Promise<{ lat: number; lon: number; name: string }|null>             // Open-Meteo geocoding
fetchWeather(lat: number, lon: number, date: string, tz: string): Promise<Weather>          // daily max/min, precipitation_probability_max, wind_speed_10m_max
buildDayContext(args: { date: string; profile: Profile; calendarEvents: CalendarEvent[]; userEvents: CalendarEvent[];
  stylist: Stylist; weatherFor: (lat: number, lon: number) => Promise<Weather> }): Promise<DayContext>
```
Rules: `requiredFormality` = max formality over **timed** events (all-day events ignored; no events → 2). Weather location = first timed event whose `location` geocodes, else home. `changeSuggestion` when two timed events differ by ≥ 3 formality: `"Change after {earlier title} — {later title} is dressier."` (or the reverse wording). Weather API failure → `weather.summary = 'unknown'` and the route asks warm/mild/cold (Task 11).

- [ ] **Step 1: Failing tests:**
  - event at 23:30 local in `America/New_York` lands on that local date, not the next UTC day.
  - all-day "Conference" + timed "Gym" → requiredFormality 1.
  - "Gym 07:00" + "Client review 10:00" → requiredFormality 4 and a change suggestion mentioning both titles.
  - event with location "Chicago" → weather fetched for Chicago's lat/lon.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: calendar, weather and day context`

### Task 9: Scan pipeline (Wed 28 Oct)

**Files:** Create `src/lib/scan/{cutout,pipeline}.ts`, `src/app/api/scan/route.ts` (POST start), `src/app/api/scan/[id]/route.ts` (GET status) · Test `tests/scan/*.test.ts`

**Interfaces:**
- Consumes: `Segmenter`, `Tagger` (Task 4), repo scan/garment functions (Task 6).
- Produces:
```ts
bestFrame(track: SegmentTrack, sharpness: (frameIndex: number) => number): FrameMask   // maximize area × sharpness
cutout(frame: Buffer, mask: Buffer): Promise<Buffer>   // sharp: apply mask as alpha, trim to bbox + 4% padding, PNG
runScan(jobId: string, deps: { models: Models; repo: typeof repo; storage: StorageLike }): Promise<void>
```
Flow: status `segmenting` → tracks → per track best frame → cutout uploaded → status `tagging`, progress = tagged/total → dedupe: pairs with same `category`+`subcategory` and ≥ 1 shared color are checked with `tagger.sameItem`; duplicates keep the larger mask → insert garments with `confirmed:false` → status `review`, `foundCount`. Zero tracks → status `failed`, error `"No clothes found — try holding each piece up to the camera."`. Runs via `after()` from `next/server` so the POST returns immediately; client polls GET every 1.5 s.
Capture input: the client samples frames at 2 fps (max 120) from the recorded video with a canvas and uploads JPEGs plus the video; a single photo is one frame.

- [ ] **Step 1: Failing tests:** fixture tracks (3 garments, one filmed twice) → 3 garments inserted unconfirmed, job `review`, `foundCount` 3; zero tracks → job `failed` with the message above; `bestFrame` picks the frame with the largest area × sharpness.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: closet scan pipeline`

### Task 10: Scan and Closet screens (Wed 28 Oct)

**Files:** Create `src/app/(app)/scan/page.tsx`, `src/components/scan/{CaptureModes,FrameSampler,ScanProgress,ReviewGrid}.tsx`, `src/app/(app)/closet/page.tsx`, `src/components/closet/{GarmentTile,ClosetFilters,GarmentEditor}.tsx`, `src/app/api/garments/route.ts` (PATCH confirm/edit, DELETE) · Test `tests/e2e/scan.spec.ts`

**Interfaces — Consumes:** scan API (Task 9), repo garment functions. Screens match `docs/share/ui-style-guide.html` mockups "Scan review" and "Closet": capture modes Sweep / Hold-up / Photo; progress line "Found N · tagging i/N…"; review grid with staggered settle-in (40 ms, `ease-out` token); primary "Add N pieces", tertiary "Review one by one"; closet grid on `--studio`, filter tags (All, Tops, Bottoms, Shoes, Laundry n), status as words ("Worn 4/5", "Laundry"); empty state "Your closet is empty." + "Scan closet".

- [ ] **Step 1: Failing e2e** (mock models): upload `tests/fixtures/closet.jpg` via Photo mode → review grid shows fixture pieces → "Add" → `/closet` shows them; deleting one removes it.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `check:slop` passes; screenshot at 375 px light + dark and compare with the mockups.
- [ ] **Step 5: Commit** `feat: scan and closet screens`

### Task 11: Today screen (Thu 29 – Fri 30 Oct)

**Files:** Create `src/app/(app)/today/page.tsx`, `src/app/api/today/route.ts` (GET plan, POST regenerate), `src/app/api/events/route.ts` (POST add user event), `src/app/api/wear/route.ts` (POST), `src/components/today/{LookHeader,LookHero,PieceList,FittingNotes,AnythingElse,DayStrip,ChangeSuggestion,MissingPieces}.tsx` · Test `tests/e2e/today.spec.ts`

**Interfaces — Consumes:** `buildDayContext` (8), `planOutfit` (5), repo (6). `GET /api/today?date=` returns `{ day: DayContext; result: PlanOutfitResult; outfitId?: string }` — reuses `latestOutfitFor` unless `POST` regenerates. `POST /api/events {title, kind}` stores `source:'user'` and regenerates. `POST /api/wear {outfitId}` → `logWear`.
UI per mockups "Today" and "Today, scrolled": label date + one-line `DayStrip` with tabular numbers; serif "Look 01 — {title}"; hero; render-mode text segmented control; piece rows with per-piece *why*; fitting notes (✓ passed, ↺ revised with struck-through rejected piece name); "Anything today that's not on your calendar?" chips Gym · Dinner out · Date · Outdoors · Nothing else + free text; primary "I wore this", secondary "Another look". `insufficient_wardrobe` → `MissingPieces` ("No shoes yet — scan a pair to get outfits.") with "Scan closet". Unknown weather → three chips Warm / Mild / Cold that set a manual `Weather`. Loading line shows the current step ("Checking the forecast…", "Picking pieces…", "Laying it out…").

Calendar not connected (no token, or Google returns 401 after refresh) → treat as zero calendar events, show "Calendar not connected" in the day strip with a tertiary "Connect" link; the user-added events still work.

- [ ] **Step 1: Failing e2e** (mock, seeded rainy day; plus a run with calendar disconnected that still shows a look and the "Calendar not connected" line): Today shows a look whose fitting notes include a "↺" line mentioning loafers; tapping "Drinks" adds an event and the day strip shows "(added)"; "I wore this" → closet tile shows "Worn 1/…" for those pieces.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `check:slop`; screenshot vs mockups.
- [ ] **Step 5: Commit** `feat: Today screen with fitting notes and follow-up question`

### Task 12: Render modes (Sat 31 Oct)

**Files:** Modify `src/components/today/LookHero.tsx`; Create `src/app/api/render/route.ts` · Test `tests/e2e/render.spec.ts`

**Interfaces:** `POST /api/render {outfitId, mode}` → re-renders with `renderer.render`, saves `renderUrl`/`renderMode` on the outfit, returns `{renderMode, renderUrl}`; on `ModelError` returns `{renderMode:'none', renderUrl:null, error:'render_failed'}`. `tryon` without `profile.personPhotoUrl` falls back to `flatlay` with note "Add a photo of you in Settings for try-on." Hero: `tryon`/`flatlay` = full-bleed image, radius 0, aspect 4:5; `none` = cutout grid. Error copy: "Couldn't render the try-on. Showing the pieces instead." + "Try again".

- [ ] **Step 1: Failing e2e:** switching Flat lay → Pieces shows the grid with no network render call; forcing the mock renderer to fail shows the error copy and the grid.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: try-on, flat lay and pieces render modes`

### Task 13: Chat agent and voice (Sun 1 Nov)

**Files:** Create `src/lib/agent/{tools,chat}.ts`, `src/app/api/chat/route.ts`, `src/app/api/transcribe/route.ts`, `src/components/shell/ChatSheet.tsx` · Test `tests/agent/chat.test.ts`

**Interfaces — Produces:**
```ts
const toolSpecs: ToolSpec[]   // get_events, get_weather, search_wardrobe, plan_outfit, plan_trip, log_wear, add_event (JSON-schema params)
runChat(userId: string, messages: ChatMessage[], deps): Promise<{ reply: string; outfitId?: string; tripId?: string }>
```
Loop: `chat.complete` → execute tool calls via `dispatchTool(name, args, ctx)` → feed results back; max 5 tool rounds. `plan_outfit`/`plan_trip` always call `planOutfit`/`planTrip` — the chat model never returns garments directly. Mic: hold-to-record with `MediaRecorder` (`audio/webm`), POST to `/api/transcribe`, transcript shown, then sent to chat. Chat UI is a bottom sheet (radius 12, the one shadow).

- [ ] **Step 1: Failing tests:** mock chat model emitting `add_event{title:"drinks after work"}` then `plan_outfit{date}` → `runChat` returns a reply and an `outfitId`, and the event is stored with `source:'user'`; a tool loop exceeding 5 rounds stops with "I couldn't finish that — try asking more simply."
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: chat agent with tools and voice input`

### Task 14: Trip planner (Mon 2 Nov)

**Files:** Create `src/lib/rules/{wearLimit,capsuleReuse}.ts`, `src/lib/stylist/trip.ts` · Test `tests/stylist/trip.test.ts`

**Interfaces — Produces:**
```ts
export const tripRules: Rule[]   // dailyRules + wearLimit (hard) + capsuleReuse (soft)
planTrip(args: { destination: string; startDate: string; endDate: string; profile: Profile; wardrobe: Garment[];
  events: CalendarEvent[]; models: Pick<Models,'stylist'|'renderer'>; weatherFor: (lat:number, lon:number, date:string) => Promise<Weather> }):
  Promise<Omit<Trip,'id'|'userId'>>
detectTrips(events: CalendarEvent[]): { destination: string; startDate: string; endDate: string }[]   // titles matching /flight to (\w[\w\s]*)|trip to (\w[\w\s]*)/i; end = return flight or start + 3 days
```
`wearLimit`: for each garment, `trip.counts[id] + 1 ≤ limitFor(g)` (null = unlimited). `capsuleReuse.score` = fraction of the candidate's garments already used on the trip. Days planned in order with renders off (`renderMode:'none'`), carrying `TripUsage` forward. Garment status is ignored on trips (packed clothes start clean). Shortfall: when a day ends `bestEffort` because of `wearLimit`, add a warning naming the subcategory and counts: `"You own 3 tshirts for 4 days at 1 wear each — wash one or pack a knit."`. Packing list = garments used with day counts, sorted by category.

- [ ] **Step 1: Failing tests:**
  - 3-day trip, ample wardrobe: no t-shirt used more than once; jeans may repeat; packing list days sum correctly.
  - 4-day trip, 3 tees, no other tops: plan has 4 day entries and exactly one warning mentioning "3" and "4 days".
  - `detectTrips([{title:'Flight to Chicago', date:'2026-10-29'}, {title:'Flight to NYC', date:'2026-11-01'}])` → Chicago, 29 Oct – 1 Nov.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: trip planner with rewear limits`

### Task 15: Trip screens (Mon 2 Nov)

**Files:** Create `src/app/(app)/trips/page.tsx`, `src/app/(app)/trips/[id]/page.tsx`, `src/app/api/trips/route.ts`, `src/components/trips/{TripForm,DayRow,PackingList,TripWarning}.tsx` · Test `tests/e2e/trips.spec.ts`

Per the "Trip" mockup: label with dates, serif city, one-line summary ("11 pieces · 6° to 12°, windy"), day rows (serif day name, event line, mini cutouts), packing checklist (checkbox state kept in `localStorage`, garment + "3 days · limit 5"), warning line in `--warn`. Trips list offers detected trips from the calendar first ("Chicago · Thu–Sun — plan packing?"). Primary action "Pack for {city}".

- [ ] **Step 1: Failing e2e:** create trip Chicago 3 days → page lists 3 day rows and a packing list; checking an item survives reload.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `check:slop`.
- [ ] **Step 5: Commit** `feat: trip screens`

### Task 16: Closet gap card (Tue 3 Nov)

**Files:** Create `src/lib/stylist/gap.ts`, `src/components/today/GapCard.tsx`, `src/app/api/gaps/route.ts` · Test `tests/stylist/gap.test.ts`

**Interfaces — Produces:**
```ts
countValidOutfits(wardrobe: Garment[], day: DayContext, profile: Profile): number   // enumerate top×bottom×shoes (+onepiece×shoes), outerwear optional, hard dailyRules only; cap 5,000 combos
closetGaps(args: { wardrobe: Garment[]; profile: Profile; stylist: Stylist; days: DayContext[]; productSearch: (g: GarmentTags) => Promise<{ title: string; url: string; price?: string }|null> }):
  Promise<{ item: GarmentTags; newOutfits: number; product: { title: string; url: string; price?: string }|null }|null>
```
`newOutfits` = Σ over `days` (use 3 representative contexts: smart/dry, casual/rain, casual/cold) of `countValidOutfits(wardrobe + item) − countValidOutfits(wardrobe)`. Best item = max `newOutfits`; `null` when all are 0. `productSearch` uses Muse Spark with the Model API web-search tool (real) / fixture (mock). Card copy: "A {name} would make {n} new outfits possible." + product link; one card on Today below the look, dismissible for 7 days.

- [ ] **Step 1: Failing tests:** wardrobe with tops + bottoms but only rain-unsafe shoes, rainy context → leather boots suggestion has `newOutfits > 0` and ranks first; adding an item identical to an existing one yields 0.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: closet gap card`

### Task 17: Onboarding and Settings (Tue 3 Nov)

**Files:** Create `src/app/onboarding/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/api/profile/route.ts`, `src/components/settings/{WearLimitsEditor,RenderModePicker,PersonPhoto}.tsx` · Test `tests/e2e/onboarding.spec.ts`

Steps: Google sign-in → home city (geocoded, stores lat/lon and the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` as `tz`) → optional photo of you → render mode (default Flat lay) → rewear limits (defaults shown, skippable) → `/scan`. Settings edits the same fields. Inputs: label above, 16 px, focus ring per style guide.

- [ ] **Step 1: Failing e2e:** complete onboarding with "Brooklyn" and skip optional steps → lands on `/scan`; Settings shows Flat lay and jeans limit 5; changing jeans to 3 persists.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: onboarding and settings`

### Task 18: Real Meta adapters and SAM check (as soon as credits arrive)

**Files:** Create `src/lib/models/real/{client,segmenter,tagger,stylist,renderer,transcriber,chat}.ts`, `scripts/smoke-real.ts`, `scripts/sam-check.ts` · Test `tests/models/real.contract.test.ts` (skipped unless `META_API_KEY` set)

**Interfaces:** same as Task 4. `client.ts`: `new OpenAI({ baseURL: process.env.META_API_BASE_URL, apiKey: process.env.META_API_KEY })` plus `withTimeout(promise, ms, adapter)`. Stylist/tagger use `muse-spark-1.3` with JSON-schema structured output; parse with the same Zod schemas the mocks satisfy; one retry on `bad_output`. Segmenter, renderer and transcriber endpoints and payload shapes: take them from the Meta Model API docs (dev.meta.ai) at implementation time — record the exact endpoint and request in a comment at the top of each file.

- [ ] **Step 1: SAM check first:** `npx tsx scripts/sam-check.ts path/to/closet.mp4` — sends the video (and, separately, 10 sampled frames) with prompt "clothing item"; prints track count, mask format, frame limits, latency. Record findings in `docs/notes/sam-check.md`. If video tracking is weak, implement `segment()` as per-frame image calls + IoU matching across frames (same interface).
- [ ] **Step 2:** Write contract tests: each real adapter's output parses with the Task 4 Zod schemas for one fixture input.
- [ ] **Step 3:** Implement adapters. **Step 4:** `META_API_KEY=… npx vitest run tests/models/real.contract.test.ts` → PASS; `npx tsx scripts/smoke-real.ts` runs scan → today → trip end to end.
- [ ] **Step 5: Commit** `feat: Meta Model API adapters`

### Task 19 (stretch a): "Which look?" poll

**Files:** Create `src/app/p/[slug]/page.tsx` (public), `src/app/api/polls/route.ts`, `src/app/api/polls/[slug]/vote/route.ts`, `src/components/today/PollButton.tsx`, `src/lib/rules/pollWinner.ts` · Test `tests/polls.test.ts`

Behind `NEXT_PUBLIC_FEATURE_POLL=1`. `createPoll(userId, outfitIds: string[] /*2–3*/, eventId?: string): Promise<{ slug: string }>` (slug 8 chars, nanoid); `vote(slug, outfitId, voterKey)` where `voterKey = sha256(cookieId + ip)`; one vote per key (unique index). Share via `navigator.share({ title, url, files:[pollImage] })` with copy-link fallback. `pollWinner` soft rule: +0.5 score to the winning outfit's garments for that event; fitting note "Friends picked this, 5–2".

- [ ] **Step 1: Failing tests:** second vote with the same key is rejected; tally and winner computed; poll page renders without a session.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: which-look poll`

### Task 20 (stretch b): Style from screenshots

**Files:** Create `src/lib/rules/styleMatch.ts`, `src/app/api/style/route.ts`, `src/components/settings/StyleProfileEditor.tsx` · Test `tests/rules/styleMatch.test.ts`

Behind `NEXT_PUBLIC_FEATURE_STYLE=1`. Upload up to 12 screenshots → `stylist.styleFromImages` → `StyleProfile` saved on profile, editable (summary, traits, palette, avoid). `styleMatch` soft rule: `score` = (palette color matches + trait tag matches − avoid matches) / garments, clamped 0–1; never a hard rule. Also passed as `styleProfile` to `propose` and used to order gap suggestions.

- [ ] **Step 1: Failing tests:** profile palette `['navy','oat']` scores the navy/oat outfit above the rust/olive one; `avoid:['logo']` lowers a garment tagged `logo`; a hard violation still rejects a high-style outfit.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: style profile from screenshots`

### Task 21: Deploy, demo pass, submission (Tue 3 – Wed 4 Nov)

**Files:** Create `tests/e2e/demo.spec.ts`; Modify `README.md`

- [ ] **Step 1:** `demo.spec.ts` walks the spec §9 demo script in mock mode: scan → Today with "↺" note → add "Drinks" → trip Chicago → gap card visible. Run → PASS.
- [ ] **Step 2:** Deploy to Vercel with Supabase prod project and Google OAuth redirect; set `MODELS=real`. Run `scripts/smoke-real.ts` against prod.
- [ ] **Step 3:** Manual demo rehearsal on a phone against real APIs; fix anything that breaks; run the style-guide §10 checklist on every screen (light + dark).
- [ ] **Step 4:** README: what it does, which Meta models do what, how to run (`MODELS=mock` works with no keys), architecture diagram, and the statement that all code was written 27 Oct – 4 Nov 2026 during the hackathon.
- [ ] **Step 5:** Record the 3-minute video; submit on the CV platform by the afternoon of 4 Nov. **Commit** `docs: README and demo test`
