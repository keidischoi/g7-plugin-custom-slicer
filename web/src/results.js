// custom-slicer — 📊 슬라이싱 결과 (Bambu Studio 의 「슬라이싱 결과」처럼) · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 층 수 · 필라멘트 길이 · 예상 시간만 작게 보여 줌. 0.1.35 G-code 를 따로(Web Worker) 읽어
//  필라멘트마다 모델 · 플러시 · 타워 · 총 (m · g), 필라멘트 교체 횟수 · 비용 · 시간, 그리고 3D 에 표시: 이동 경로 · 수축 · 수축 복귀 · 닦기 · 재봉선.
//  층 번호는 뷰어와 같은 방법으로 셈 (;LAYER_CHANGE · ;Z: 표시가 있으면 그것, 없으면 압출하는 높이가 올라갈 때) → 층 슬라이더 범위의 표시만 보임.
import { BufferGeometry, BufferAttribute, Points, PointsMaterial, CanvasTexture } from 'three'
import { viewOf } from './plate.js'

/* ───────── G-code 읽기 (Worker 안에서도 돌게 — 바깥 이름을 쓰지 않음) ───────── */
export function parseGcode(text) {
  const KINDS = ['retract', 'unretract', 'wipe', 'seam']
  const mk = {}; for (const k of KINDS) mk[k] = []
  const tools = []   // [{ model, flush, tower }] mm
  const T = (i) => tools[i] || (tools[i] = { model: 0, flush: 0, tower: 0 })
  let x = 0, y = 0, z = 0, e = 0, absE = false, absXY = true, tool = 0, toolSeen = false, changes = 0, extruded = false
  let tminX = Infinity, tminY = Infinity
  let type = '', flush = false, wipe = false, layer = -1, markers = false, pending = true, curZ = -1e9, outerStart = false, retracted = false
  const OUTER = /^(outer wall|external perimeter|wall-outer|overhang wall)\b/
  const TOWER = /^(prime tower|wipe tower|prime-tower)\b/
  const newLayer = (zz) => { layer++; pending = false; curZ = zz }
  const put = (k, px, py, pz) => mk[k].push(px, py, pz, Math.max(0, layer))
  const lines = text.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li], sc = ln.indexOf(';'), code = (sc < 0 ? ln : ln.slice(0, sc)).trim(), com = sc < 0 ? '' : ln.slice(sc + 1).trim().toLowerCase()
    if (!code) {
      if (!com) continue
      if (com.startsWith('type:') || com.startsWith('feature:')) { type = com.slice(com.indexOf(':') + 1).trim(); outerStart = OUTER.test(type); continue }
      if (com.startsWith('layer_change') || com.startsWith('change_layer') || com.startsWith('layer:')) { markers = true; pending = true; continue }
      if (com.startsWith('z:') || com.startsWith('z_height:')) { const v = parseFloat(com.slice(com.indexOf(':') + 1)); if (pending && v > 0) { markers = true; newLayer(v) } continue }
      const lz = /^layer \d+ z([-\d.]+)/.exec(com); if (lz) { markers = true; newLayer(parseFloat(lz[1])); continue }
      if (com.startsWith('flush_start')) { flush = true; continue }
      if (com.startsWith('flush_end')) { flush = false; continue }
      if (com.startsWith('wipe_start')) { wipe = true; put('wipe', x, y, z); continue }
      if (com.startsWith('wipe_end')) { wipe = false; continue }
      continue
    }
    const c0 = code[0]
    if (c0 === 'T' || c0 === 't') { const n = parseInt(code.slice(1), 10); if (n >= 0 && n < 64) { if ((toolSeen || extruded) && n !== tool) changes++; tool = n; toolSeen = true } continue }
    if (c0 !== 'G' && c0 !== 'g' && c0 !== 'M' && c0 !== 'm') continue
    const parts = code.split(/\s+/), cmd = parts[0].toUpperCase()
    if (cmd === 'M82') { absE = true; continue }
    if (cmd === 'M83') { absE = false; continue }
    if (cmd === 'G90') { absXY = true; continue }
    if (cmd === 'G91') { absXY = false; continue }
    if (cmd === 'G92') { for (const p of parts) if (/^e/i.test(p)) e = parseFloat(p.slice(1)) || 0; continue }
    if (cmd === 'G10') { put('retract', x, y, z); retracted = true; continue }
    if (cmd === 'G11') { put('unretract', x, y, z); retracted = false; continue }
    if (cmd !== 'G0' && cmd !== 'G1' && cmd !== 'G2' && cmd !== 'G3') continue
    let nx = x, ny = y, nz = z, de = 0, hasE = false, hasXY = false
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i], k = p[0] ? p[0].toUpperCase() : '', v = parseFloat(p.slice(1)); if (Number.isNaN(v)) continue
      if (k === 'X') { nx = absXY ? v : x + v; hasXY = true } else if (k === 'Y') { ny = absXY ? v : y + v; hasXY = true } else if (k === 'Z') nz = absXY ? v : z + v
      else if (k === 'E') { hasE = true; de = absE ? v - e : v; e = absE ? v : e + v }
    }
    if (hasE && de < -1e-6) {   // 뒤로 빼기 — 움직이며 빼면 닦기
      if (hasXY && (nx !== x || ny !== y)) { if (!wipe) put('wipe', x, y, z) } else put('retract', x, y, z)
      retracted = true
    } else if (hasE && de > 1e-6 && !(hasXY && (nx !== x || ny !== y))) {   // 제자리에서 다시 밀기
      if (retracted) put('unretract', x, y, z)
      retracted = false
    } else if (hasE && de > 1e-6) {   // 압출
      if (pending) newLayer(nz); else if (!markers && nz > curZ + 1e-3) newLayer(nz)
      if (outerStart) { put('seam', x, y, z); outerStart = false }
      extruded = true
      const t = T(tool); if (flush) t.flush += de; else if (TOWER.test(type)) t.tower += de; else t.model += de
      retracted = false
    }
    if (!(hasE && de > 1e-6) && layer >= 0 && Math.hypot(nx - x, ny - y, nz - z) > 1e-6) {   // 뷰어처럼 첫 층이 생긴 뒤의 이동만
      if (x < tminX) tminX = x; if (nx < tminX) tminX = nx; if (y < tminY) tminY = y; if (ny < tminY) tminY = ny
    }
    x = nx; y = ny; z = nz
  }
  const out = { tools: tools.map((t) => t || { model: 0, flush: 0, tower: 0 }), changes, layers: layer + 1, marks: {}, tmin: Number.isFinite(tminX) ? [tminX, tminY] : null }
  for (const k of KINDS) {   // 층 순서로 정렬 → 층마다 시작 자리 (보이는 층 범위만 그리기)
    const a = mk[k], n = a.length / 4, idx = Array.from({ length: n }, (_, i) => i).sort((p, q) => a[p * 4 + 3] - a[q * 4 + 3])
    const pos = new Float32Array(n * 3), start = new Int32Array(out.layers + 1)
    let j = 0
    for (let L = 0; L <= out.layers; L++) { start[L] = j; while (j < n && a[idx[j] * 4 + 3] === L) j++ }
    for (let i = 0; i < n; i++) { const s = idx[i] * 4; pos[i * 3] = a[s]; pos[i * 3 + 1] = a[s + 1]; pos[i * 3 + 2] = a[s + 2] }
    out.marks[k] = { pos, start, n }
  }
  return out
}

/* ───────── 화면 ───────── */
export const RESULT_CSS = `
.slc-res{position:absolute;left:14px;bottom:48px;z-index:17;width:min(380px,calc(100% - 100px));max-height:calc(100% - 120px);display:flex;flex-direction:column;
  border-radius:14px;background:color-mix(in srgb,var(--_light-surface) 94%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 22px rgba(15,23,42,.14);
  backdrop-filter:blur(6px);font:12px system-ui,sans-serif;color:var(--_light-text);overflow:hidden}
.slc-res[hidden]{display:none!important}
.slc-res-h{display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;background:none;color:inherit;font:800 12.5px system-ui,sans-serif;cursor:pointer;text-align:left}
.slc-res-h i{margin-left:auto;font-style:normal;transition:transform .2s}
.slc-res.min .slc-res-h i{transform:rotate(180deg)}
.slc-res.min .slc-res-b{display:none}
.slc-res-b{overflow:auto;padding:0 12px 10px}
.slc-res table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.slc-res th{font-weight:700;color:var(--_light-text-muted);text-align:right;padding:4px 4px;border-bottom:1px solid var(--_light-divider);white-space:nowrap}
.slc-res th:first-child,.slc-res td:first-child{text-align:left}
.slc-res td{text-align:right;padding:4px 4px;line-height:1.3;white-space:nowrap;vertical-align:top}
.slc-res td small{display:block;color:var(--_light-text-muted)}
.slc-res tr.tot td{border-top:1px solid var(--_light-divider);font-weight:700}
.slc-res .sw{display:inline-block;width:10px;height:10px;margin-right:5px;border-radius:3px;border:1px solid rgba(0,0,0,.25);vertical-align:-1px}
.slc-res dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0 0}
.slc-res dt{color:var(--_light-text-muted)} .slc-res dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}
.slc-res h4{margin:10px 0 4px;font-size:11.5px;color:var(--_light-text-muted)}
.slc-res-o{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
.slc-res-o label{display:flex;align-items:center;gap:6px;cursor:pointer}
.slc-res-o input{margin:0;width:14px;height:14px;accent-color:#0ea5e9;cursor:pointer}
.slc-res-o .sw{border-radius:50%}
.slc-res-wait{padding:6px 0;color:var(--_light-text-muted)}
`

const COLORS = { travel: '#3b5bdb', retract: '#d946ef', unretract: '#22d3ee', wipe: '#facc15', seam: '#f1f5f9' }
const SHOW_LS = 'slc-res-show'
const showPref = () => { try { return Object.assign({ retract: false, unretract: false, wipe: false, seam: true, min: false }, JSON.parse(localStorage.getItem(SHOW_LS) || '{}')) } catch (e) { return { retract: false, unretract: false, wipe: false, seam: true, min: false } } }
const setShow = (p) => { try { localStorage.setItem(SHOW_LS, JSON.stringify(Object.assign(showPref(), p))) } catch (e) {} }
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const at = (a, i) => (Array.isArray(a) ? (a[i] != null ? a[i] : a[0]) : a)
const num = (v, d) => { const n = Number(String(v == null ? '' : v).split(/[;,]/)[0]); return n > 0 ? n : d }
const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + 'h' : '') + (h || m ? m + 'm' : '') + x + 's' }

let SRC = null, DATA = null, JOB = 0
/** app.js 가 슬라이스 결과(또는 연 G-code)를 넘김 — { gcode, settings, seconds } · null 이면 지움 */
export function setResultSource(src) {
  SRC = src && src.gcode ? src : null; DATA = null
  const job = ++JOB
  if (!SRC) return
  const done = (d) => { if (job === JOB) DATA = d }
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['onmessage=function(e){postMessage((' + parseGcode.toString() + ')(e.data))}'], { type: 'text/javascript' })))
    w.onmessage = (ev) => { done(ev.data); w.terminate() }
    w.onerror = () => { w.terminate(); try { done(parseGcode(SRC.gcode)) } catch (er) {} }
    w.postMessage(String(SRC.gcode))
  } catch (e) { setTimeout(() => { try { done(parseGcode(SRC.gcode)) } catch (er) {} }, 0) }
}

/** 점 무늬 (둥근 점) */
let DOT = null
const dotTex = () => {
  if (DOT) return DOT
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')
  g.beginPath(); g.arc(16, 16, 13, 0, 6.3); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke()
  DOT = new CanvasTexture(c); return DOT
}

/** root: 뷰어 그림자 뿌리 · col: .viewport-col · q: 뷰어 입력칸 찾기 — 미리 보기에서만 (layers.js 가 sync 마다 부름) */
export function mountResults(root, col) {
  if (col.__slcRes) return col.__slcRes
  if (!root.querySelector('style[data-slc-res]')) { const st = document.createElement('style'); st.setAttribute('data-slc-res', '1'); st.textContent = RESULT_CSS; root.appendChild(st) }
  const box = document.createElement('div'); box.className = 'slc-res'; box.hidden = true
  if (showPref().min) box.classList.add('min')
  col.appendChild(box)
  for (const ev of ['pointerdown', 'mousedown', 'wheel', 'click', 'keydown']) box.addEventListener(ev, (e) => e.stopPropagation())
  const q = (id) => root.querySelector('[data-testid="' + id + '"]')
  let drawn = null, pts = {}, holder = null
  const label = (k) => ({ travel: esc('이동 경로'), retract: esc('수축'), unretract: esc('수축 복귀'), wipe: esc('닦기'), seam: esc('재봉선') }[k])

  const render = () => {
    const S = SRC, D = DATA, set = (S && S.settings) || {}
    const head = '<button type="button" class="slc-res-h" data-res="min">📊 ' + esc('슬라이싱 결과') + '<i>▾</i></button>'
    if (!D) { box.innerHTML = head + '<div class="slc-res-b"><p class="slc-res-wait">' + esc('G-code 를 읽는 중…') + '</p></div>'; return }
    const cols = [].concat(set.filament_colour || []), rows = [], tot = { model: 0, flush: 0, tower: 0, g: [0, 0, 0], cost: 0 }
    const hasFlush = D.tools.some((t) => t.flush > 0), hasTower = D.tools.some((t) => t.tower > 0)
    D.tools.forEach((t, i) => {
      const all = t.model + t.flush + t.tower; if (all <= 0) return
      const dia = num(at(set.filament_diameter, i), 1.75), den = num(at(set.filament_density, i), 1.24), area = Math.PI * (dia / 2) * (dia / 2)
      const g = (mm) => (mm * area / 1000) * den
      const cell = (mm) => '<td>' + (mm / 1000).toFixed(2) + ' m<small>' + g(mm).toFixed(2) + ' g</small></td>'
      tot.model += t.model; tot.flush += t.flush; tot.tower += t.tower; tot.g[0] += g(t.model); tot.g[1] += g(t.flush); tot.g[2] += g(t.tower)
      tot.cost += (g(all) / 1000) * num(at(set.filament_cost, i), 0)
      rows.push('<tr><td><span class="sw" style="background:' + esc(at(cols, i) || '#c9ced6') + '"></span>' + (i + 1) + '</td>' + cell(t.model) + (hasFlush ? cell(t.flush) : '') + (hasTower ? cell(t.tower) : '') + cell(all) + '</tr>')
    })
    const tcell = (mm, gg) => '<td>' + (mm / 1000).toFixed(2) + ' m<small>' + gg.toFixed(2) + ' g</small></td>'
    const allMm = tot.model + tot.flush + tot.tower, allG = tot.g[0] + tot.g[1] + tot.g[2]
    const pref = showPref(), trav = q('travel-toggle')
    const opt = (k, on, dis) => '<label><input type="checkbox" data-show="' + k + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><span class="sw" style="background:' + COLORS[k] + '"></span>' + label(k) +
      (k !== 'travel' && D.marks[k] ? ' <small>(' + D.marks[k].n.toLocaleString() + ')</small>' : '') + '</label>'
    box.innerHTML = head + '<div class="slc-res-b"><table><thead><tr><th>' + esc('필라멘트') + '</th><th>' + esc('모델') + '</th>' + (hasFlush ? '<th>' + esc('플러시') + '</th>' : '') + (hasTower ? '<th>' + esc('타워') + '</th>' : '') + '<th>' + esc('총') + '</th></tr></thead><tbody>' +
      rows.join('') + (rows.length > 1 ? '<tr class="tot"><td>' + esc('총') + '</td>' + tcell(tot.model, tot.g[0]) + (hasFlush ? tcell(tot.flush, tot.g[1]) : '') + (hasTower ? tcell(tot.tower, tot.g[2]) : '') + tcell(allMm, allG) + '</tr>' : '') + '</tbody></table>' +
      '<dl>' + (D.changes ? '<dt>' + esc('필라멘트 교체') + '</dt><dd>' + D.changes.toLocaleString() + esc('번') + '</dd>' : '') + (tot.cost > 0 ? '<dt>' + esc('비용') + '</dt><dd>' + tot.cost.toFixed(2) + '</dd>' : '') +
      (S.seconds > 0 ? '<dt>' + esc('예상 출력 시간') + '</dt><dd>' + dur(S.seconds) + '</dd>' : '') + '<dt>' + esc('층') + '</dt><dd>' + D.layers.toLocaleString() + '</dd></dl>' +
      '<h4>' + esc('표시') + '</h4><div class="slc-res-o">' + opt('travel', !!(trav && trav.checked), !trav) + opt('retract', pref.retract) + opt('unretract', pref.unretract) + opt('wipe', pref.wipe) + opt('seam', pref.seam) + '</div></div>'
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-res=min]')
    if (b) { const m = !box.classList.contains('min'); box.classList.toggle('min', m); setShow({ min: m }) }
  })
  box.addEventListener('change', (e) => {
    const k = e.target.getAttribute('data-show'); if (!k) return
    if (k === 'travel') { const t = q('travel-toggle'); if (t && t.checked !== e.target.checked) t.click() }
    else setShow({ [k]: e.target.checked })
    api.update(true)
  })

  /** 3D 표시 — 지금 판의 길(툴패스) 무리 안에 G-code 좌표 그대로 점을 둠 · 층 슬라이더 범위만 */
  const draw = () => {
    const v = viewOf(), tg = v && v.toolpathGroup, D = DATA
    const H = tg && tg.children.find((c) => c.isGroup && c.visible !== false)
    if (!H || !D) { for (const k in pts) if (pts[k].parent) pts[k].parent.remove(pts[k]); return }
    if (holder !== H || drawn !== D) {
      for (const k in pts) { if (pts[k].parent) pts[k].parent.remove(pts[k]); pts[k].geometry.dispose(); pts[k].material.dispose() }
      pts = {}
      for (const k of ['retract', 'unretract', 'wipe', 'seam']) {
        const m = D.marks[k]; if (!m || !m.n) continue
        const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(m.pos, 3))
        const p = new Points(g, new PointsMaterial({ color: COLORS[k], size: k === 'seam' ? 7 : 6, sizeAttenuation: false, map: dotTex(), transparent: true, alphaTest: 0.4, depthTest: true }))
        p.frustumCulled = false; p.renderOrder = 20; p.userData.k = k; H.add(p); pts[k] = p
      }
      holder = H; drawn = D
    }
    // 0.1.36 뷰어는 슬라이스 결과의 길을 「G-code 좌표 − 판 가운데」로 그림 (연 G-code 파일은 그대로) → 점이 판 밖에 찍혀 안 보였음.
    //  같은 무리의 이동 선(LineSegments) 범위와 G-code 이동 범위를 견주어 어긋남을 구함 · 이동 선이 없으면 설정의 판 가운데
    let dx = 0, dy = 0
    const tl = H.children.find((c) => c.isLineSegments && c.geometry && c.geometry.attributes.position && c.geometry.attributes.position.count)
    if (tl && D.tmin) { if (!tl.geometry.boundingBox) tl.geometry.computeBoundingBox(); dx = tl.geometry.boundingBox.min.x - D.tmin[0]; dy = tl.geometry.boundingBox.min.y - D.tmin[1] }
    else if (SRC && SRC.sliced) { const pa = [].concat((SRC.settings || {}).printable_area || []).map((p) => (Array.isArray(p) ? p : String(p).split('x').map(Number))); if (pa.length >= 3) { const xs = pa.map((p) => +p[0]), ys = pa.map((p) => +p[1]); dx = -(Math.min(...xs) + Math.max(...xs)) / 2; dy = -(Math.min(...ys) + Math.max(...ys)) / 2 } }
    for (const k in pts) pts[k].position.set(dx, dy, 0)
    const lo = q('layer-lo'), hi = q('layer-hi'), pref = showPref()
    const a = lo ? Number(lo.value) || 0 : 0, b = hi ? Number(hi.value) || 0 : D.layers
    for (const k in pts) {
      const m = D.marks[k], p = pts[k], s = m.start[Math.min(a, D.layers)], e = m.start[Math.min(b + 1, D.layers)]
      p.visible = !!pref[k]; p.geometry.setDrawRange(s, Math.max(0, e - s))
    }
    if (v.invalidate) v.invalidate()
  }
  let shown = null, key = ''
  const api = {
    update(force) {   // layers.js sync 에서 — 미리 보기일 때만
      const pv = root.querySelector('[data-testid="mode-preview"]'), on = !!SRC && !!(pv && pv.classList.contains('on')) && !!q('layer-hi')
      box.hidden = !on
      if (on) { const cr = col.getBoundingClientRect(), off = Math.max(0, Math.round(cr.bottom - window.innerHeight)), b = 48 + off; if (box.__b !== b) { box.__b = b; box.style.bottom = b + 'px'; box.style.maxHeight = 'calc(100% - ' + (b + 72) + 'px)' } }   // 3D 칸 아래가 화면 밖이면 보이는 곳까지
      const sc = root.querySelector('.stats-card'); if (sc) sc.style.display = on ? 'none' : ''   // 뷰어의 작은 정보 상자 대신
      if (!on) { for (const k in pts) pts[k].visible = false; if (shown) { const v = viewOf(); if (v && v.invalidate) v.invalidate() } shown = null; return }
      const t = q('travel-toggle'), k2 = (DATA ? 'd' : 'w') + (SRC && SRC.seconds) + '|' + (t ? t.checked : '') + '|' + JOB
      if (force || shown !== DATA || key !== k2) { render(); shown = DATA; key = k2 }
      draw()
    },
  }
  col.__slcRes = api
  return api
}
