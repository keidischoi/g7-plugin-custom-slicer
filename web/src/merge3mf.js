// custom-slicer — 🧩 여러 물체 3MF 를 하나로 합칠지 묻기 · AGPL-3.0-or-later
//  3MF 안에 물체가 여럿이면(부품이 맞물린 모델) 끌어 놓기 · 열기 때 「하나로 합치기 / 따로 두기」를 물음.
//  합치면 부품의 원래 자리 그대로 한 물체가 되어 같이 옮겨지고 돌려짐. 따로 두면 0.1.43 처럼 원래 모양대로 판 빈자리에 놓되 물체는 따로.
//  0.1.45 합칠 때 다색 그대로 — 부품마다 그 필라멘트로 면을 칠해 둠 (부품에 칠한 것도 이어 붙임). 「다음부터 묻지 않기」를 고르면 이 브라우저에 기억 (🧰 도구 줄의 단추로 다시 묻게 할 수 있음)
//  build.mjs 가 뷰어 불러오기(파일마다 물체 목록 De)에 globalThis.__slcMerge 갈고리를 넣음.

import { read3mfColors } from './colors3mf.js'

const LS = 'slc-merge'
/** 3MF 칠하기 글자 (OrcaSlicer TriangleSelector) — 칠하지 않은 통 면 하나의 상태 n: 1 → "4", 2 → "8", 3 이상 → (n-3) 16진수 + "C" */
export const encState = (n) => (n === 1 ? '4' : n === 2 ? '8' : (n - 3).toString(16).toUpperCase() + 'C')
const pref = () => { try { return localStorage.getItem(LS) || '' } catch (e) { return '' } }
const setPref = (v) => { try { localStorage.setItem(LS, v) } catch (e) {} }

/** 0.1.48 파일마다 고른 것 (이름 · 크기 · 고친 때) — 최근 30개만 */
const LS_FILES = 'slc-merge-files'
const fileKey = (f) => [f.name, f.size, f.lastModified].join('|')
export function lastChoice(f) { try { const v = (JSON.parse(localStorage.getItem(LS_FILES) || '{}') || {})[fileKey(f)]; return v === 'merge' || v === 'keep' ? v : '' } catch (e) { return '' } }
export function rememberChoice(f, v) {
  try {
    const m = JSON.parse(localStorage.getItem(LS_FILES) || '{}') || {}, k = fileKey(f)
    delete m[k]; m[k] = v
    const keys = Object.keys(m); for (const x of keys.slice(0, Math.max(0, keys.length - 30))) delete m[x]
    localStorage.setItem(LS_FILES, JSON.stringify(m))
  } catch (e) {}
}

/** 묻는 창 — 'merge' | 'keep' */
function ask(name, n) {
  return new Promise((resolve) => {
    const dark = document.documentElement.classList.contains('dark')
    const bg = dark ? '#0f172a' : '#fff', fg = dark ? '#e2e8f0' : '#0f172a', mute = dark ? '#94a3b8' : '#64748b', line = dark ? '#334155' : '#e2e8f0'
    const wrap = document.createElement('div')
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true')
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,23,42,.45);font:14px system-ui,"Malgun Gothic",sans-serif'
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    wrap.innerHTML = '<div style="width:min(420px,calc(100vw - 32px));padding:20px 20px 16px;border-radius:16px;background:' + bg + ';color:' + fg + ';border:1px solid ' + line + ';box-shadow:0 20px 50px rgba(0,0,0,.3)">' +
      '<div style="font-weight:800;font-size:16px;margin-bottom:6px">🧩 ' + esc('여러 물체가 든 3MF 예요') + '</div>' +
      '<div style="color:' + mute + ';line-height:1.55;margin-bottom:14px">' + esc(name) + ' — ' + esc('물체') + ' ' + n + esc('개') + '<br>' +
      esc('하나로 합치면 부품이 붙은 모양 그대로 한 물체가 되어 같이 옮기고 돌려요. 따로 두면 모양은 그대로 놓되 물체마다 따로 움직여요.') + '</div>' +
      '<label style="display:flex;align-items:center;gap:6px;color:' + mute + ';font-size:12.5px;margin-bottom:14px;cursor:pointer"><input type="checkbox" data-m="remember" style="margin:0"> ' + esc('다음부터 묻지 않기 (이 브라우저)') + '</label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" data-m="keep" style="padding:9px 14px;border-radius:10px;border:1px solid ' + line + ';background:transparent;color:' + fg + ';font:700 13.5px system-ui,sans-serif;cursor:pointer">' + esc('따로 두기') + '</button>' +
      '<button type="button" data-m="merge" style="padding:9px 14px;border-radius:10px;border:0;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font:800 13.5px system-ui,sans-serif;cursor:pointer">' + esc('하나로 합치기') + '</button></div></div>'
    document.body.appendChild(wrap)
    const done = (v) => { if (wrap.querySelector('[data-m=remember]').checked) setPref(v); wrap.remove(); removeEventListener('keydown', key, true); resolve(v) }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('keep') } else if (e.key === 'Enter') { e.stopPropagation(); done('merge') } }
    addEventListener('keydown', key, true)
    wrap.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) done(b.getAttribute('data-m')) })
    setTimeout(() => { const m = wrap.querySelector('[data-m=merge]'); if (m) m.focus() }, 0)
  })
}

/** 물체 목록 합치기 — 삼각형(모델 좌표)을 이어 붙임 · 이름은 파일 이름 · 첫 물체의 번호(프로젝트 정보)를 씀.
 *  0.1.45 다색 그대로 — exts[i] 가 있으면 i 번째 부품의 면을 모두 그 필라멘트(1부터)로 칠함 (부품에 이미 칠한 면은 그대로 · 면 번호는 이어 붙인 만큼 밀어 줌) */
export function mergeList(list, name, exts) {
  const total = list.reduce((a, k) => a + k.modelPos.length, 0), pos = new Float32Array(total)
  let o = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const k of list) {
    pos.set(k.modelPos, o); o += k.modelPos.length
    const b = k.bbox; if (b) { x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY); x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY) }
  }
  let paint = null
  if ((exts && exts.some((e) => e > 0)) || list.some((k) => k.paint)) {
    paint = { color: new Map(), supports: new Map(), seam: new Map(), fuzzy: new Map() }
    let f0 = 0
    list.forEach((k, i) => {
      const n = k.modelPos.length / 9, own = k.paint || null
      if (own) for (const key of Object.keys(paint)) if (own[key] && own[key].forEach) own[key].forEach((v, f) => paint[key].set(f0 + f, v))
      const e = exts && exts[i]
      if (e > 0) { const code = encState(e); for (let f = 0; f < n; f++) if (!paint.color.has(f0 + f)) paint.color.set(f0 + f, code) }
      f0 += n
    })
  }
  return [{ ...list[0], name: name || list[0].name, modelPos: pos, paint, baked: null, bbox: Number.isFinite(x0) ? { minX: x0, minY: y0, maxX: x1, maxY: y1 } : list[0].bbox }]
}

/** 뷰어 갈고리 — file: 올린 파일 · list: 그 파일의 물체들 [{ name, modelPos, objectid, paint, bbox, baked, project }] */
async function hook(file, list) {
  try {
    if (!file || !/\.3mf$/i.test(file.name || '') || !Array.isArray(list) || list.length < 2) return list
    if (list.some((k) => !k.modelPos)) return list
    // 0.1.48 새로고침해서 판을 다시 불러올 때는 그 파일에 지난번 고른 것을 그대로 (묻는 창이 새로고침마다 뜨던 것)
    const p = pref(), past = file.__slcRestored ? lastChoice(file) : ''
    const choice = p === 'merge' || p === 'keep' ? p : past || await ask(file.name, list.length)
    rememberChoice(file, choice)
    if (choice !== 'merge') return list
    // 0.1.45 부품마다 필라멘트 — 프로젝트(Bambu · Orca)는 물체 정보의 extruder, 아니면 3MF 의 부품 색 → 임시 번호(색 차례) · 색 갈고리가 나중에 실제 칸으로 바꿈
    const meta = list[0].project && list[0].project.objectMeta
    let exts = list.map((k) => { const m = meta && meta.get && meta.get(k.objectid); const e = Number(m && m.extruder); return Number.isInteger(e) && e >= 1 ? e : 0 })
    let cols = list.map(() => null)
    if (!exts.some((e) => e > 0)) {
      const map = await read3mfColors(file), uniq = [...new Set(list.map((k) => map[k.objectid]).filter(Boolean))]
      cols = list.map((k) => map[k.objectid] || null)
      if (uniq.length > 1 || (uniq.length === 1 && cols.some((c) => !c))) exts = cols.map((c) => (c ? uniq.indexOf(c) + 1 : 0))
      else exts = null
    }
    // 0.1.46 부품 범위 — 칠하기만으로는 엔진(칠한 면 → 안쪽으로 나누기)이 맞물린 부품을 못 살림 (동전 글자 F · 안쪽 고리가 빠짐) →
    //  자르기 때는 부품마다 그 필라멘트의 묶음(extruder 묶음)으로 넘김 (__slcParts)
    // 0.1.47 자동으로 칠하지도 않음 — 칠한 면이 있으면 뷰어가 자르기 전에 그 칠하기를 엔진에 다시 넣어 결국 같은 부품을 잃었음.
    //  부품 색은 화면에서만 부품 조각(partsTick)으로 보임 · 부품에 원래 칠해 둔 것은 그대로 이어 붙임
    const out = mergeList(list, String(file.name).replace(/\.3mf$/i, ''), null)
    let f0 = 0
    const parts = exts ? list.map((k, i) => { const r = { start: f0, count: k.modelPos.length / 9, color: cols[i], ext: exts[i] || 0 }; f0 += r.count; return r }) : null
    globalThis.__slcLastMerge = parts ? { file, objectid: list[0].objectid, parts } : null   // colors3mf.js 의 색 갈고리가 받아 실제 필라멘트 칸으로
    return out
  } catch (e) { return list }
}
globalThis.__slcMerge = hook

/** 0.1.46 자르기용 부품 묶음 — build.mjs 가 뷰어의 판 → STL 만들기(물체마다)에서 부름. P: { localPos, paint, parts: [{ start, count, ext, code }] }
 *  0.1.47 면 차례는 그대로 둠 (0.1.46 은 필라멘트 차례로 다시 늘어놓아, 뷰어의 칠하기 엔진이 칠한 면을 엉뚱한 곳에 그렸음 — 동전 테두리가 검게 · 글자가 빠져 보임).
 *  부품을 파일 차례 그대로 묶음으로 넘김 (같은 필라멘트가 다시 나와도 됨 — 엔진이 [1,0,1,0] 같은 차례도 자름).
 *  합칠 때 자동으로 칠한 면(부품 필라멘트와 같은 값)은 빼서, 엔진이 칠하기로 다시 나누지 않게 함 (손으로 더 칠한 것은 그대로)
 *  @returns {{ sig: string, runs: { at: number, ext: number }[], pos: Float32Array, paint: { color: [number, string][], supports: [number, string][] } } | null} */
export function slicePartsOf(P) {
  const parts = P && P.parts, lp = P && P.localPos
  if (!Array.isArray(parts) || !parts.length || !lp) return null
  const n = lp.length / 9
  if (parts.reduce((a, r) => a + r.count, 0) !== n) return null   // 물체가 바뀜(나누기 등) — 원래 길로
  const runs = []
  for (const r of parts) { const ext = r.ext || 1; if (!runs.length || runs[runs.length - 1].ext !== ext) runs.push({ at: r.start, ext }) }
  const partOf = (f) => { for (const r of parts) if (f >= r.start && f < r.start + r.count) return r; return null }
  const paint = { color: [], supports: [] }
  for (const key of ['color', 'supports']) {
    const m = P.paint && P.paint[key]
    if (m && m.forEach) m.forEach((v, f) => { if (f < 0 || f >= n) return; if (key === 'color') { const r = partOf(f); if (r && r.code && v === r.code) return } paint[key].push([f, v]) })
  }
  return { sig: parts.map((r) => r.ext || 1).join('.'), runs, pos: lp, paint }
}
globalThis.__slcParts = slicePartsOf

/** 0.1.47 합친 물체의 부품 색을 화면에 — 부품 필라멘트마다 물체 메시에 조각(자식 메시)을 붙여 그 필라멘트 색으로 그림.
 *  칠하기가 아니라서 자르기에 섞이지 않음. 필라멘트 색을 바꾸면 따라 바뀜 (plate.js 가 그리기마다 partsTick 을 부름) */
const VIEW = new Set()
export function showParts(rec) { if (rec && rec.mesh && Array.isArray(rec.slcParts)) VIEW.add(rec) }
/** 필라멘트 번호 → 그 부품 면들의 위치 (물체 메시 기준 좌표 = localPos) */
export function partGroups(lp, parts) {
  const by = new Map()
  for (const r of parts) {
    const ext = r.ext || 1, a = by.get(ext) || []
    a.push(r); by.set(ext, a)
  }
  const out = []
  for (const [ext, rs] of by) {
    const pos = new Float32Array(rs.reduce((a, r) => a + r.count, 0) * 9)
    let o = 0
    for (const r of rs) for (let k = r.start * 9, e = (r.start + r.count) * 9; k < e; k++) pos[o++] = lp[k]
    out.push({ ext, pos })
  }
  return out
}
function partsTick(THREE) {
  const cols = (globalThis.__slcColorsRef && globalThis.__slcColorsRef.current) || []
  for (const rec of VIEW) {
    const mesh = rec.mesh
    if (!mesh || !Array.isArray(rec.slcParts)) { VIEW.delete(rec); continue }
    if (!mesh.parent) continue
    let st = rec.__slcView
    if (!st || st.lp !== rec.localPos || st.parts !== rec.slcParts) {
      if (st) for (const m of st.meshes) { mesh.remove(m); m.geometry.dispose(); m.material.dispose() }
      st = rec.__slcView = { lp: rec.localPos, parts: rec.slcParts, meshes: [] }
      if (rec.slcParts.reduce((a, r) => a + r.count, 0) !== rec.localPos.length / 9) continue
      for (const g of partGroups(rec.localPos, rec.slcParts)) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
        geo.computeVertexNormals()
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
        m.userData.slcPart = g.ext; m.renderOrder = 999; m.raycast = () => {}
        mesh.add(m); st.meshes.push(m)
      }
    }
    for (const m of st.meshes) {
      const hex = cols[m.userData.slcPart - 1] || '#9ca3af'
      if (m.userData.slcHex !== hex) { m.userData.slcHex = hex; m.material.color.set(hex) }
    }
  }
}
globalThis.__slcPartsTick = partsTick
globalThis.__slcShowParts = showParts

/** 🧰 「다시 묻기」 — 기억한 선택을 지움 */
export function resetMergePref() { setPref('') }
export const mergePref = pref
