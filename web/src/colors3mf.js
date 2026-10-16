// custom-slicer — 🎨 3MF 원본 색 · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 Bambu · Orca 프로젝트의 필라멘트 색(filament_colour)만 읽고, 3MF 표준 색
//  (<m:colorgroup> · <basematerials> → 물체 pid/pindex — Fusion 360 · PrusaSlicer · Windows 3D 빌더 등이 씀)은 버려서
//  물체가 늘 1번 필라멘트 색으로 보였음. 0.1.14 파일을 올린 뒤 그 색을 읽어 필라멘트 칸에 맞추고 물체에 붙임.
//  build.mjs 가 뷰어의 불러오기(파일마다)에 globalThis.__slcColorHook 갈고리를 넣음.

const MAX_TEXT = 256 * 1024 * 1024   // 이보다 큰 모델 파일은 읽지 않음 (색 하나 때문에 메모리를 많이 쓰지 않게)

/** zip 안 파일 목록 → { name: { method, csize, size, off } } (중앙 목록만 읽음 · ZIP64 도 — Fusion 360 이 그렇게 냄) */
function zipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {}
  let eo = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break }
  if (eo < 0) return out
  let n = dv.getUint16(eo + 10, true), p = dv.getUint32(eo + 16, true)
  const u64 = (o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296
  if ((p === 0xffffffff || n === 0xffff) && eo >= 20 && dv.getUint32(eo - 20, true) === 0x07064b50) {
    const z = u64(eo - 12)
    if (z + 56 <= u8.length && dv.getUint32(z, true) === 0x06064b50) { n = u64(z + 32); p = u64(z + 48) }
  }
  const dec = new TextDecoder()
  while (n-- > 0 && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50) {
    const method = dv.getUint16(p + 10, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true)
    let csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true), off = dv.getUint32(p + 42, true)
    for (let x = p + 46 + nl; x + 4 <= p + 46 + nl + xl;) {   // ZIP64 덧붙임 — 0xffffffff 인 값만 차례로 들어 있음
      const id = dv.getUint16(x, true), len = dv.getUint16(x + 2, true)
      if (id === 1) { let q = x + 4; if (size === 0xffffffff) { size = u64(q); q += 8 } if (csize === 0xffffffff) { csize = u64(q); q += 8 } if (off === 0xffffffff) off = u64(q) }
      x += 4 + len
    }
    out[dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/^\//, '')] = { method, csize, size, off }
    p += 46 + nl + xl + cl
  }
  return out
}

async function zipText(u8, e) {
  if (!e || e.size > MAX_TEXT) return ''
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  if (dv.getUint32(e.off, true) !== 0x04034b50) return ''
  const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), raw = u8.subarray(start, start + e.csize)
  if (e.method === 0) return new TextDecoder().decode(raw)
  if (e.method !== 8 || typeof DecompressionStream !== 'function') return ''
  const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(s).text()
}

/** '#RRGGBB' / '#RRGGBBAA' / '#RGB' → '#rrggbb' (아니면 null) */
export function hex6(c) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(c || '').trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length === 3) h = h.replace(/./g, (x) => x + x)
  return '#' + h.slice(0, 6)
}

const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null }

/** 모델 XML → { objectid: '#rrggbb' } — 물체의 pid/pindex, 없으면 첫 삼각형의 pid/p1, 부품(components)만 있으면 첫 부품 색 */
export function modelColors(xml) {
  const groups = {}
  const G = /<(?:\w+:)?(colorgroup|basematerials)\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?\1>/g
  for (let m; (m = G.exec(xml));) {
    const id = attr(m[2], 'id'); if (id == null) continue
    const list = []
    const C = m[1] === 'colorgroup' ? /<(?:\w+:)?color\b[^>]*>/g : /<(?:\w+:)?base\b[^>]*>/g
    for (let c; (c = C.exec(m[3]));) list.push(hex6(attr(c[0], m[1] === 'colorgroup' ? 'color' : 'displaycolor')))
    groups[id] = list
  }
  const out = {}
  if (!Object.keys(groups).length) return out
  const pick = (pid, idx) => { const g = groups[pid]; return g ? g[Number(idx) || 0] || null : null }
  const comps = {}
  const O = /<object\b[^>]*>/g
  for (let m; (m = O.exec(xml));) {
    const id = attr(m[0], 'id'); if (id == null) continue
    const end = xml.indexOf('</object>', O.lastIndex), body = end < 0 ? '' : xml.slice(O.lastIndex, end)
    let col = attr(m[0], 'pid') != null ? pick(attr(m[0], 'pid'), attr(m[0], 'pindex')) : null
    if (!col) { const t = /<triangle\b[^>]*\spid="([^"]*)"[^>]*>/.exec(body); if (t) col = pick(t[1], attr(t[0], 'p1')) }
    if (col) out[id] = col
    else { const c = /<component\b[^>]*>/.exec(body); if (c && attr(c[0], 'objectid') != null && attr(c[0], 'p:path') == null && attr(c[0], 'path') == null) comps[id] = attr(c[0], 'objectid') }
    if (end > 0) O.lastIndex = end
  }
  for (const id of Object.keys(comps)) if (!out[id] && out[comps[id]]) out[id] = out[comps[id]]
  return out
}

/** 3MF 파일 → { objectid: '#rrggbb' } (색이 없거나 읽지 못하면 {}) */
export async function read3mfColors(file) {
  const u8 = new Uint8Array(await file.arrayBuffer()), ents = zipEntries(u8)
  let root = '3D/3dmodel.model'
  const rels = ents['_rels/.rels'] && await zipText(u8, ents['_rels/.rels'])
  if (rels) for (const r of rels.match(/<Relationship\b[^>]*>/g) || []) if ((attr(r, 'Type') || '').endsWith('/3dmodel')) { root = (attr(r, 'Target') || root).replace(/^\//, ''); break }
  const xml = await zipText(u8, ents[root])
  return xml ? modelColors(xml) : {}
}

/** 필라멘트 칸 정하기 — 같은 색이 있으면 그 칸, 없으면 새 판(이 파일만)은 1번 칸부터 바꾸고 · 더하는 중이면 뒤에 붙임
 *  @returns {{ colors: string[], slot: Object<string, number> }} slot: 색 → 1부터 세는 필라멘트 번호 */
export function planSlots(have, want, fresh, max) {
  const colors = have.slice(), slot = {}, used = new Set()
  const find = (c) => colors.findIndex((x) => hex6(x) === c)
  for (const c of want) { const i = find(c); if (i >= 0) { slot[c] = i + 1; used.add(i) } }
  let next = 0
  for (const c of want) {
    if (slot[c]) continue
    if (fresh) { while (used.has(next) && next < max) next++; if (next >= max) break; colors[next] = c; slot[c] = next + 1; used.add(next); next++ }
    else if (colors.length < max) { colors.push(c); slot[c] = colors.length }
  }
  return { colors, slot }
}

/** 뷰어 불러오기 갈고리 — file: 올린 파일, added: [{ objectid, id, paint }], v: { api, colorsRef, replaceAll, project, objects, max } */
async function hook(file, added, v) {
  try {
    // 0.1.45 하나로 합친 3MF — 부품 색마다 필라멘트 칸을 정하고, 합친 물체의 칠한 면을 그 칸 번호로 다시 씀
    const lm = globalThis.__slcLastMerge
    if (lm && lm.file === file && v && v.api) {
      globalThis.__slcLastMerge = null
      const a = (added || []).find((x) => x.objectid === lm.objectid), rec = a && (v.objects || []).find((o) => o.id === a.id)
      const want = [...new Set(lm.parts.map((p) => p.color).filter(Boolean))]
      let slot = {}
      if (rec && want.length) {
        const have = (v.colorsRef && v.colorsRef.current) || []
        const fresh = !v.objects || v.objects.length <= (added || []).length
        const plan = planSlots(have, want, fresh, v.max || 16)
        slot = plan.slot
        if (plan.colors.join() !== have.join() && v.replaceAll) v.replaceAll(plan.colors)
      }
      // 0.1.46 자르기용 부품 범위 — 뷰어가 판을 STL 로 만들 때 부품마다 그 필라멘트 묶음으로 넘김 (merge3mf.js slicePartsOf)
      // 0.1.47 면을 칠하지 않고 화면에는 부품 조각으로 색을 보임 (merge3mf.js partsTick)
      if (rec) {
        rec.slcParts = lm.parts.map((p) => ({ start: p.start, count: p.count, ext: (p.color && slot[p.color]) || p.ext || 1, code: null }))
        if (v.colorsRef) globalThis.__slcColorsRef = v.colorsRef
        if (globalThis.__slcShowParts) globalThis.__slcShowParts(rec)
      }
      return
    }
    if (!file || !/\.3mf$/i.test(file.name || '') || !added || !added.length || !v || !v.api) return
    const ps = v.project && v.project.settings
    if (ps && Array.isArray(ps.filament_colour) && ps.filament_colour.length) return   // Bambu · Orca 프로젝트 — 뷰어가 이미 맞춤
    const map = await read3mfColors(file)
    const mine = added.filter((a) => !a.paint && map[a.objectid])
    if (!mine.length) return
    const want = [...new Set(mine.map((a) => map[a.objectid]))]
    const have = (v.colorsRef && v.colorsRef.current) || []
    const fresh = !v.objects || v.objects.length <= added.length
    const { colors, slot } = planSlots(have, want, fresh, v.max || 16)
    if (colors.join() !== have.join() && v.replaceAll) v.replaceAll(colors)
    for (const a of mine) { const n = slot[map[a.objectid]]; if (n) v.api.setObjectExtruder(a.id, n) }
    if (v.api.recolorObjects) v.api.recolorObjects()
  } catch (e) { /* 색만 못 읽음 — 모델은 그대로 */ }
}

globalThis.__slcColorHook = hook
