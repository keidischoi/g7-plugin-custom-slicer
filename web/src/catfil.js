// custom-slicer — 🧵 카탈로그 필라멘트 (custom-catalog 모듈) → 슬라이서 필라멘트 칸 · AGPL-3.0-or-later
// 카탈로그 필라멘트를 고르면: ① 엔진의 필라멘트 사전 설정 중 같은 회사 · 같은 재료를 찾아 그 칸(T1 · T2 …)에 넣고
// ② 카탈로그의 노즐 · 베드 온도 · 직경으로 덮어씀 (사전 설정이 없으면 Generic 같은 재료)
export const CAT = '/api/modules/custom-catalog'

const VENDOR = { 'prusament': 'prusa polymers', 'bambu': 'bambu lab', 'qidi tech': 'qidi' }
const low = (x) => String(x || '').toLowerCase().trim()
const num = (v) => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null }

/** 카탈로그 필라멘트 목록 (찾기 q · 쪽 page) */
export async function catalogFilaments(q, page = 1) {
  const p = new URLSearchParams({ tab: 'filament', per: '24', page: String(page) }); if (q) p.set('q', q)
  const r = await fetch(CAT + '/items?' + p, { credentials: 'same-origin' })
  if (!r.ok) throw new Error('카탈로그를 불러오지 못했어요 (' + r.status + ')')
  const d = ((await r.json()) || {}).data || {}
  return { items: d.items || [], pages: d.pages || 1 }
}

/** 한 필라멘트의 칸 (재료 · 직경 · 노즐 · 베드 온도) */
export async function catalogFilament(key) {
  const r = await fetch(CAT + '/items/' + encodeURIComponent(key), { credentials: 'same-origin' })
  if (!r.ok) throw new Error('카탈로그 필라멘트를 읽지 못했어요 (' + r.status + ')')
  const it = ((await r.json()) || {}).data || {}, v = {}
  for (const g of it.groups || []) for (const x of g.items || []) v[x.key] = x.value
  return { key: it.key, brand: it.brand || '', title: it.title || '', material: v.material || it.material || '', color: /^#[0-9a-f]{6}$/i.test(it.color_hex || '') ? it.color_hex : '',
    diameter: num(v.diameter), nozzle: [num(v.nozzle_min), num(v.nozzle_max)], bed: [num(v.bed_min), num(v.bed_max)] }
}

/** 엔진 사전 설정 중 가장 비슷한 것 — 같은 회사 + 같은 재료가 먼저, 없으면 Generic 같은 재료 */
export function bestPreset(list, cat) {
  const brand = low(cat.brand), vend = VENDOR[brand] || brand, mat = low(cat.material).replace(/\s+/g, ' ')
  const base = mat.replace(/[+]|\s*(basic|plus|pro|matte|silk|hf|high speed)$/g, '').trim()
  const words = low(cat.title).split(/[\s/-]+/).filter((w) => w.length > 1)
  let best = null, bs = -1
  for (const p of list) {
    const t = low(p.type), v = low(p.vendor), n = low(p.name)
    if (!t || !(t === mat || t === base || t.startsWith(base + ' ') || t.startsWith(base + '-'))) continue
    let s = (t === mat ? 3 : 1) + (v === vend || (vend && v.startsWith(vend)) ? 6 : v === 'generic' ? 2 : 0)
    for (const w of words) if (n.includes(w)) s += 1
    s -= n.length / 1000   // 같은 점수면 짧은 이름 (노즐 · 프린터가 안 붙은 것)
    if (s > bs) { bs = s; best = p }
  }
  return best
}

const one = (v) => (Array.isArray(v) ? v[0] : v)
const mid = (a) => { const [x, y] = a; if (x == null && y == null) return null; return Math.round(((x ?? y) + (y ?? x)) / 2) }

/** 필라멘트 칸 수 (T1 · T2 …) */
export function slotCount(s) {
  return Math.max(1, ...['filament_settings_id', 'filament_type', 'filament_colour'].map((k) => (Array.isArray(s[k]) ? s[k].length : 0)))
}

/** 칸 slot 에 사전 설정 + 카탈로그 값 — 다른 칸은 그대로 */
export function applyCatalog(s, slot, n, presetName, preset, cat) {
  const next = { ...s }
  const put = (k, v) => {
    if (v == null || v === '') return
    const cur = next[k], arr = Array.isArray(cur) ? cur.slice() : cur == null ? [] : [cur]
    const fill = arr.length ? arr[arr.length - 1] : v
    while (arr.length < n) arr.push(fill)
    arr[slot] = v; next[k] = arr
  }
  if (preset) for (const k of Object.keys(preset)) put(k, one(preset[k]))
  if (presetName) put('filament_settings_id', presetName)
  if (cat.material && !(preset && preset.filament_type)) put('filament_type', cat.material.toUpperCase())
  const nz = mid(cat.nozzle), bed = mid(cat.bed)
  if (nz) for (const k of ['nozzle_temperature', 'nozzle_temperature_initial_layer']) put(k, nz)
  if (bed != null) for (const k of ['hot_plate_temp', 'hot_plate_temp_initial_layer', 'textured_plate_temp', 'textured_plate_temp_initial_layer']) put(k, bed)
  if (cat.diameter === 1.75 || cat.diameter === 2.85) put('filament_diameter', cat.diameter)
  if (cat.brand) put('filament_vendor', cat.brand)
  if (cat.color) put('filament_colour', cat.color)
  return { s: next, nozzle: nz, bed }
}
