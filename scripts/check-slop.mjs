#!/usr/bin/env node
// Ban-list grep from docs/ui-style-guide.md §9. A line containing "slop-ok: <reason>" is exempt.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const BANNED = [
  /bg-gradient-\S*/, /\bfrom-(?:purple|blue|cyan|indigo|violet|pink)\S*/, /\bvia-\S+/, /linear-gradient/, /radial-gradient/,
  /bg-clip-text/, /background-clip:\s*text/,
  /\bInter\b/, /\bRoboto\b/, /\bGeist\b/, /Plus Jakarta/,
  /#(?:000|fff)(?:000|fff)?\b/i, /\bbg-black\b/, /\bbg-white\b/, /\btext-white\b/, /\btext-black\b/,
  /\bshadow-(?:sm|md|lg|xl|2xl)\b/,
  /\bbackdrop-blur\S*/, /backdrop-filter/,
  /\brounded-(?:xl|2xl|3xl|full)\b/,
  /\banimate-(?:bounce|pulse|ping)\b/, /\btransition-all\b/, /transition:\s*all/, /\bspring\b/,
  /\bStatCard\b/, /\bMetricCard\b/,
  /\bSparkles?\b/, /✨/, /AI-powered/i,
  /\b(?:unlock|seamless(?:ly)?|supercharge|elevate|effortless(?:ly)?|empower)\b/i, /Get started/i, /Learn more/i,
  /\blorem\b/i, /John Doe/, /\bAcme\b/, /\bTODO\b/,
]

export function scan(text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    if (/slop-ok:\s*\S/.test(line)) return
    for (const re of BANNED) {
      const m = line.match(re)
      if (m) hits.push({ pattern: m[0], line: i + 1 })
    }
  })
  return hits
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css|mjs|js)$/.test(name)) out.push(p)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '..', '..')
  let total = 0
  for (const dir of ['src/app', 'src/components']) {
    let files = []
    try { files = walk(join(root, dir)) } catch { continue }
    for (const f of files) {
      for (const h of scan(readFileSync(f, 'utf8'))) {
        total++
        console.log(`${relative(root, f)}:${h.line}  ${h.pattern}`)
      }
    }
  }
  if (total) { console.log(`\n${total} slop hit(s). Remove them or add "slop-ok: <reason>" on the line.`); process.exit(1) }
  console.log('check:slop — clean')
}
