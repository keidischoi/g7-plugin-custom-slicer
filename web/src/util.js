// custom-slicer — 계산 도구 (화면 없이 node 로도 검사) · AGPL-3.0-or-later

const scalar = (v) => (Array.isArray(v) ? v[0] : v)
const at = (v, i) => (Array.isArray(v) ? (v[i] !== undefined ? v[i] : v[0]) : v)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export function hexDist(a, b) {
  const p = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]
  if (!/^#[0-9a-f]{6}/i.test(a || '') || !/^#[0-9a-f]{6}/i.test(b || '')) return 1e9
  const x = p(a), y = p(b)
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
}

/**
 * G-code 로 출력 시간 어림 (초) — 엔진이 다색일 때 예상 시간을 주지 않아서. 이동 거리 ÷ 속도 + 기다림(G4) + 색 바꿈(M620 S…)마다 swapSec.
 *  가속은 안 셈 (실제보다 조금 짧게 나옴)
 */
export function estimateSeconds(g, swapSec = 50) {
  let x = 0, y = 0, z = 0, f = 3000, t = 0, swaps = 0, i = 0
  const L = g.length
  while (i < L) {
    let j = g.indexOf('\n', i); if (j < 0) j = L
    const c0 = g.charCodeAt(i), c1 = g.charCodeAt(i + 1)
    if (c0 === 71 && (c1 === 48 || c1 === 49) && (g.charCodeAt(i + 2) === 32 || g.charCodeAt(i + 2) === 9)) {   // G0 · G1
      let k = i + 3, nx = x, ny = y, nz = z
      while (k < j) {
        const ch = g.charCodeAt(k)
        if (ch === 59) break   // ; 주석
        if (ch === 88 || ch === 89 || ch === 90 || ch === 70) {
          let e = k + 1; while (e < j && g.charCodeAt(e) !== 32 && g.charCodeAt(e) !== 59) e++
          const v = parseFloat(g.slice(k + 1, e))
          if (!isNaN(v)) { if (ch === 88) nx = v; else if (ch === 89) ny = v; else if (ch === 90) nz = v; else f = v }
          k = e
        } else k++
      }
      const d = Math.hypot(nx - x, ny - y, nz - z)
      if (d > 0 && f > 0) t += d / (f / 60)
      x = nx; y = ny; z = nz
    } else if (c0 === 71 && c1 === 52 && g.charCodeAt(i + 2) === 32) {   // G4 S초 · P밀리초
      const m = /([SP])(\d+(?:\.\d+)?)/.exec(g.slice(i, j)); if (m) t += m[1] === 'S' ? +m[2] : +m[2] / 1000
    } else if (c0 === 77 && g.startsWith('M620 S', i) && !g.startsWith('M620 S255', i)) swaps++
    i = j + 1
  }
  return t + swaps * swapSec
}

/** 출력하는 이동(G1 + E) 중 가장 높은 Z (mm) — .gcode.3mf 머리말의 높이 */
export function maxZ(g) {
  let z = 0, top = 0
  const re = /^G[01] [^\n;]*/gm
  let m
  while ((m = re.exec(g))) {
    const zm = / Z(-?\d+(?:\.\d+)?)/.exec(m[0]); if (zm) z = +zm[1]
    if (/ E\d/.test(m[0]) && z > top) top = z
  }
  return top
}

/** 엔진 결과 · 설정 → 색(압출기)마다 {mm, g, density, type, color} — 무게 = 길이 × 단면적 × 밀도 */
export function toolsOf(stats, s) {
  const mmBy = Array.isArray(stats.filament_mm_by_tool) && stats.filament_mm_by_tool.length ? stats.filament_mm_by_tool : [stats.filament_mm || 0]
  return mmBy.map((mm, i) => {
    const dia = Number(at(s.filament_diameter, i)) || 1.75, density = Number(at(s.filament_density, i)) || 1.24
    const col = String(at(s.filament_colour, i) || '#c9ced6')
    return { mm: +mm || 0, g: (+mm || 0) * Math.PI * (dia / 2) ** 2 * density / 1000, density, type: String(at(s.filament_type, i) || 'PLA'), color: (/^#[0-9a-f]{6}/i.test(col) ? col.slice(0, 7) : '#C9CED6').toUpperCase() }
  })
}

/**
 * 프린터 라운지의 내 프린터 {brand, model} → 엔진 프린터 [제조사, 이름] (같은 제조사 · 모델, 0.4 노즐 먼저 · 레진 제외)
 * @param {Record<string, Record<string, unknown>>} byVendor printersByVendor
 */
export function matchPreset(byVendor, p, tech = {}) {
  if (!byVendor || !p) return null
  const want = norm((p.brand || '') + ' ' + (p.model || '')), model = norm(p.model)
  let best = null, bs = 0
  for (const v of Object.keys(byVendor)) {
    if (tech[v] === 'SLA') continue
    for (const name of Object.keys(byVendor[v])) {
      const base = norm(name.replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, ''))
      let sc = base === want ? 100 : model && base.endsWith(model) && base.length - model.length <= 12 ? 70 : 0
      if (!sc) continue
      if (/ 0\.4 nozzle$/i.test(name)) sc += 5
      if (sc > bs) { bs = sc; best = [v, name] }
    }
  }
  return best
}

export { scalar }
