# UI Style Guide — Wardrobe Stylist

Rules for every screen. When this guide and a default (Tailwind, shadcn, an AI suggestion)
disagree, this guide wins. The checklist in §10 is run on every screen before it's "done".

## 1. Direction: "The Lookbook"

The app should feel like a printed fashion lookbook or a tailor's notebook, not a SaaS dashboard.

- **Your clothes are the color.** The interface is near-monochrome (paper + ink). Garment photos
  and renders are the only saturated things on screen. This is what SSENSE does: grayscale page,
  photography carries the color.
- **Editorial, not decorative.** One serif "moment" per screen (the outfit name, the date). Everything
  else is a quiet grotesk. Hierarchy comes from size, weight, and space — not boxes and shadows.
- **Tailoring as the visual language.** Borrow from garment tags, care labels, pattern-paper
  markings, and lookbook numbering ("Look 01", "Piece 3/4"). This is our signature; generic apps
  can't copy it because it only makes sense for a wardrobe.
- **Show the thinking honestly.** The agent's checks and revisions appear as "fitting notes" —
  short, specific, typeset like annotations, never as a glowing AI badge.

**One-line test:** if you swapped our logo for a fintech logo, would the screen still make sense?
If yes, it's too generic. Redo it.

## 2. Color

All colors are tokens. No raw hex in components; never `#000`/`#fff`, never `bg-black`/`bg-white`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F4F1EA` | `#151412` | Page background (warm off-white / warm off-black) |
| `paper-raised` | `#FBF9F4` | `#1E1C19` | Sheets, the one raised surface per screen |
| `ink` | `#1C1A17` | `#ECE7DD` | Primary text |
| `ink-muted` | `#5E5850` | `#A39C90` | Secondary text (meets AA on `paper`) |
| `ink-faint` | `#8F887D` | `#6F695F` | Meta, placeholders — never body copy |
| `rule` | `#DAD4C8` | `#2E2B27` | Hairlines, dividers, input borders |
| `accent` | `#8A2E1C` (oxblood) | `#D0694F` | Primary action, active nav, focus ring. Nothing else. |
| `ok` | `#3F5F3A` (moss) | `#8DB283` | Passed checks — always paired with text |
| `warn` | `#8A5A12` (ochre) | `#D9A44B` | Revisions / caution — always paired with text |
| `error` | `#9B1C1C` | `#E07A7A` | Errors — always paired with text |

Rules
- The accent appears **at most twice per screen** (primary button + active nav item).
- Status colors are muted and earthy, never emerald/neon. Never color alone — always a word.
- Dark mode is its own design, not an inversion: lower-contrast ink, lighter accent, no shadows
  (use `paper-raised` for elevation).
- Behind garment cutouts use `paper-raised` or a neutral "studio" gray `#E9E5DC` — clothes must
  look like clothes, not float on tinted color.
- No gradients anywhere in UI chrome. Not on buttons, text, borders, or backgrounds.

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Display | **Instrument Serif** (Google Fonts) | One moment per screen: outfit name, date heading, trip city. 400 only, italic for emphasis. |
| UI / body | **Instrument Sans** (Google Fonts) | Everything else. 400 body, 500 labels, 600 buttons/subheads. Never 300 or 800+. |
| Labels | Instrument Sans, uppercase, +0.08em tracking, 11–12px | Garment-tag / care-label style: categories, "PIECE 2/4", check names. |
| Numbers | Instrument Sans with `font-variant-numeric: tabular-nums` | Temperatures, counts, dates in lists. No monospace for "vibes". |

Not allowed: Inter, Roboto, Geist, Plus Jakarta Sans, system-ui as a deliberate choice, monospace
outside code.

**Scale (ratio 1.25, base 16):** 12 · 13 · 16 · 20 · 25 · 31 · 39 · 49
- Body is 16px minimum; inputs are 16px minimum (prevents iOS zoom).
- Display sizes (31+) get `letter-spacing: -0.02em`, line-height 1.1.
- Body line-height 1.5; UI labels 1.2.
- Max 3 sizes per component. Text measure ≤ 65ch; headings ≤ 30ch.
- Left-aligned by default. Center only true one-liners (empty states).
- Proper typography: curly quotes, `…`, `&nbsp;` between number and unit (`12&nbsp;°C`).

## 4. Space, shape, elevation

- **Spacing scale (4px base):** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Nothing off-scale.
- Space between groups > space within groups (at least 2 steps apart). Start generous, then trim.
- Page gutter on mobile: 20px. Respect `env(safe-area-inset-*)`.
- **Radius by role:** 0 for photos/renders and page sections (editorial, print-like); 2px for
  chips and tags; 6px for buttons and inputs; 12px only for bottom sheets. Child radius ≤ parent.
  No `rounded-2xl` on everything.
- **Separation by space and hairlines (`rule`), not cards.** Content sits directly on `paper`.
  A container gets *one* of: border, background tint, or shadow — never all three.
  No card inside a card.
- **Elevation:** only sheets/menus float. Light mode uses one two-layer shadow:
  `0 1px 2px rgb(28 26 23 / .06), 0 8px 24px rgb(28 26 23 / .08)`. Dark mode uses no shadows.
- No glassmorphism / `backdrop-filter`, except optionally the bottom nav (one use max).

## 5. Motion

Motion explains what happened: a garment joined the outfit, a scan found an item, a check
failed and was fixed. If an animation explains nothing, remove it.

| Token | Value | Use |
|---|---|---|
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Things entering/leaving (default) |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Things moving on screen |
| `fast` | 150ms | Press, hover, toggles |
| `base` | 220ms | Most transitions |
| `sheet` | 360ms | Bottom sheets / drawers |

- Never `ease-in` for UI; never bounce/elastic/overshoot; never `transition: all`.
- Animate only `transform` and `opacity`. Enter from `scale(0.96)` + opacity, never `scale(0)`.
- Press feedback: `scale(0.98)`. Interruptible.
- Spinners/skeletons: delay ~200ms before showing, keep ≥400ms once shown.
- Honor `prefers-reduced-motion` (fade only).
- Signature moments (the only "showy" motion allowed):
  1. Scan review: cutouts settle into the grid one by one (staggered 40ms) as they're found.
  2. Outfit assembly: pieces slide into the look in order (shoes last), then the render fades in.
  3. Fitting note revision: the rejected piece strikes through, the replacement slides in.

## 6. Components

**Look (outfit) — the hero component**
- Full-bleed render (try-on / flat lay) or a cutout grid (none), radius 0, aspect 4:5.
- Above: date in label style ("TUESDAY 27 OCT · 14° RAIN LATER"), then outfit name in
  display serif ("Look 01 — Rain-ready client day").
- Below: numbered piece list, each row = small cutout + name + one-line *why*.
- Fitting notes: a compact list of checks with ✓ / ↺ marks and plain words
  ("✓ Dress code: client meeting → smart", "↺ Swapped suede loafers — 80% rain at 5pm").
- Actions: one primary ("I wore this"), one secondary ("Another look"), render-mode toggle as
  a text-only segmented control.

**Garment tile** — cutout on studio gray, radius 0, no shadow. Under it: category label
(uppercase tag style) and name. Status (laundry / worn) as a small text tag, not a colored dot.

**Tags & chips** — 2px radius, 1px `rule` border, uppercase label style. Selected = `ink`
background with `paper` text (not accent). Use for event quick-answers and filters.

**Buttons** — primary: `accent` fill, `paper` text, 6px radius, 48px tall, one per screen.
Secondary: 1px `ink` border, transparent. Tertiary: text with underline offset 3px.
Labels say the action ("Scan closet", "Pack for Chicago"), never "Get started"/"Learn more".
No chevrons on CTAs. Loading: keep label, add spinner, "Packing…".

**Navigation** — bottom bar with 3–4 text+icon items (Today · Closet · Trips), 44px+ targets.
Mic is a single round button docked above the bar (the only circle in the app).

**Icons** — one set (Phosphor, *thin* or *light* weight), 20px in buttons, 24px standalone.
Never icon-in-a-colored-circle; never an icon above every heading.

**Weather & events strip** — a single line of text with tabular numbers, not stat cards.
"14° → 9° · Rain from 5pm · 10:00 Client review · 19:00 Dinner (added)".

**Inputs** — 16px text, label above (never placeholder-as-label), 1px `rule` border,
focus = 2px `accent` ring with 2px offset.

## 7. States (every screen ships all of them)

| State | Pattern |
|---|---|
| Empty | One serif line + one action. "Your closet is empty. Scan it in a minute." → [Scan closet] |
| Loading | Skeletons shaped exactly like the content; for agent steps, a live line of what it's doing ("Checking tomorrow's forecast…") |
| Partial | Show what's ready (outfit before render; found items while scan continues) |
| Error | Say what failed and offer the next step. "Couldn't render the try-on. Showing pieces instead. [Try again]" |
| Offline / no credits | Mock mode banner in development only — never in the demo |

## 8. Voice & copy

- Talk like a sharp friend who's good with clothes: short, specific, a little dry.
- Specific beats general: "Rain from 5pm — swapped to the leather boots" not "Optimized for weather".
- No AI-filler words: *unlock, seamless, supercharge, elevate, empower, effortless, curated
  just for you, magic*. No "✨". No emoji as decoration.
- Never say "AI" in the UI. The product is a stylist; the reasoning shows it's smart.
- Numbers are real (computed), never invented round marketing stats.
- Sample data uses real-sounding garments ("Navy merino crewneck", "Selvedge jeans"),
  never "Item 1" or lorem ipsum.

## 9. AI-slop ban list (auto-reject)

Grep before every commit; any hit needs a written reason or gets removed.

| Pattern | Grep | Why it's banned |
|---|---|---|
| Purple/blue/cyan gradients | `bg-gradient-`, `from-purple`, `via-`, `linear-gradient` | The #1 AI-UI fingerprint |
| Gradient text | `bg-clip-text`, `background-clip: text` | Same |
| Default fonts | `Inter`, `Roboto`, `Geist`, `Plus Jakarta` | Unchosen identity |
| Pure black/white | `#000`, `#fff`, `bg-black`, `bg-white`, `text-white` | No palette |
| Uniform shadows | `shadow-md`, `shadow-lg`, `shadow-xl` | Elevation without meaning |
| Glass everywhere | `backdrop-blur`, `backdrop-filter` (>1 use) | Trend filler |
| Big radius everywhere | `rounded-2xl`, `rounded-3xl`, `rounded-xl` | Bubble UI |
| Bounce / animate-all | `animate-bounce`, `animate-pulse`, `transition-all`, `spring` | Decorative motion |
| Stat cards | `StatCard`, `MetricCard`, big number + tiny label rows | Dashboard look |
| Three equal feature cards | 3+ siblings with identical structure | Template look |
| Icon-in-circle, icon above headings | visual check | Template look |
| Sparkle/AI iconography | `Sparkles`, `✨`, "AI-powered" | Says AI instead of showing it |
| Filler copy | `unlock|seamless|supercharge|elevate|effortless|Get started|Learn more` | Generic |
| Placeholders | `lorem`, `John Doe`, `Acme`, `TODO` in rendered text | Unfinished |
| Everything centered | visual check (>50% centered text) | Landing-page reflex |
| Modals for everything | >1 `Dialog` per flow | Use inline or bottom sheet |

## 10. Screen checklist (run before calling any screen done)

1. **Squint test:** blur your eyes — is there exactly one obvious focal point and one primary action?
2. **Logo-swap test:** would this screen fit a fintech app? If yes, add wardrobe specificity.
3. **Grayscale test:** does hierarchy survive in grayscale? (Design in grayscale first, accent last.)
4. **Ban-list grep:** zero unexplained hits from §9.
5. **States:** empty, loading, partial, error all designed and reachable.
6. **Phone check:** 375px wide, thumb reach for the primary action, 44px targets, safe areas.
7. **Accessibility:** AA contrast, `:focus-visible` rings, labels on icon buttons, no color-only
   status, reduced motion.
8. **Real content:** real garment names, long names, 1 item vs 80 items.
9. **Screenshot it** in the browser pane, light and dark, and compare against the previous screen
   for consistency.

## 11. Implementation notes

- Tailwind with tokens defined in CSS variables (`--paper`, `--ink`, …) mapped in the Tailwind
  theme; delete default color/shadow/radius utilities from the theme so slop can't sneak in.
- shadcn/ui is fine for *behavior* (Radix primitives), but restyle every component to these
  tokens — never ship shadcn's default look.
- Fonts via `next/font/google` (Instrument Serif, Instrument Sans), `display: swap`, subset latin.
- Set `<meta name="theme-color">` to `paper`; `color-scheme` per theme.

## 12. References to study

- **SSENSE** — grayscale broadsheet layout, one serif moment, photography carries color.
- **Indyx** — most polished current wardrobe app; study, then be more editorial.
- **Whering** — reviewers call it clunky/dated; an example of what to avoid.
- **Vercel Web Interface Guidelines** — interaction, forms, and state details.
- **Refactoring UI** — grayscale-first, spacing scales, hierarchy via weight and contrast.

## Sources

- [Vercel — Web Interface Guidelines](https://vercel.com/design/guidelines)
- [Pixelslop — AI Slop Pattern Catalog](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- [ux-skill — How to detect AI slop in your design](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design)
- [Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- [Refactoring UI — tactical principles (summary)](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/ux-ui-design-system/references/refactoring-ui.md)
- [Emil Kowalski animation principles (summary)](https://skills.sh/mrmps/smry/emilkowal-animations)
- [SSENSE style reference (Refero)](https://styles.refero.design/style/fa157687-ee42-443e-a992-5f8a3fcdd48f)
- [Good On You — wardrobe app reviews](https://goodonyou.eco/wardrobe-organising-apps/)
- [Fits — closet app reviews](https://fits-app.com/posts/top-8-closet-outfit-planning-apps-reviewed)
