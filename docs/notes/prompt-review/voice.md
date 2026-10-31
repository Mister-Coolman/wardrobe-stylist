# Voice review: what the owner reads

## 1. Rule notes and violation messages (`src/lib/rules/*.ts`; shown on Today and passed to chat as `problems`)

1. **Warmth points reach the owner.** `weather.ts:46`: `Too light for a low of 4° — layer up to 6, the warmest this closet allows`. On a best-effort day (no coat, the owner's real closet) this is the fitting note, and it goes to chat as `problems`. The owner reads "layer up to 6". Replace with:
   `Too light for a low of ${w.tempLowC}° — wear your warmest layers; a coat would help`
   (the model already sees each piece's warmth, so it doesn't need the number. Update `tests/rules/rules.test.ts:92`.)
2. **"head to shoes" is garbled, and it's the wrong note for a closet with no shoes.** `completeness.ts:35`: `Complete: 3 pieces`. →
   with shoes: `Head to toe: ${n} pieces`; without: `Top and bottom sorted — no shoes in the closet yet`.
3. **Arrows and shorthand.** `formality.ts:38` `Dress code: Client pitch → smart` → `Smart enough for ${top.title}` / `A ${word} day`. `formality.ts:27` `Selvedge jeans too casual for smart` → `${names} ${is/are} too casual for a smart day`.
4. **Layer jargon.** `completeness.ts:27` `Two of the same layer: Navy polo and White polo` → `Navy polo and White polo don't go on together — one or the other`.
5. **Trip notes.** `wearLimit.ts:15` `already worn 2× — limit 2 before a wash` → `${g.name}'s been worn ${n} times — due a wash`. `capsuleReuse.ts:15` `first day of the capsule` → `Packing light: day one`.
6. **Filler notes that say nothing** (`likedPairs` "No remembered pairing in this look", `pollWinner` "No poll for today", `styleMatch` "Style: no profile yet"). Return `''` and skip empty notes in `FittingNotes`.

## 2. Outfit brief (`stylist.ts` `rules(unit)`)

1. **Gaps have nowhere to go.** Reasons are per piece, so "what I couldn't match" (recreate_look) and "a coat would help" have no slot: the missing coat isn't a piece. Then chat either says nothing about it or makes something up. Add an optional per-look field `note` to the `Looks` schema, and to the prompt:
   `note: one plain line on what the closet can't do today, or "" ("No coat — this is as warm as it gets; a coat would help", "No camel coat, so the navy one stands in").`
   Return it from `look()` in `tools.ts`, and show it under the look.
2. **Reasons drift into the banned shape.** The bad examples ("Adds 3 warmth…", "…keeps level 2") start with a verb, then a number. The prompt bans the words but not the shape. Append:
   `Under 10 words each, all different, none starting "Adds", "Keeps" or "Provides", and no numbers except a temperature. Say what the piece does with the others ("Navy calms the olive"), not that it is "perfect" or "elevated".`
3. **Titles.** "2–4 words" with one example lets "Smart Casual Layers" or "Look 1" through. →
   `Titles are 2–4 plain words, each look's different, no numbers or temperatures ("Rain-ready client day", "Quiet Friday navy").`
4. **Wind is in km/h for a °F owner.** `dayBrief`: `wind ${windKph} km/h`, and `get_weather` sends `windKph` too. The model repeats it ("20 km/h gusts"). When unit is F, send `wind ${Math.round(kph*0.621)} mph`; in `get_weather`, send `wind: "12 mph"` and drop the raw key.

## 3. Chat stylist (`thread.ts` `SYSTEM`)

1. **It recites the card, and every reply opens the same way.** "Reply in 2–4 sentences: say what you did" plus a `summary` that lists every piece name gives "Pulled a … : Navy polo, Grey chinos, Oat knit." each time. Replace line 2 with:
   `Reply in 1–3 short sentences. The card shows the pieces, so don't list them: name one or two and why they work today. Don't open with "Pulled", "Here's", "Sure" or "Great"; vary how you start.`
2. **Honesty about gaps isn't asked for.** Add:
   `If a result has problems or a note, say it plainly and say what would fix it ("No coat in there, so it's your warmest layers. A coat would help. Want me to look for one?"). Never pretend a look is warmer or smarter than it is.`
3. **Errors get quoted.** Tool errors are internal ("no such outfit", "insufficient_wardrobe", "bad arguments…"). Add:
   `When something fails, say in plain words what didn't work and what they can do; never quote an error, a tool or a rule.`
   Also add "tools, rules or checks" to the AI line: `Never mention being an AI, or your tools, rules or checks.`
4. **"How do I look" invites flattery.** `→ rate_outfit, then judge what you see` → `…then say one thing that works and one you'd change, honestly; no flattery.`
5. **The @poster credit is vague.** → `Credit whose look it is by handle, from their message or visible in the screenshot ("Your take on @someone's fall look").` The pinned Instagram reply stays the same.
6. **Delete wording isn't set.** The test expects "yes, delete", but nothing tells the model to ask for it. In `delete_piece` description: `Ask first: "Delete the <piece> for good? Say yes, delete." Pass confirm: true only after they reply yes.`
7. **Fallbacks sound robotic.** `TOO_MANY_ROUNDS` "try asking more simply" sounds like it blames the owner → `Lost the thread on that one — try me one thing at a time?` `STYLIST_FAILED` "Couldn't reach your stylist" has the stylist talking about itself in the third person, which reads oddly on WhatsApp → `Something went wrong on my end — try again in a minute.` (Check the tests that import these constants.)

## 4. Tool `summary` strings (`tools.ts`, which chat paraphrases)

1. `look()` summary: `${title}: ${every name}.` is what feeds the recital → `${outfit.title}.${changeSuggestion}${note ? ' ' + note : ''}` (the names are still in `pieces`).
2. `rate_outfit`: `requiredFormality: 4` and `(dress 4/5)` invite "a 4/5 dress code" → `dressCode: FORMALITY_WORDS[req]`, events `(${FORMALITY_WORDS[f]})`.
3. `set_status`: `Navy polo → worn.` → `Navy polo is in the laundry now.` / `…marked worn.` / `…clean again.`
4. `delete_piece` error `ask the owner first, then call again with confirm: true` → `not deleted yet — ask: "Delete the ${g.name} for good? Say yes, delete."`
5. `insufficient_wardrobe` summary `no clean top or bottom` uses category words → `no clean ${missing.map(w => ({top:'tops', bottom:'trousers or skirts'})[w]).join(' or ')}`.

## 5. Morning note (`morning.ts`)

1. **It's silent on cold without a coat.** Their actual morning: 39°F, no coat. The note is `Morning. <title>: <5 names>.` and says nothing about the cold. Add a cold branch ahead of `dressy` (use `degrees()`, which is in the owner's unit; the text is otherwise unconverted):
   `Cold one, ${degrees(w.tempLowC, unit)} low, and there's no coat in the closet. Warmest layers it is.`
2. **Rain with nothing rain-safe** (no coat or shoes, so no `rainSafe` hit) gives a bare `Light rain.` → `${w.summary}, and nothing here is waterproof. Grab an umbrella.`
3. `name.toLowerCase()` mangles brands ("the polo ralph lauren jacket"). Lowercase only the first letter.
4. `No clean bottom today — wash day?` → `Nothing clean to wear on the bottom today. Wash day?` (update `morning.test.ts:48`). Keep the piece names in the main note: the WhatsApp template sends only the text.

## 6. WhatsApp (`whatsapp/api.ts`)

1. **Pending pieces get said twice.** The reply text ("Found X. Add them?") is followed by `Found: X. Reply "yes" to add them.` → only send the second when `m.text` is empty.
2. **Listings repeat themselves too.** The summary says "reply with its number", and so does the list → keep the list's `Reply with a number to add it.` and change the shop_search summary to `Found ${n} listings.`
3. `Swap a piece` arrives with no piece named. Fine, as long as the prompt's "ask one short question" covers it ("Which one — the polo or the chinos?").

## 7. Smaller

- `styleFromImages` summary comes back as "The user prefers…" → `summary: one sentence to them, in the second person ("You lean tailored and quiet").`
- Fallback title `Closest fit from your closet` is 5 words → `Closest from your closet`.
- `suggestGaps` returns no reason, so the owner sees "Camel wool overcoat" with no why. Consider adding `why: under 10 words ("Covers every cold day you have")`.

## The 3 that matter most

1. **Take warmth points out of the weather message** (`layer up to 6`) and say "a coat would help". The owner can see this today on Today and in chat.
2. **Give each look a `note` for gaps and mismatches, and tell chat to say it plainly.** This is the only way "what I couldn't match" and "a coat would help" reach the owner honestly.
3. **Stop the card recital:** trim the `look()` summary to the title and rewrite SYSTEM line 2 (1–3 sentences, no piece lists, no "Pulled/Here's" openers). This removes the repeated filler and makes replies faster to read on a phone.
