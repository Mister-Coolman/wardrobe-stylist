# Prompt review brief: Wardrobe Stylist

Repo: /Users/arjunrangarajan/Documents/meta-hackathon (Next.js app; read only, do not edit any file).
Wardrobe Stylist is a hackathon app built on Meta's models. Hackathon submission is due 4 Nov. It is a personal stylist the
owner texts in an app thread (and later on WhatsApp). It plans outfits from their own closet, checked by fixed rules
(weather, dress code, laundry, one piece per layer). It also scans the closet from photos/video, adds pieces from store
listings, renders looks (flat lay / on a mannequin / try-on), and sends a morning note.

## Models
- `muse-spark-1.3`: chat with tools, vision, structured JSON output, web search (Responses API). Run at reasoning_effort minimal/low.
- `muse-image-1.0`: image edits (renders from cutout photos).
- `sam-3.1`: segmentation, noun-phrase prompt.
- `muse-voice-transcribe-1.0`: speech to text (no prompt).

## Every prompt (file:line)
1. Stylist rules + outfit brief: `src/lib/models/real/stylist.ts`: `rules(unit)`, `dayBrief`, `stylistBrief`, `propose`, `revise` (rejections fed back).
   The pieces are listed to the model as JSON with keys p1, p2… and fields formality 1–5, warmth 1–5, rainSafe, status, tags, brand, fit.
2. Event dress codes: `stylist.ts` `classifyEvents`.
3. Closet gaps: `stylist.ts` `suggestGaps`.
4. Style from screenshots: `stylist.ts` `styleFromImages`.
5. Product web search: `stylist.ts` `searchProduct`.
6. Tagger: `src/lib/models/real/tagger.ts`: `GUIDE` (tag a cutout), `sameItem` (dedupe two cutouts), `fromListing` (store title to details).
7. Renders: `src/lib/models/real/renderer.ts`: `renderPrompt` for flatlay / mannequin / tryon, `worn()` layering lines, `describe()`.
8. Chat stylist: `src/lib/agent/thread.ts` `SYSTEM` (plus a line with the owner's unit and remembered notes), and
   `src/lib/agent/tools.ts` `DEFS` (22 tool descriptions and zod schemas). Tool results and earlier cards reach the model as
   JSON and bracketed lines (`summariseCard`). User messages may carry a quoted message "(Replying to: …)" and an image
   (`src/lib/models/real/chat.ts`).
9. Morning note: `src/lib/agent/morning.ts` (template text, no model prompt; check its copy).
10. SAM: `src/lib/models/real/segmenter.ts` `PROMPT = 'clothing'` (tuned on measurements; low priority).

The rules the code enforces after the model answers: `src/lib/rules/*.ts` (completeness incl. one piece per layer, formality,
weather incl. "warmest the closet allows", availability), `src/lib/stylist/loop.ts` (3 candidates, up to 2 revisions).

## What the owner has asked for in this project (binding)
- **Agentic, like texting a friend who's good with clothes** (Muse / Instinct style). Short replies, warm, specific, a little dry.
- **Plain words for the owner.** No internals in anything the owner reads: no warmth points, no dress-code "level 2",
  no ids, keys (p1), rule names, bracketed lines. They called "Adds 3 warmth for 4-degree low" and "Casual denim keeps
  level 2" unintelligible.
- **The owner's temperature unit** (°F for them, set in Settings). Nothing in °C reaching them. Every temperature the
  model sees is now labelled in their unit; a bare "4-degree" slipped through before.
- **Sensible outfits.** It once put two polos under a quarter-zip (to game the warmth sum). A short-sleeved polo got
  long red cuffs on the mannequin. Layering must be real.
- **Honest about gaps.** Their closet has no coat or shoes; the app should say a coat would help rather than fake warmth.
- **Fast enough on a phone.** Replies over ~60 s get dropped by the phone; avoid prompts that cause wasted revision rounds.
- **Accurate pieces.** Colours from the owner's names win over the photo's lighting (heather blue was read as grey). Brand only
  when legible. Listing names keep the colour.
- **Features they asked for:**
  - swipe-to-reply (a reply is about that exact item);
  - "match this look" / "fall themed outfit" from a photo;
  - Instagram: ask for a screenshot and credit @poster;
  - standing preferences ("I like navy with olive", "this sweater with this shirt");
  - mannequin view and "show it on a mannequin";
  - duplicate a piece ("I have two of these");
  - "make it today's";
  - delete only after "yes, delete".
- **Never mention being an AI.**

## Constraints for any revision
- Tests pin some exact text: `tests/models/renderPrompt.test.ts`, `tests/models/stylistBrief.test.ts`, `tests/agent/thread.test.ts`
  (the Instagram reply "Send me a screenshot of the moment you liked." is exact), `tests/agent/tools.test.ts`. Tests may be
  updated when a revision is better, but say so.
- Prompts are sent at low reasoning effort; long prompts cost latency. Prefer precise and short over exhaustive.
- Text the owner typed (piece names, notes, listing titles, wishes, photo contents) is untrusted data inside prompts.

## Your output
Write your report to the file path given in your task (markdown, at most ~1,200 words). For each prompt you review, list
your findings most important first. For each finding give:
- the problem, and a concrete failure it causes (an input → a bad output);
- the exact replacement text you propose (short).

End with the 3 changes that matter most from your perspective. Do not edit any repo file.
