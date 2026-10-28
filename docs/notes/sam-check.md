# SAM 3.1 check

How the real segmenter (`src/lib/models/real/segmenter.ts`) behaves against the live API, and why it is built the way it is. To rerun on your own media:

```bash
set -a; . ./.env.local; set +a; npx tsx --tsconfig tsconfig.json scripts/sam-check.mts <photo or frames…>
```

## How it calls SAM

- **One image call per frame.** `POST /v1/responses`, model `sam-3.1`, noun-phrase prompt `clothing`, the frame as an `input_image` data URL. Video input would need an MP4 or MOV upload, and the browser already samples the scan at 2 fps as JPEGs, so the app never builds a video.
- **Every uploaded frame, up to 60,** 6 calls at a time. A 40 s section's 44 frames take about 10 s.
- **Output** is parsed with `@meta-sam/parser`. Each mask comes back as a box-sized raster, which is pasted into a full-frame mask for `cutout()`.
- **Filters:** confidence below 0.4 (requested with `include_confidence`) and masks under 1% of the frame are dropped. In a video, a sighting must also cover at least 25% of the frame and half its width (`isWholeGarment`): on a packed rail everything smaller was a sleeve or the edge of a hanging shirt.

## Linking sightings across frames

Sightings in neighbouring frames join one track when their boxes overlap **and** their mean colors are within 22 (RGB distance). Color matters because, flipping through a rail, each new piece lands where the last one was; 22 was the loosest value that kept a blue tee and a navy one apart. For pans, the segmenter also tries the offsets implied by same-sized boxes and keeps the one that pairs the most pieces (at least two must agree).

Over-splitting is the cheaper mistake: an extra track only costs a tag call and a dedupe check. The pipeline's dedupe compares pieces of the same category whose **cutouts** are within 45 in mean color, against every candidate at once, and asks the tagger. It doesn't gate on tag words, because one shirt was tagged "white" in one frame and "cream" in the next.

## Results

| Input | Before | After |
|---|---|---|
| `tests/fixtures/closet.jpg` (6 flat-art garments, one photo) | — | 6 of 6 found in 1.4 s; clean cutouts; scan 20 s |
| Same photo as a 4-frame pan (100 px steps) | 16 tracks, 8 garments kept (duplicates, a boot fragment), 71 s | 5 tracks, 5 garments, 6.5 s |

The tag-concurrency change (4 at a time) accounts for most of the speed-up.

## A real closet (28 Oct)

A 39 s iPhone video (HEVC, portrait) of a packed rail of t-shirts and polos, run through the scan screen in Chrome with the real models. The browser sampled 78 frames; the 4.5 MB upload budget kept 44; the segmenter sent 8 to SAM. The scan took 23 s.

- About 20 distinct pieces appear in the video, but on a packed rail most show only an edge. A whole shirt is visible only when it's pulled forward, which happened about eight times.
- Result: 7 cutouts, 6 pieces after dedupe. Two are usable (a beige graphic tee, a white tee). Five are slivers, the edges of hanging shirts, each confidently tagged (one as a "belt").

What this means:
1. **8 SAM frames is far too few.** The pulled-forward moments last a second or two; one sampled frame every 5 s misses most of them.
2. **Slivers need filtering.** Keep only sightings that are big, wide and solid enough to be a whole garment.
3. **"Pan from one end to the other" doesn't work on a packed rail.** The capture that works is flipping through and pulling each piece forward.
4. **The upload budget will bite on a full closet.** A 2.5-minute sweep gets capped at 120 frames and thinned to about 44 by the budget, roughly one every 3.4 s.

### After the fixes

Same video, three runs:

| Run | SAM frames | Pieces | Usable | Missed (of ~11 pulled forward) | Time |
|---|---|---|---|---|---|
| Before | 8 | 6 | 2 | ~9 | 23 s |
| Every frame + whole-garment filter | 44 | 8 | 8 | 3 (position-only linking chained 5 shirts into one track) | 50 s |
| + color-aware linking and dedupe | 44 | 13 | 13 whole shirts | 0 | 62 s |

What's left in the last run: two duplicates (the wave-print tee, one copy tagged "sweatpants"; the grey graphic tee, which the tagger judged different) and one cutout that merges two neighbouring shirts. The review screen handles these with a tap.

The `sameItem` check alone, on 10 hand-labelled pairs from this video: 9/10 at `minimal` effort and 512 px, no better at `low` or 768 px. Its one consistent miss is a plain white tee seen side-on next to the white photo-print tee.

The Sweep mode is now **Flip through**: *one rail or shelf at a time; pull each piece forward so it fills the screen for a second.*

## Open

- The fixtures are flat illustrations. On them the tagger sometimes misreads shoes (a loafer as a "beret", a boot as "socks"), and SAM missed the loafer (confidence 0.52 when it was found) in one pan crop. A real phone video of a closet rail is still the test that matters.
- If real pans link poorly (hangers swinging, depth parallax), the next step is to raise the frame budget or use the video endpoint with an MP4 recorded by the browser.
