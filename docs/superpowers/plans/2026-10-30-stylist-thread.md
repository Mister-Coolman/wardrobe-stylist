# Stylist Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One saved stylist conversation per user. It does real work (plans and swaps looks, changes the closet, reads photos, messages first) and can be reached in the app and on WhatsApp, with both showing the same thread.

**Architecture:**
- Messages are stored in a new `messages` table. `runThread` saves the user's message, runs the existing tool loop over the last 20 messages, and saves the reply with the cards the tools produced.
- The web Stylist tab and the WhatsApp webhook are two front ends on `runThread`. A card button just sends a message, so every action works the same in both.

**Tech Stack:** Next.js 16 (App Router, `after()`), React 19, Zod 4, Supabase, Muse Spark 1.3 chat with tools and vision, SerpApi, WhatsApp Cloud API, Vercel cron, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-stylist-thread-design.md`

## Global Constraints

- **Outfits come only from the rule-checked planner.** The agent never picks garments itself: `plan_outfit`, `another_look`, `swap_piece` and `recreate_look` all go through `planOutfit`.
- **Replies are 2–4 sentences.** Say what was done and why; ask one short question only when something is open.
- **`delete_piece` acts only with `confirm: true`,** and the prompt says to ask first.
- **Context:** the model sees the last 20 messages. A card is summarised to the model as one bracketed line.
- **Web history:** the thread page loads the last 50 messages.
- **Morning note:** cron `0 11 * * *` UTC, protected by `CRON_SECRET`. It goes to users with at least 3 confirmed pieces, at most once per user per local day.
- **WhatsApp:**
  - Check `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`.
  - Ignore repeated message ids.
  - Link codes are 6 digits and valid for 10 minutes.
  - The app never asks for a phone number.
  - Send media as signed Supabase Storage urls valid for 1 hour.
- **Migration `0004_messages.sql`:** the user runs it before deploy.
- **Copy:** plain words, no "AI", curly apostrophes as elsewhere in the UI.
- **Order of work:** thread → photos → morning note → WhatsApp. If time runs short, WhatsApp goes first.
- **Mock models** script every new tool, so e2e needs no network.

- **Swipe to reply:** the bubble follows the finger to a 56 px threshold. A quoted message reaches the model spelled out, whatever its age. WhatsApp replies map back through `wa_ids`.

## Review Focus

1. **A reply that refers back:**
   - "swap the jeans" right after a look must swap a piece in *that* outfit, not plan a new day. Task 2 tests that the card summary carries the outfit id and piece names.
   - "add 2" must add the second listing from the most recent listings card. Task 3 tests this.
2. **A repeated WhatsApp delivery,** where Meta retries the same message, must not produce two replies or two saved messages. Task 8 tests this.
3. **Two messages sent quickly from the web** must both be saved, in order, each with its own reply. Task 4 checks the order on reload.
4. **A tool error mid-loop,** like a listing photo that won't fetch or a store search with no key, must give a plain-words reply, and the user's message must stay saved. Task 2 tests a failing tool.
5. **A user with no clean bottoms** asking for a look must get the "missing" explanation, not a crash, on web and in the morning note. Tasks 2 and 6 test this.

---

### Task 1: Message storage and migration

**Files:**
- Create: `supabase/migrations/0004_messages.sql`
- Modify: `src/lib/domain/types.ts`, `src/lib/db/repo.ts`, `src/lib/db/local.ts`, `src/lib/db/supabase.ts`
- Test: `tests/db/repo.test.ts`

**Interfaces:**
- **Produces, in `src/lib/domain/types.ts`:**
  - `type Card`, exactly as in spec §2. `Product` is imported as a type from `@/lib/shop/search`.
  - `interface Message { id: string; userId: string; role: 'user' | 'assistant'; text: string; cards: Card[]; imageUrl: string | null; channel: 'web' | 'whatsapp' | 'system'; replyTo: string | null; waIds: string[]; createdAt: string }`
  - `Profile` gains `whatsappId?: string | null; whatsappLinkCode?: string | null; whatsappLinkExpires?: string | null`.
- **Produces, on `Repo`:**
  - `addMessage(m: Omit<Message, 'id' | 'createdAt'>): Promise<Message>`
  - `listMessages(userId: string, opts?: { before?: string; limit?: number }): Promise<Message[]>`: oldest first, the newest `limit` (default 50) strictly before `before` (an ISO time).
  - `listProfiles(): Promise<Profile[]>`
  - `profileByWhatsapp(waId: string): Promise<Profile | null>`
  - `getMessage(userId: string, id: string): Promise<Message | null>`
  - `messageByWaId(userId: string, waId: string): Promise<Message | null>`
  - `addWaIds(userId: string, id: string, waIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing tests** in `tests/db/repo.test.ts`, for the local repo:
  - `messages come back oldest first, the newest 50`: add 55; `listMessages(u)` has length 50, its first text is `m5` and its last is `m54`.
  - `listMessages before pages back`: `listMessages(u, { before: page[0].createdAt, limit: 5 })` gives texts `m0`–`m4`.
  - `messages are per user`.
  - `profileByWhatsapp finds the linked profile`.
  - `messageByWaId finds a message by any of its WhatsApp ids, only for its owner`.
- [ ] **Step 2: Run them** with `npx vitest run tests/db`. Expected: FAIL (`addMessage` is not a function).
- [ ] **Step 3: Implement the local repo.** Messages go in `Db.messages`. Use an ISO `createdAt` with a per-repo sequence suffix as a tiebreak, so two messages in the same millisecond keep their order.
- [ ] **Step 4: Implement the Supabase repo** with the existing `toRow`/`fromRow`. Order by `created_at desc` with `limit`, then reverse.
- [ ] **Step 5: Write the migration:**
  - the `messages` table per spec, including `reply_to uuid references messages(id) on delete set null` and `wa_ids text[] not null default '{}'` with a GIN index;
  - an index on `(user_id, created_at)`;
  - row-level security enabled, with the same policy style as `0001_init.sql`;
  - the `profiles` columns `whatsapp_id text unique`, `whatsapp_link_code text`, `whatsapp_link_expires timestamptz`.
- [ ] **Step 6: Run the tests.** `npx vitest run tests/db` should PASS, and so should `npx tsc --noEmit`.
- [ ] **Step 7: Commit:** `feat: messages table and repo`.

### Task 2: Thread core: runThread, cards, context

**Files:**
- Create: `src/lib/agent/thread.ts`
- Modify: `src/lib/agent/chat.ts` (keep the loop and move it into `thread.ts`; delete `runChat`), `src/lib/agent/tools.ts` (`ToolContext`), `src/lib/models/types.ts` (`ChatMessage`), `src/lib/models/real/chat.ts`, `src/lib/models/mock/others.ts` (`mockChat`)
- Test: `tests/agent/thread.test.ts` (replaces `tests/agent/chat.test.ts`, carrying its cases over)

**Interfaces:**
- **Consumes:** `Repo.addMessage` and `listMessages` from Task 1.
- **Produces:**
  - `ToolContext` gains:
    - `cards: Card[]`, which tools push to;
    - `imageUrl?: string`, the photo in the current user message;
    - `lastListings?: Product[]`, from the newest listings card in context;
    - `channel: Message['channel']`.

    It drops `outfitId` and `tripId`.
  - `ChatMessage` user variant: `{ role: 'user'; content: string; imageUrl?: string }`. The real chat sends the newest user `imageUrl` as an `image_url` part via `toDataUrl(url, 1024)`; older images become the text `[photo]`.
  - `export function summariseCard(c: Card): string`, for example `[outfit o_1 for 2026-10-30: Navy wool overcoat, White oxford shirt, Selvedge jeans]`, `[listings: 1. UA Rival Fleece Joggers (Under Armour, $55.00); 2. …]`, `[trip t_1: Chicago, 3 days]`, `[pieces: White oxford shirt (laundry)]`, `[added: Selvedge jeans]`.
  - `export async function runThread(user: SessionUser, input: { text: string; imageUrl?: string; channel: Message['channel']; replyTo?: string | null; waId?: string }, deps: { repo: Repo; models: Models; geocode?: ToolContext['geocode'] }): Promise<{ user: Message; reply: Message }>`
  - `export const STYLIST_FAILED = 'Couldn’t reach your stylist. Try again.'`

- [ ] **Step 1: Write failing tests** in `tests/agent/thread.test.ts`, using the local repo, mock models and fixture weather:
  - `saves the user message and the reply, with the outfit card`: "drinks after work" gives `reply.cards[0].kind === 'outfit'` and `listMessages` has 2 messages.
  - `the model sees earlier cards as one line each`: wrap `mockChat` to capture messages; after a look, the next call's history contains `[outfit ` and the outfit's id.
  - `only the last 20 messages go to the model`.
  - `a reply spells out the quoted message, even one older than the last 20`: reply to message 1 of 30; the newest user line to the model starts with `(Replying to: [outfit `.
  - `a reply to another user's message id is ignored` (stored as null).
  - `a failing tool still gives a reply in plain words and keeps the user message`: a tool that throws gives a non-empty reply text and 2 saved messages.
  - `a model failure saves the user message and throws ModelError` (the route turns it into `STYLIST_FAILED`).
  - `no clean bottoms: the reply explains, no card`.
  - The carried-over cases: the 5-round limit, unknown tool, bad arguments, `plan_trip` gives a trip card.
- [ ] **Step 2: Run them** with `npx vitest run tests/agent`. Expected: FAIL.
- [ ] **Step 3: Implement `runThread`:**
  1. Save the user message.
  2. Load the last 20 messages.
  3. Map each to a `ChatMessage`: assistant text plus a summary line per card. The newest user message carries `imageUrl`.
  4. With `replyTo` (looked up with `getMessage` for this user), prefix the newest user line with `(Replying to: …)`: the quoted text and its card summaries. `lastListings` comes from the quoted message's listings card if it has one, otherwise from the newest listings card. The `outfitId` the agent should act on is then the quoted outfit.
  5. Run the loop as `runChat` did, with `MAX_TOOL_ROUNDS` 5.
  6. Save the reply with `ctx.cards`.
- [ ] **Step 4: Update the existing tools to push cards:**
  - `plan_outfit` pushes an outfit card, from `plan.result`: pieces with `cutoutUrl` and `outfit.renderUrl`.
  - `plan_trip` pushes a trip card.
- [ ] **Step 5: Update the system prompt** per the Global Constraints:
  - 2–4 sentences;
  - refer to things by the bracketed lines;
  - ask before deleting;
  - name the three photo intents (Task 5 adds the tools).
- [ ] **Step 6: Run the tests.** `npx vitest run tests/agent` and `npx tsc --noEmit` should PASS.
- [ ] **Step 7: Commit:** `feat: saved stylist thread with cards`.

### Task 3: New tools: swap, another look, closet edits, store search

**Files:**
- Modify: `src/lib/agent/tools.ts`, `src/lib/today.ts`, `src/lib/stylist/loop.ts`, `src/lib/models/types.ts` (`ProposeInput`), `src/lib/models/real/stylist.ts`, `src/lib/models/mock/stylist.ts`, `src/lib/models/mock/others.ts` (`mockChat` phrases)
- Create: `src/lib/rules/keep.ts`
- Test: `tests/agent/tools.test.ts`, `tests/stylist/loop.test.ts`

**Interfaces:**
- **Consumes:** `ToolContext.cards` and `lastListings` (Task 2); `getProductSearch` and `fetchProductImage` (`src/lib/shop`); `runScan` with `listing`.
- **Produces:**
  - `ProposeInput` gains `keep?: string[]; drop?: string[]; wish?: string; referenceImageUrl?: string`. With `referenceImageUrl`, the real stylist adds the image as an `image_url` part (via `toDataUrl(url, 1024)`) with "Match this look as closely as the closet allows"; the mock ignores it. The real stylist puts them in the task line: "Keep pieces …; do not use …; the owner wants: …". The mock builds from `keep`, adds a clean piece of each missing core category not in `drop`, and fills the rest as now.
  - `keepRule(keep: string[], drop: string[]): Rule` (hard): a candidate missing a kept id or containing a dropped id fails, with the message "Keep X" or "Leave out X".
  - `planToday` opts gain `wish?: string`, `referenceImageUrl?: string` and `swap?: { outfitId: string; drop: string[]; wish?: string }`. `plan_outfit` and `another_look` take `{ date?, wish? }`, so "a good fall themed outfit for Saturday" is `plan_outfit({ date: <Saturday>, wish: 'fall themed' })`. It loads that outfit, sets keep = outfit ids minus drop, adds `keepRule`, and plans fresh for the outfit's date.
  - The tools, with their Zod schemas:
    - `another_look({ date? })`;
    - `swap_piece({ outfitId, drop: string[] (ids), wish?: string })`;
    - `set_status({ ids: string[], status: 'clean' | 'worn' | 'laundry' })`, using `washPatch` from `src/lib/garments`;
    - `edit_piece({ id, name?, brand?, fit?, tags? })`;
    - `delete_piece({ id, confirm: boolean })`: without confirm it returns `{ error: 'ask the owner first' }`;
    - `shop_search({ query })`;
    - `add_listing({ number: int ≥ 1 })`.

    Card pushes are as in the spec table. `add_listing` runs the same steps as `POST /api/shop`, but synchronously, and confirms the piece.
  - `mockChat` phrases:
    - "another look" → `another_look`;
    - /swap (the )?(\w+)/ → `search_wardrobe` then `swap_piece` with the matched piece from the newest outfit card;
    - /spilled|dirty|laundry/ + a piece word → `set_status` laundry;
    - /^(find|search|add my) / → `shop_search`;
    - /^add (\d+)$/ → `add_listing`;
    - /^(delete|remove) / → reply asking to confirm;
    - /^yes,? delete/ → `delete_piece` with confirm.

- [ ] **Step 1: Write failing tests:**
  - `tests/stylist/loop.test.ts`: `keepRule rejects a candidate that drops a kept piece or keeps a dropped one`.
  - `tests/agent/tools.test.ts`:
    - `swap_piece keeps every piece but the dropped one` (outfit A/B/C, drop B → result contains A and C, not B);
    - `another_look gives a different outfit`;
    - `set_status laundry`;
    - `edit_piece changes only the given fields`;
    - `delete_piece without confirm refuses and keeps the piece`;
    - `shop_search pushes a listings card`;
    - `add_listing 2 adds the second listing of the newest card, confirmed, named from it`;
    - `add_listing with no listings card is an error`.
- [ ] **Step 2: Run them** with `npx vitest run tests/agent tests/stylist`. Expected: FAIL.
- [ ] **Step 3: Implement** `keepRule`, the `ProposeInput` fields in both stylists, `planToday` swap, the tools, and the mock phrases.
- [ ] **Step 4: Run the tests.** `npx vitest run` and `npx tsc --noEmit` should PASS.
- [ ] **Step 5: Commit:** `feat: stylist tools for swaps, closet edits and store search`.

### Task 4: Stylist tab, thread API and cards UI

**Files:**
- Create:
  - `src/app/api/thread/route.ts`
  - `src/app/(app)/stylist/page.tsx`
  - `src/components/stylist/Thread.tsx`
  - `src/components/stylist/Composer.tsx` (text, hold-to-talk mic moved from `ChatSheet`)
  - `src/components/stylist/cards/OutfitCard.tsx`, `ListingsCard.tsx`, `PiecesCard.tsx`, `TripCard.tsx`
- Modify: `src/components/shell/BottomNav.tsx` (Stylist first, Phosphor `ChatCircle`), `src/components/shell/ChatLauncher.tsx` (the mic links to `/stylist`; hidden on `/stylist`), `src/app/page.tsx` (redirect to `/stylist`), `src/app/(app)/layout.tsx`
- Delete: `src/components/shell/ChatSheet.tsx`, `src/app/api/chat/route.ts`
- Test: `tests/e2e/stylist.spec.ts` (replaces `chat.spec.ts` and `chat-today.spec.ts`, keeping their cases), plus updates to `shell.spec.ts` and `today.spec.ts` where they open the chat sheet

**Interfaces:**
- **Consumes:** `runThread` and `STYLIST_FAILED` (Task 2); `Repo.listMessages` (Task 1).
- **Produces:**
  - `GET /api/thread?before=` → `{ messages: Message[] }`.
  - `POST /api/thread` (multipart: `text`, optional `image` File, optional `replyTo`) → `{ user: Message, reply: Message }`; on `ModelError`, 502 `{ error: 'stylist_failed', user }`.
  - `export const maxDuration = 300`.
  - `Thread` props: `{ initial: Message[] }`.

**UI rules:**
- **Layout:** the user's messages are right-aligned and muted, as in `ChatSheet`. The stylist's replies are full width with their cards under the text. "via WhatsApp" is a small label on WhatsApp messages.
- **Scrolling:** a new message scrolls into view.
- **While waiting:** "Thinking it through…".
- **Card buttons:**
  - Outfit card: **Another look**, **Swap a piece**, **Wore it**.
  - Listings: each tile sends `Add N`.
  - **Wore it** sends `Wore it`; the mock and the prompt map it to `log_wear` on the newest outfit card.
- **Swipe to reply** (`src/components/stylist/SwipeToReply.tsx` wraps each message):
  - Pointer events with `touch-action: pan-y`, so vertical scrolling still works. A drag counts only when its horizontal movement exceeds its vertical.
  - The bubble moves with the finger, capped at 80 px, and the reply icon (Phosphor `ArrowBendUpLeft`) fades in. Release at 56 px or more sets the quote; under 56 px it springs back with a 150 ms transform transition. Reduced motion skips the spring.
  - Also a **Reply** button, visible on hover and `:focus-within`, with `aria-label="Reply to this message"`.
  - Quote bar above the composer: one line, `line-clamp-1`, and a ✕ button (`aria-label="Cancel reply"`). Sending clears it.
  - A message with `replyTo` shows the quoted line above its text. Tapping it scrolls to the original (`id="m-{id}"`) and highlights it for 1.5 s.
- **Failure:** the alert shows `STYLIST_FAILED` and a **Retry** button that re-sends the text.
- **Empty thread:** "What's on today?" with the three example prompts as tappable chips.

- [ ] **Step 1: Write failing e2e tests** in `tests/e2e/stylist.spec.ts`:
  - `the app opens on the Stylist tab`;
  - `"drinks after work" shows a look card; the thread survives a reload`;
  - `Another look from the card gives a second look card`;
  - `"swap the jeans" changes only the jeans` (piece names in the second card = the first card's minus the jeans, plus one bottom);
  - `"I spilled coffee on the white oxford" puts it in the laundry` (Closet → Laundry filter shows it);
  - `"add my black under armour sweatpants" then "add 1" adds the joggers to the closet`;
  - `the mic on Closet opens the Stylist thread`;
  - `swipe a look card to reply "swap the jeans": that look changes, and the sent message shows the quote`, using `page.mouse` down/move/up to drag 70 px right on the first look card after a second look exists. The swapped look keeps the first card's other pieces;
  - `the Reply button does the same with the keyboard`;
  - the carried-over cases:
    - `chat-today` #4: the look on Today updates after a chat look;
    - #6: Logged after a reload, via **Wore it** on the card.
- [ ] **Step 2: Run them** with `npx playwright test tests/e2e/stylist.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the route, page (server component loads 50 messages), components, nav and redirect. Delete the sheet and the old route; update `shell.spec.ts`/`today.spec.ts` selectors that opened the sheet.
- [ ] **Step 4: Run all tests.** `npx playwright test` and `npx vitest run` should PASS. Take a phone-width screenshot of a thread with an outfit card and a listings card, in dark mode.
- [ ] **Step 5: Commit:** `feat: Stylist tab with a saved thread and cards`.

### Task 5: Photos in the thread

**Files:**
- Modify: `src/components/stylist/Composer.tsx` (photo button: `input type=file accept=image/*`, resized with `samplePhoto` from `FrameSampler`), `src/app/api/thread/route.ts` (stores the image under `${userKey}/thread/${uuid}.jpg`), `src/lib/agent/tools.ts`, `src/lib/models/mock/others.ts`
- Test: `tests/agent/tools.test.ts`, `tests/e2e/stylist.spec.ts`

**Interfaces:**
- **Consumes:** `ToolContext.imageUrl` (Task 2); `runScan`; `planToday` (Task 3, with `wish`).
- **Produces:** these tools.
  - `add_photo_piece({})`: runs `runScan` on `ctx.imageUrl` as a one-frame job and waits. It pushes a `pieces` card of the unconfirmed pieces and returns their ids and names.
  - `keep_pieces({ ids })`: confirms them and pushes an `added` card.
  - `rate_outfit({ date? })`: returns the day's weather, events and required formality. The model rates the photo it sees against these.
  - `recreate_look({ date?, wish? })`: `planToday` fresh with `referenceImageUrl = ctx.imageUrl` (or the image of the message being replied to) and the wish, and pushes an outfit card. It returns the planned pieces plus the rule notes, so the reply can say what differs from the photo and why.

  Tools needing a photo return `{ error: 'no photo in this message' }` without `ctx.imageUrl`.
- **Mock chat:** a user message with `imageUrl`:
  - "add" → `add_photo_piece`;
  - "rate|how do I look" → `rate_outfit`;
  - "recreate|this look" → `recreate_look`;
  - "yes|add them" after a pieces card → `keep_pieces`.

- [ ] **Step 1: Write failing tests:**
  - `add_photo_piece then keep_pieces adds the photo's pieces confirmed`;
  - `photo tools without a photo say so`;
  - `recreate_look passes the photo to the stylist` (a capturing stylist sees `referenceImageUrl`);
  - `plan_outfit with a wish passes it to the stylist, and the weather rules still apply`;
  - e2e `send a photo, "add these", "yes" → pieces in the closet` (with `tests/fixtures/closet.jpg`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** A thumbnail of the user's photo shows in their message bubble.
- [ ] **Step 4: Run the tests.** `npx vitest run` and `npx playwright test tests/e2e/stylist.spec.ts` should PASS.
- [ ] **Step 5: Live check** with `MODELS=real`, using a `.data/check` script on `samples/` photos, and record what you find in `docs/notes/sam-check.md`:
  - one shirt photo → "add this";
  - one outfit mirror selfie → "how do I look";
  - one screenshot → "match this look";
  - text only → "a good fall themed outfit"; check the pieces read as fall;
  - a reel screenshot with "make something like this, from @someone's reel" → the reply credits @someone.
- System prompt (with Task 2's): an Instagram or TikTok link gets "Send me a screenshot of the moment you liked." Unit test with the mock: a message containing `instagram.com/reel/` gets that reply and no tool call.
- [ ] **Step 6: Commit:** `feat: send the stylist photos`.

### Task 6: Morning note

**Files:**
- Create: `src/app/api/cron/morning/route.ts`, `src/lib/agent/morning.ts`, `vercel.json` (`{ "crons": [{ "path": "/api/cron/morning", "schedule": "0 11 * * *" }] }`)
- Test: `tests/agent/morning.test.ts`

**Interfaces:**
- **Consumes:**
  - `Repo.listProfiles`, `addMessage` and `listMessages`;
  - `planToday`. The user is `{ userId, email: '', googleAccessToken: null }`, so the note uses user-added events only; the cron has no Google token.
- **Produces:**
  - `export async function morningNote(repo: Repo, profile: Profile, deps: { send?: (p: Profile, m: Message) => Promise<void> }): Promise<Message | null>`.
  - It returns null when:
    - the user has fewer than 3 confirmed pieces; or
    - there's already a `system` message dated today in the user's time zone.
  - Text: "Morning. {title}: {pieces}." plus at most one line:
    - rain ≥ 50%: "Rain from {when} — {rain-safe piece} handles it.";
    - a dress-coded event ≥ 4: "Dressed up for {event}.";
    - more than 3 pieces in the laundry: "{n} pieces in the laundry."

    With an insufficient wardrobe: "Morning. No clean {missing} today — wash day?"
  - Route: `GET`, 401 unless `Authorization: Bearer ${CRON_SECRET}`. It runs `morningNote` for every profile, with `send` set to the WhatsApp sender once Task 8 exists, and returns `{ sent: n }`.

- [ ] **Step 1: Write failing tests:**
  - `sends one note with an outfit card`;
  - `a second run the same day sends nothing`;
  - `fewer than 3 pieces: nothing`;
  - `no clean bottoms: the wash-day line, no card`;
  - `route refuses without the secret`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `npx vitest run` should PASS.
- [ ] **Step 5: Commit:** `feat: morning note`. The user must add `CRON_SECRET` to Vercel; say so in the hand-off.

### Task 7: WhatsApp linking in Settings

**Files:**
- Create: `src/app/api/whatsapp/link/route.ts`, `src/components/settings/WhatsappLink.tsx`
- Modify: `src/components/settings/SettingsView.tsx`
- Test: `tests/e2e/onboarding.spec.ts` (settings section), `tests/whatsapp/link.test.ts`

**Interfaces:**
- **Produces:**
  - `POST /api/whatsapp/link` → `{ code: string, expires: string, number: string | null }`. It makes a random 6-digit code, stores it on the profile with expiry now + 10 min, and returns it with `WHATSAPP_DISPLAY_NUMBER` (env, e.g. "+1 555 0100", or null when unset).
  - `DELETE /api/whatsapp/link` clears `whatsappId`.
  - `export function matchLinkCode(profiles: Profile[], text: string, now: Date): Profile | null`. It matches exactly 6 digits, after trimming, against a profile whose code hasn't expired.
- **Settings section "Text your stylist on WhatsApp":**
  - not linked: **Get a code**, which shows the code, the number, and "Send this code to that number on WhatsApp within 10 minutes.";
  - linked: "Linked." and **Unlink**;
  - no `WHATSAPP_TOKEN` set: the section is hidden.

- [ ] **Step 1: Write failing tests:** `matchLinkCode` with the right code, a wrong code, an expired code, and text that only contains the code ("my code is 123456" doesn't match).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** They should PASS.
- [ ] **Step 5: Commit:** `feat: link WhatsApp from Settings`.

### Task 8: WhatsApp webhook and replies

**Files:**
- Create: `src/lib/whatsapp.ts`, `src/app/api/whatsapp/route.ts`
- Modify: `src/lib/storage.ts` (`StorageLike.signedUrl?(url: string, seconds: number): Promise<string | null>`, implemented for Supabase), `src/app/api/cron/morning/route.ts` (pass `send`)
- Test: `tests/whatsapp/webhook.test.ts`

**Interfaces:**
- **Consumes:** `runThread` (Task 2), `matchLinkCode` and `profileByWhatsapp` (Tasks 1, 7), `morningNote` (Task 6).
- **Produces, in `src/lib/whatsapp.ts`:**
  - `verifySignature(rawBody: string, header: string | null, secret: string): boolean`, using HMAC-SHA256 and `timingSafeEqual`.
  - `parseInbound(body: unknown): { waId: string; messageId: string; text?: string; mediaId?: string; contextId?: string }[]`. `contextId` is the replied-to message's id from `message.context.id`. It handles text, image (with caption) and interactive `button_reply` (the title becomes the text).
  - `downloadMedia(mediaId): Promise<Buffer>`: Graph `GET /{media-id}` gives the url, then GET it with the token.
  - `sendReply(waId: string, m: Message, storage: StorageLike): Promise<string[]>` returns the WhatsApp ids of everything it sent, which the caller stores with `addWaIds`:
    1. The text goes as a text message.
    2. For each outfit card: an image message (signed `imageUrl`, caption the piece names), then an interactive button message with 3 buttons whose titles are "Another look", "Swap a piece" and "Wore it". The titles are at most 20 characters.
    3. A listings card becomes a numbered text list: `1. Title — Store, $Price`, with "Reply with a number to add it."
    4. A trip card becomes its text plus the app link.
  - `sendTemplate(waId, name: 'morning_look' | 'hello_world', bodyParams: string[])`. The language is `en_US`; `hello_world` has no params.
  - Graph base `https://graph.facebook.com/v21.0`.
  - An inbound number reply to a listings card ("2") is turned into `Add 2` before `runThread`.
- **The route:**
  - `GET` answers `hub.challenge` when `hub.verify_token` matches.
  - `POST`:
    1. Read the raw text and verify the signature, returning 401 if it fails.
    2. Answer 200 at once.
    3. In `after()`, for each inbound message:
       - skip it if its message id has been seen (an in-memory LRU of 500, plus a check that no `messages` row has the same text from WhatsApp within 2 minutes);
       - a link code links the number and replies "Linked — text me anytime.";
       - an unlinked sender gets "Link me from Settings in the app first.";
       - otherwise, a photo is stored and `runThread` runs with `channel: 'whatsapp'`, `waId: messageId`, and `replyTo` set to `messageByWaId(contextId)?.id`. Then `sendReply`, and `addWaIds` on the reply.
  - The morning note uses `sendTemplate('morning_look', [line])` when the user's last WhatsApp message is more than 24 h old; `WHATSAPP_TEMPLATE=hello_world` switches it to the fallback. Otherwise it uses `sendReply`.

- [ ] **Step 1: Write failing tests:**
  - `verifySignature` with a good signature, a bad one, and a missing header;
  - `parseInbound` with text, image with caption, and a button reply;
  - the route: 401 on a bad signature; a valid text from a linked number calls `runThread` once and `sendReply` once (with `fetch` stubbed); the same message id twice → once; a reply whose `context.id` is a sent outfit image reaches `runThread` with that message's id; an unlinked number gets the link prompt; a link code links.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `npx vitest run` and `npx tsc --noEmit` should PASS.
- [ ] **Step 5: Hand-off steps for the user,** written into `docs/notes/whatsapp-setup.md`:
  1. Create the Meta app with WhatsApp.
  2. Add their phone as a test recipient.
  3. Copy the token, phone id and app secret.
  4. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_DISPLAY_NUMBER` in `.env.local` and on Vercel.
  5. Set the webhook URL to `https://wardrobe-stylist-tan.vercel.app/api/whatsapp` with the verify token, and subscribe to `messages`.
  6. Submit the `morning_look` template (utility; body "Morning! {{1}}"; quick-reply button "See the look").
- [ ] **Step 6: Commit:** `feat: WhatsApp channel`.

### Task 9: Live check and deploy

- [ ] **Step 1:** The user runs `0004_messages.sql` and adds `CRON_SECRET` and the WhatsApp variables to Vercel.
- [ ] **Step 2:** Deploy, after the user's go-ahead. On the phone: a look, a swap, "spilled coffee on …", a store add, a photo add.
- [ ] **Step 3:** WhatsApp, from the user's phone:
  - link;
  - "drinks after work" → flat lay plus buttons;
  - tap **Another look**;
  - check the same messages show in the app thread.
- [ ] **Step 4:** Trigger the morning note once with `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/morning`, run by the user, since the secret is theirs.
- [ ] **Step 5:** Update `docs/notes/final-todo.md`, and commit.

### Task 10 (stretch, after Task 9): Instagram DM reels

Start only with WhatsApp live and time left before Wed.

- [ ] **Step 1 (spike, ≤ 1 h, throwaway):**
  1. The user creates a stylist Instagram professional account and adds the Instagram API (Instagram Login) to the Meta app, with their own account as a tester.
  2. Point the `messages` webhook at a logging route.
  3. DM it a reel.
  4. Record the `ig_reel` payload, and whether `payload.url` downloads as `video/mp4`, in `docs/notes/instagram-spike.md`.

  If it doesn't download as `video/mp4`, stop here.
- [ ] **Step 2, if it's a video:**
  - Linking: `profiles.instagram_id` (a migration), linked by the same 6-digit code flow as Task 7.
  - Webhook: `src/app/api/instagram/route.ts`, with the same signature check and repeated-id handling as Task 8.
  - Frames: `src/lib/reels.ts` downloads the video (≤ 50 MB) and extracts 8 evenly spaced frames with `ffmpeg-static`. SAM keeps the frame with the largest clothing area, and it's stored as the message image.
  - Agent: `runThread` runs with the reel's caption, plus "match this look"; replies go out through the Instagram Send API (text and image).
- [ ] **Step 3: Tests:** payload parsing for `ig_reel`; frame choice on a fixture clip in `samples/`; a repeated id handled once.
- [ ] **Step 4: Live:** DM a real reel and get a look back. Commit: `feat: send the stylist a reel on Instagram`.
