# Stylist thread design

Approved in chat on 30 Oct 2026. Submission: Wed 4 Nov, 9 PM.

## Goal

Make the app feel like texting a stylist, not like using a set of screens. There is one saved conversation per user, and it does real work: it plans and swaps looks, changes the closet, reads photos and messages first. It can be reached in the app and, once linked, on WhatsApp, and **both show the same thread**.

## What the user said

- "I want it to feel more agentic. It's not really so much like Muse or Instinct where I can text it."
- Texting should work in the app and through a real channel. The channel is WhatsApp.
- All four abilities: looks shown inline, acting on the closet, reading photos, messaging first.
- The thread is saved, WhatsApp linking is optional, and both channels show the same thing.
- The Meta app can't be created for about an hour, so the in-app thread comes first.
- Swipe a message to reply to it directly, as in iMessage and WhatsApp.

## Assumptions (not stated by the user)

- **Stylist becomes the first tab and the landing screen.** Today, Closet and Trips stay.
- **The morning note goes out once a day at 7:00 US Eastern,** because the free Vercel plan allows one scheduled run a day. Every user gets it at that time, whatever their time zone.
- **Deleting a piece needs a confirming message.** Other closet changes happen straight away and say what changed.

## Order of work

1. Saved thread, Stylist tab, cards, swap and closet tools.
2. Photos in the thread.
3. Morning note.
4. WhatsApp: linking, webhook, replies.

Each step ships and demos on its own. If time runs out, WhatsApp is dropped first.

## 1. Saved thread

**Storage.** A new table, `messages`:

| column | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | text | owner; row-level security as on the other tables |
| `role` | text | `user` or `assistant` |
| `text` | text | may be empty when a card carries the reply |
| `cards` | jsonb | `[]` by default; see Cards |
| `image_url` | text | a photo the user sent, as a `/api/media/…` url; null otherwise |
| `channel` | text | `web`, `whatsapp` or `system` (the morning note) |
| `reply_to` | uuid | the message this one answers (swipe to reply); null otherwise |
| `wa_ids` | text[] | WhatsApp message ids this message was sent or received as, so a WhatsApp reply can be matched back |
| `created_at` | timestamptz | default `now()` |

**Repo methods:**
- `addMessage(m)`
- `listMessages(userId, { before?, limit })`, newest last.

The local JSON repo and the Supabase repo both implement them.

**API:**
- `GET /api/thread?before=` returns the last 50 messages.
- `POST /api/thread` takes `{ text?, image? }` as multipart. It saves the user message, runs the agent on the last 20 messages, saves the reply, and returns both messages.
- The current `/api/chat` route is replaced. `ChatSheet` goes away; the mic button on other pages opens `/stylist`.

**Agent context.** The model sees the last 20 messages. Each card is summarised as a line of text, for example `[outfit o_123: Navy overcoat, Oxford, Selvedge jeans]`, so that "swap the jeans" can refer to the outfit shown.

**Replies.** The system prompt asks for 2–4 sentences: say what was done and why, then one short question when something is genuinely open. The rule against picking garments itself stays: outfits come only from `plan_outfit` and `swap_piece`, which are checked by the rule engine.

## 1b. Reply to a message

**On the web:**
- Swipe any message to the right by 56 px or more to reply to it. The bubble follows the finger and springs back; a reply icon appears at the threshold.
- The quoted message then shows above the composer as one line (its text, or its card's summary) with a ✕ to cancel.
- The sent message shows the quote above its own text; tapping the quote scrolls to the original and briefly highlights it.
- Without touch, each message has a Reply button that appears on hover and keyboard focus, so it works with a mouse and keyboard too.

**For the stylist:** a reply arrives with the quoted message spelled out, even if it's older than the last 20 messages, e.g. `(Replying to: [outfit o_9 for 2026-10-28: …])`. So replying "swap the jeans" to Tuesday's look swaps a piece in Tuesday's look, and replying "add this one" to a listings card means that card.

**On WhatsApp:** a WhatsApp reply carries the id of the message it answers. It's looked up through `wa_ids` and becomes `reply_to`, so it works the same. Replies the stylist sends don't quote anything.

## 2. Cards

A tool that produces something the user should see adds a card to the reply:

```ts
type Card =
  | { kind: 'outfit'; outfitId: string; date: string; imageUrl?: string; pieces: { id: string; name: string; cutoutUrl: string }[] }
  | { kind: 'pieces'; pieces: { id: string; name: string; cutoutUrl: string; status: string }[] }
  | { kind: 'listings'; products: Product[] }          // from the store search
  | { kind: 'trip'; tripId: string; destination: string; days: number }
  | { kind: 'added'; garmentIds: string[] }             // pieces added to the closet
```

**On the web:**
- **Outfit card:** the flat lay, or the cutouts in a row while the render is pending, the piece names, and buttons for **Another look**, **Swap a piece** and **Wore it**.
- **Listings card:** tap a listing to add it.
- **Card buttons send an ordinary message** ("Another look", "Wore it", "Add listing 2"), so every action can also be typed or sent from WhatsApp.

## 3. Tools

The 7 current tools stay. These are new:

| tool | does | card |
|---|---|---|
| `swap_piece` | Replans the given outfit, keeping every piece except one; the stylist gets the user's wish ("smarter", "warmer"). Rule-checked like `plan_outfit`. | outfit |
| `another_look` | A different outfit for the same day (the existing "Another look"). | outfit |
| `set_status` | Marks pieces clean, worn or laundry. | pieces |
| `edit_piece` | Changes a piece's name, brand, fit or details. | pieces |
| `delete_piece` | Removes a piece only when `confirm: true`. The prompt says to ask first and pass confirm only after a yes. | — |
| `shop_search` | Store search (SerpApi). | listings |
| `add_listing` | Adds a listing from the last listings card, by its number, through the existing web-add pipeline. The piece is added confirmed. | added |
| `add_photo_piece` | Turns the photo in the current message into pieces (scan pipeline, photo mode); added only after the user says yes. | added |
| `rate_outfit` | Rates the photo in the current message against the day's weather and events. | — |
| `recreate_look` | From a photo or screenshot ("match this look"): the stylist sees the image itself and plans the nearest outfit from the closet for the given day. The reply says what it couldn't match and why ("no shorts at 8°: chinos instead"). | outfit |

**Themes.** `plan_outfit`, `another_look` and `recreate_look` take an optional `wish` ("fall themed", "all black", "something for a gallery opening") and a date ("Saturday"). The wish goes to the stylist; the weather, dress-code and laundry rules still apply, so a theme can't put you in linen in the rain.

**Pieces by name.** `search_wardrobe` results give each piece's id, so later tool calls use ids, never names.

**Fake chat model.** The mock chat model gets scripted phrases for each new tool, so e2e tests run without the Meta API.

## 3b. What your stylist knows

Standing preferences the user states in the thread are remembered and steer every look:
- colours: "in general I like navy with olive";
- pairings: "this sweater with this shirt is a combination I like";
- rules: "I run warm", "never suggest shorts", "keep it smart on Mondays".

**Storage:** `profiles.stylist_notes`, a jsonb list of `{ id, text, pieceIds: string[] }`. `pieceIds` is set when the note names pieces (a pairing). There are at most 30 notes, each at most 200 characters.

**Tools:**
- `remember({ text, pieceIds? })` adds a note. Its reply says what was saved, e.g. "Noted: navy with olive."
- `forget({ id })` removes one.
- The current notes are listed in the agent's system prompt with their ids, so "forget the shorts thing" works.

**Effect on looks:**
- Every note's text goes to the outfit planner in the brief, as "The owner's standing preferences".
- A new soft rule, `likedPairs`, scores a candidate up for each remembered pairing it contains in full. It's soft, so the weather, dress-code and laundry rules still win.

**Settings** gets a "What your stylist knows" list of the notes, each with a remove button and an add field. It's the same data, so a note added in Settings shows up in the thread's behaviour.

## 3c. On a mannequin

A third way to see a look, between the flat lay and a try-on on your own photo: the pieces dressed on a plain mannequin.
- **Prompt:** muse-image gets the pieces with the same names-and-colours prompt as the flat lay. It's asked for a full-length studio photo of a featureless matte white mannequin (no face, no hair, no skin) on a plain light background, dressed in exactly these pieces, with tops tucked or untucked as the piece suggests. With no shoes in the outfit, it's told to show no shoes.
- **Choosing it:** `RenderMode` gains `'mannequin'`, offered in Settings and on Today's picker as "On a mannequin", between Flat lay and On you. It needs no photo of the user.
- **Migration:** the `profiles.render_mode` check constraint is updated to allow it.

## 4. Photos

- The composer has a photo button. On iPhone it opens the camera or library.
- The photo is resized on the phone to a 1600 px long side as JPEG and stored like a scan frame.
- The model sees the newest photo in the conversation as an image input. Muse Spark reads images through `image_url`.
- The system prompt names three intents and asks which one when it's unclear:
  - add these pieces;
  - rate my outfit;
  - recreate this look.

## 4b. Looks from Instagram

**Now: screenshots.** The flow is: pause the reel on the outfit, screenshot it, send it (app or WhatsApp) with "make something like this". That's `recreate_look`. When the user names the poster ("from @xxx's reel"), the reply credits them ("@xxx's look, from your closet").

**A pasted Instagram link** can't be read: Instagram pages refuse server fetches, and Meta removed thumbnails from its oEmbed API in November 2025. So the stylist replies "Send me a screenshot of the moment you liked." The system prompt carries this rule; no tool is needed.

**Stretch, after WhatsApp: Instagram DMs.** Share a reel from Instagram's own share button to a stylist Instagram account, and the look comes back in the DM.
- **Feasible on paper:** Meta's Instagram API (with Instagram Login) sends shared reels to the messages webhook as `ig_reel` attachments with a `url`.
- **Unknown:** whether that url is the video itself or a page.
- **So it starts with a 1-hour spike:**
  1. Create a stylist Instagram professional account, added to the same Meta app.
  2. DM it a reel.
  3. Log the webhook payload.
- **If the url is the video:**
  1. The server pulls 8 frames with `ffmpeg-static`.
  2. It keeps the frame with the largest clothing area from SAM.
  3. That frame goes to `recreate_look`, using the same thread and linking (by code) as WhatsApp.
- **If it isn't:** drop it, and keep screenshots.

## 5. Morning note

- **Schedule:** a Vercel cron at `0 11 * * *` UTC (7:00 EDT / 6:00 EST) calls `GET /api/cron/morning`. The route checks the `CRON_SECRET` header that Vercel sends.
- **Who gets it:** each user with a profile and at least 3 pieces.
- **What it does:**
  1. plans today with `planToday`;
  2. writes an assistant message with `channel: 'system'` and an outfit card;
  3. adds one line on rain, a dress-coded event, or more than 3 pieces in the laundry.
- **Skips:** a user who already has a message today from the morning run.
- **WhatsApp:** linked users also get the note there (see 6).

## 6. WhatsApp

**Setup (by the user):**
- a Meta developer app with WhatsApp, on the free test number;
- the user's own phone added as a test recipient.

**Environment variables:**
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`

**Linking:**
1. Settings has a "Text your stylist on WhatsApp" section with a 6-digit code, valid 10 minutes, and the test number.
2. The user sends the code to that number.
3. The webhook matches it and stores the sender's WhatsApp id on the profile (`whatsapp_id`, unique).
4. An Unlink button clears it.

The app never asks for a phone number.

**Webhook (`/api/whatsapp`):**
- `GET` answers Meta's verification challenge using `WHATSAPP_VERIFY_TOKEN`.
- `POST`:
  - checks `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`, returning 401 if it's wrong;
  - ignores repeated message ids;
  - answers 200 at once and does the work in `after()`.
- A text or photo from a linked number:
  1. becomes a `user` message with `channel: 'whatsapp'`;
  2. runs the same agent as the web;
  3. the reply is saved to the thread and sent back.
- An unlinked number gets one reply: "Link me from Settings in the app first."

**Sending (`src/lib/whatsapp.ts`):**
- **Text:** a text message.
- **Outfit card:** the flat lay as an image message, with the piece names as the caption. Then an interactive message with up to 3 reply buttons: Another look, Swap a piece, Wore it. A tapped button arrives as its title text and goes through the agent like a typed message.
- **Listings card:** a numbered list (title, store, price), each with its photo link. The user replies with a number.
- **Images:** sent by link. Media urls are signed Supabase Storage urls valid for 1 hour, since `/api/media` needs a session.

**The 24-hour rule.** Outside 24 hours since the user's last WhatsApp message, Meta only allows template messages. The morning note uses a template named `morning_look`: a body with the day's line, plus a "See the look" reply button. Until it's approved, the note falls back to Meta's built-in `hello_world` template, and the look is sent when the user replies.

**The web shows WhatsApp messages too.** They're in the same `messages` table, with a small "via WhatsApp" label.

## Migration `0004_messages.sql`

- the `messages` table and its row-level security policy;
- `messages.reply_to` and `messages.wa_ids`;
- `profiles.stylist_notes jsonb not null default '[]'`;
- `profiles.render_mode` check constraint replaced to allow `mannequin`;
- `profiles.whatsapp_id text unique`;
- `profiles.whatsapp_link_code text`;
- `profiles.whatsapp_link_expires timestamptz`.

The user runs it in the Supabase SQL editor before deploy.

## Errors

- **A tool fails:** the model gets `{ error }` and says what went wrong in plain words, as now.
- **The model call fails:** the thread shows "Couldn't reach your stylist. Try again." The user's message stays saved, with a Retry button.
- **WhatsApp send fails:** it's logged, and the reply is still in the app thread.

## Tests

**Unit:**
- repo messages, in order and with paging;
- card summaries in the agent context;
- `swap_piece` keeps the other pieces;
- `delete_piece` without confirm refuses;
- a reply quotes the message it answers to the model, even when that message is older than the last 20;
- a WhatsApp reply to a sent outfit image maps to that message;
- webhook signature check, link code (right, wrong, expired), repeated message id, an image message going to the agent;
- morning note: skips users with fewer than 3 pieces, and is sent once per day.

**E2e (fake models):**
- the thread survives a reload;
- "Another look" from a card;
- "swap the jeans" changes only the jeans;
- "spilled coffee on the white oxford" puts it in the laundry;
- a store search and "add 1";
- a photo → "add these" → pieces added;
- the mic on another page opens the thread;
- swipe a look card to reply "swap the jeans" → that look changes, and the sent message shows the quote.

**Live:** a real conversation on the deployed app, then on WhatsApp from the user's phone.

## Out of scope

- Reading Instagram links or reels directly, except through the DM stretch above.

- Alerts during the day; the free cron plan runs once a day.
- Group chats, voice notes on WhatsApp, and messaging anyone who isn't a test recipient. Those need Meta business verification.
