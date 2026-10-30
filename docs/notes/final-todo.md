# Final things to do

Submission: Wed 4 Nov, 9 PM.

## Must do

- [x] **Deploy to Vercel:** https://wardrobe-stylist-tan.vercel.app (CLI deploys; the GitHub connection failed).
- [ ] **Check calendar live** on the deployed URL: events come in and set the day's dress code. Google sign-in works there.
- [ ] **Full phone rehearsal** on the deployed app: onboarding → hold-up scan → Online add → Today → trip. The scan and review have been run on the phone.
- [ ] **Record the 3-minute demo video** using Hold-up.
- [ ] **Submit.**

## If there's time

- [ ] **Batched upload for long clips.** A request is capped at 4 MB (~42 frames at ~94 KB), so a 2-minute clip is thinned to a frame every ~3 s and pieces held for 1.5 s get missed. Instead:
  - Upload the frames in several requests to one scan job, each under the cap, keeping 2 fps.
  - Start SAM on each batch as it lands, so segmenting overlaps the upload.
  - Keep it one job, so track linking and dedupe work across batch boundaries; separate 30 s jobs would return pieces shown near a boundary twice.
  - Raise SAM (6) and tagging (4) concurrency only after measuring the Meta API's rate limits; at 30–40 pieces, tagging is the slow part.
- [x] **"Find it online"**: the scan page's Online tab adds a piece from a store listing; "Find this online" in the piece editor fills name, brand, fit and details, and can swap in the store's photo. Search is SerpApi's Google Shopping engine (free plan, about 250 searches a month).
  - Muse Spark's `web_search` found the right products but took about 60 s and gave no photos; retailer pages refuse server fetches (418/410/403).
  - [x] Checked live: 1–6 s per search, brand-store results, 686 px photos; three on-model listings each gave the right single piece in ~7 s.

## Known rough edges

- In a video, the frame picked for a piece can be one where it's still swinging (a dark green polo came out blurred).
- Blue can read as black under warm light.
- Web-added cutouts can have a notch where the model's hand or arm crossed the garment.
- Flat lays redraw logos rather than copying them.
- "Flip through" wraps onto two lines in the scan tabs on a phone.

