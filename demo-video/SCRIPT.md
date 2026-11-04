# Demo video: shot list (about 2:50)

Captions are burned into every generated clip, so no voiceover is needed. If you want one, read the **Say** lines.
Everything marked **generated** is in `demo-video/out/`. The two **phone** clips are yours to film.

| # | Time | Shot | Source | On screen | Say (optional) |
|---|---|---|---|---|---|
| 1 | 0:00–0:08 | Title | generated card | Wardrobe Stylist: a stylist you can text, who knows every piece in your closet | "This is Wardrobe Stylist." |
| 2 | 0:08–0:20 | The problem | generated card | Plenty of clothes, same few outfits. Mornings decided blind; packing is worse. | "I own plenty of clothes and still wear the same few things…" |
| 3 | 0:20–0:45 | Scan the closet | **phone clip A** | Scan once. SAM 3.1 finds each piece; Muse Spark tags it. | "I filmed my closet once…" |
| 4 | 0:45–1:15 | Today | generated app clip | One look for the day: calendar, forecast, only what's clean; each piece says why | "Every morning it picks one look…" |
| 5 | 1:15–1:50 | Text the stylist | generated app clip | "Something for drinks after work" → a look and its picture; spilled coffee → laundry | "I can just text it…" |
| 6 | 1:50–2:05 | Same thread on WhatsApp | **phone clip B** | The same stylist on WhatsApp, with a look every morning | "…and it's the same conversation on WhatsApp." |
| 7 | 2:05–2:25 | Trips | generated app clip | A look for every day and a packing list that respects how often you rewear things | "Packing for Chicago…" |
| 8 | 2:25–2:40 | How it works | generated card | The model proposes, the code decides; which Meta model does what | "Muse Spark proposes looks; rules check weather, dress code and laundry…" |
| 9 | 2:40–2:50 | Try it | generated card | www.wardrobe-stylist.xyz: Try the demo, no account needed | "Try it yourself." |

## The two phone clips (about 40 s of filming)

Use iPhone screen recording (Control Centre → Screen Recording). Portrait is fine: put it in the middle of the frame.

**A. Scan (25 s).** In the app: Scan → Hold up. Hold three or four pieces up one at a time, then stop and show the review screen ("Found N pieces"). Trim the wait while it processes.

**B. WhatsApp (15 s).** Open the chat with the stylist. Scroll the morning message with its look and picture, then text "another look" and show the reply arriving.

## Putting it together

- `out/rough-cut.webm` already plays every generated shot in order, with a black **"Phone clip A"** / **"Phone clip B"** slate where your clips go. Drop your two clips over those slates in any editor (iMovie, CapCut, Clipchamp) and export.
- Each shot is also in `out/` on its own (`01-title.webm` …), and the cards as PNGs (`cards/`), if you'd rather assemble from scratch.
- YouTube and Devpost accept the .webm as it is.
