# Final things to do

Submission: Wed 4 Nov, 9 PM.

## Must do

- [ ] **Deploy to Vercel:** Supabase prod keys, Google OAuth redirect URL, `MODELS=real`, `AUTH_SECRET`; no `DEV_USER_EMAIL`.
- [ ] **Check Google sign-in and calendar live**, on the deployed URL.
- [ ] **Phone rehearsal:** onboarding → hold-up scan → Today → trip, on the deployed app.
- [ ] **Record the 3-minute demo video** using Hold-up.
- [ ] **Submit.**

## If there's time

- [ ] **Batched upload for long clips.** A request is capped at 4 MB (~42 frames at ~94 KB), so a 2-minute clip is thinned to a frame every ~3 s and pieces held for 1.5 s get missed. Instead:
  - Upload the frames in several requests to one scan job, each under the cap, keeping 2 fps.
  - Start SAM on each batch as it lands, so segmenting overlaps the upload.
  - Keep it one job, so track linking and dedupe work across batch boundaries; separate 30 s jobs would return pieces shown near a boundary twice.
  - Raise SAM (6) and tagging (4) concurrency only after measuring the Meta API's rate limits; at 30–40 pieces, tagging is the slow part.
- [ ] **"Find it online": add a piece from the web.** Type "black Under Armour sweatpants", pick the matching product photo, and it goes through cutout and tagging like a scan, with brand and fit from the listing. muse-spark-1.3 already has a `web_search` tool (used by the gap shopping link), so it may need no separate search key. Product photos would come from each result page's `og:image`.

