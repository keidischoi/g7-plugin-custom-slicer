// 한국어 사전 만들기 — node web/i18n/make-ko.mjs <OrcaSlicer_ko.po>
// OrcaSlicer 한국어 번역(AGPL-3.0, OrcaSlicer 기여자 · 번역 crwusiz 외)에서 이 슬라이서 화면에 나오는 말만 골라 web/i18n/ko.json 으로.
// 고르는 것: 설정 이름(label) · 분류 · 단위 · 고르기 값(enum_labels) · 설명(tooltip) · 쪽/묶음 이름(ui-tree) · 뷰어 화면에 쓰인 글자
// po 원본: https://github.com/SoftFever/OrcaSlicer/blob/main/localization/i18n/ko/OrcaSlicer_ko.po
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const po = readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
const unq = (s) => JSON.parse(s.replace(/\\(?!["\\nt])/g, '\\\\'))   // "…" → 글자
const tr = new Map()
let id = null, str = null, ctx = null, at = null
const flush = () => { if (id && str && !ctx && !tr.has(id)) tr.set(id, str); id = str = ctx = at = null }
for (const ln of po) {
  if (ln.startsWith('msgctxt ')) { if (str !== null) flush(); ctx = unq(ln.slice(8)); at = 'c' }
  else if (ln.startsWith('msgid ')) { if (str !== null) flush(); id = unq(ln.slice(6)); at = 'i' }
  else if (ln.startsWith('msgstr ')) { str = unq(ln.slice(7)); at = 's' }
  else if (ln.startsWith('"')) { const v = unq(ln); if (at === 'i') id += v; else if (at === 's') str += v; else if (at === 'c') ctx += v }
  else if (!ln.trim()) { if (str !== null) flush() }
}
flush()

const want = new Set()
const add = (s) => { if (typeof s === 'string' && s.trim()) want.add(s) }
const schema = req('three-slicer/data/config-schema.json')
for (const o of Object.values(schema)) { add(o.label); add(o.full_label); add(o.category); add(o.sidetext); add(o.tooltip); (o.enum_labels || []).forEach(add) }
const walk = (n) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { add(n.page); add(n.group); add(n.title); Object.values(n).forEach(walk) } }
walk(req('three-slicer/data/ui-tree.json'))
// 뷰어 · 설정 칸 코드에 쓰인 글자 중 po 에 있는 것 (Prepare · Preview · Slice …)
for (const f of ['index.js', 'components.js']) {
  const src = readFileSync(new URL('../../node_modules/three-slicer-viewer/dist/' + f, import.meta.url), 'utf8')
  for (const m of src.matchAll(/"([^"\\\n]{2,80})"|'([^'\\\n]{2,80})'/g)) add(m[1] || m[2])
}

const out = {}
let n = 0
for (const s of want) {
  const k = tr.get(s) || tr.get(s.trim())
  if (k && k !== s && /[가-힣]/.test(k)) { out[s] = k; n++ }
}
const keys = Object.keys(out).sort()
const sorted = {}; for (const k of keys) sorted[k] = out[k]
writeFileSync(new URL('./ko.json', import.meta.url), JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"') + '\n')
console.log('po', tr.size, 'want', want.size, 'ko', n)
