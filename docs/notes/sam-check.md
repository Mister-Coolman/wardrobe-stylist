# SAM 3.1 check

How the real segmenter (`src/lib/models/real/segmenter.ts`) behaves against the live API, and why it is built the way it is. To rerun on your own media:

```bash
set -a; . ./.env.local; set +a; npx tsx --tsconfig tsconfig.json scripts/sam-check.mts <photo or frames…>
```

## How it calls SAM

- **One image call per sampled frame.** `POST /v1/responses`, model `sam-3.1`, noun-phrase prompt `clothing`, the frame as an `input_image` data URL. Video input would need an MP4 or MOV upload, and the browser already samples the scan at 2 fps as JPEGs, so the app never builds a video.
- **At most 8 frames per scan,** spread evenly with the first and last included, 4 calls at a time. One frame takes 1.5–3 s.
- **Output** is parsed with `@meta-sam/parser`. Each mask comes back as a box-sized raster, which is pasted into a full-frame mask for `cutout()`.
- **Filters:** confidence below 0.4 (requested with `include_confidence`) and masks under 1% of the frame are dropped.

## Linking sightings across frames

In a pan every garment moves by the same offset between sampled frames, so plain box overlap misses. For each pair of neighbouring frames, the segmenter tries the offsets implied by same-sized boxes and keeps the one that pairs the most pieces (at least two pieces must agree before it counts as a pan). Small tracks seen only cut off at the frame edge are dropped in multi-frame scans. Anything linking misses is left to the pipeline's dedupe (`sameItem`).

## Results

| Input | Before | After |
|---|---|---|
| `tests/fixtures/closet.jpg` (6 flat-art garments, one photo) | — | 6 of 6 found in 1.4 s; clean cutouts; scan 20 s |
| Same photo as a 4-frame pan (100 px steps) | 16 tracks, 8 garments kept (duplicates, a boot fragment), 71 s | 5 tracks, 5 garments, 6.5 s |

The tag-concurrency change (4 at a time) accounts for most of the speed-up.

## Open

- The fixtures are flat illustrations. On them the tagger sometimes misreads shoes (a loafer as a "beret", a boot as "socks"), and SAM missed the loafer (confidence 0.52 when it was found) in one pan crop. A real phone video of a closet rail is still the test that matters.
- If real pans link poorly (hangers swinging, depth parallax), the next step is to raise the frame budget or use the video endpoint with an MP4 recorded by the browser.
