#!/usr/bin/env node
// Generates mock-mode art: garment cutouts (SVG), the fallback render, and the e2e closet photo.
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const SHAPES = {
  tee: '<path d="M30 15 L42 10 Q50 17 58 10 L70 15 L88 30 L78 42 L70 37 L70 90 L30 90 L30 37 L22 42 L12 30 Z"/>',
  knit: '<path d="M32 14 L43 10 Q50 16 57 10 L68 14 L84 26 L90 78 L80 80 L72 42 L72 90 L28 90 L28 42 L20 80 L10 78 L16 26 Z"/>',
  shirt: '<path d="M32 14 L42 9 L50 20 L58 9 L68 14 L84 26 L90 78 L80 80 L72 42 L72 90 L28 90 L28 42 L20 80 L10 78 L16 26 Z"/><path d="M50 20 L50 90" stroke="rgba(0,0,0,.18)" stroke-width="1" fill="none"/>',
  pants: '<path d="M30 8 L70 8 L75 92 L56 92 L50 34 L44 92 L25 92 Z"/>',
  coat: '<path d="M30 8 L43 6 L50 32 L57 6 L70 8 L86 22 L91 84 L80 86 L74 44 L75 96 L25 96 L26 44 L20 86 L9 84 L14 22 Z"/><path d="M50 32 L50 96" stroke="rgba(0,0,0,.2)" stroke-width="1" fill="none"/>',
  boot: '<path d="M28 16 L54 16 L54 60 L80 68 Q90 72 88 84 L28 84 Z"/>',
  shoe: '<path d="M10 62 Q12 48 30 50 L52 52 Q72 50 86 60 Q94 66 90 74 L12 74 Z"/>',
}
export const SAMPLE = [
  ['navy-wool-overcoat', 'coat', '#2B3A55'], ['oat-merino-crewneck', 'knit', '#C9B79C'], ['selvedge-jeans', 'pants', '#3A4A6B'],
  ['brown-suede-loafers', 'shoe', '#7A5236'], ['white-oxford-shirt', 'shirt', '#ECE8DE'], ['charcoal-wool-trousers', 'pants', '#4B4A46'],
  ['black-leather-boots', 'boot', '#262422'], ['rust-cotton-tee', 'tee', '#7A2F2A'], ['olive-chore-jacket', 'coat', '#56603F'],
  ['white-leather-sneakers', 'shoe', '#DDD7CB'], ['grey-marl-sweatpants', 'pants', '#9A968E'], ['ecru-striped-breton', 'tee', '#E6DCC6'],
]
const svg = (shape, fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="400" height="400"><g fill="${fill}" stroke="rgba(0,0,0,.12)" stroke-width=".6">${SHAPES[shape]}</g></svg>`

mkdirSync('public/fixtures/garments', { recursive: true })
for (const [slug, shape, fill] of SAMPLE) writeFileSync(`public/fixtures/garments/${slug}.svg`, svg(shape, fill))

const place = (shape, fill, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" stroke="rgba(0,0,0,.12)" stroke-width=".6">${SHAPES[shape]}</g>`
const flat = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="#E9E5DC"/>` +
  place('coat', '#2B3A55', 40, 60, 4) + place('knit', '#C9B79C', 420, 80, 3.4) + place('pants', '#4B4A46', 440, 450, 3.4) + place('boot', '#262422', 80, 560, 2.6) + place('boot', '#262422', 170, 640, 2.6) + '</svg>'
writeFileSync('public/fixtures/render-flatlay.svg', flat)
writeFileSync('public/fixtures/render-tryon.svg', flat)

// e2e "closet photo": six pieces on a rail, laid out on the mock segmenter's 3×2 grid
const photo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800"><rect width="1200" height="800" fill="#D8D2C6"/>` +
  [['coat', '#2B3A55'], ['knit', '#C9B79C'], ['pants', '#3A4A6B'], ['shoe', '#7A5236'], ['boot', '#262422'], ['pants', '#4B4A46']]
    .map(([s, f], i) => place(s, f, (i % 3) * 400 + 40, Math.floor(i / 3) * 400 + 40, 3.2)).join('') + '</svg>'
mkdirSync('tests/fixtures', { recursive: true })
writeFileSync('tests/fixtures/closet.jpg', await sharp(Buffer.from(photo)).jpeg({ quality: 85 }).toBuffer())
console.log('fixtures written')
