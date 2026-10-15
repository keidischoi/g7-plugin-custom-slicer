// custom-slicer — 모델 그림 (미리 보기 · .gcode.3mf 의 plate_1.png) · AGPL-3.0-or-later
//  three.js 없이 2D 캔버스로: 비스듬히 위에서 본 정사영 · 면마다 빛 · 먼 면부터 그림 (화가 방식)

/**
 * @param {Float32Array} t 삼각형 [x1,y1,z1, …]
 * @param {(f:number)=>string|null} colorOf 면 번호 → '#rrggbb' (null = 기본 색)
 * @param {number} size 캔버스 한 변 (px)
 * @return {HTMLCanvasElement}
 */
export function renderThumb(t, colorOf, size = 512) {
  const n = t.length / 9, cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  if (!n) return cv
  // 보는 방향: 앞(-y)에서 30° 위, 오른쪽으로 35° 돌림
  const yaw = -35 * Math.PI / 180, pitch = 30 * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const P = new Float32Array(n * 9)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < n * 3; i++) {
    const x = t[i * 3], y = t[i * 3 + 1], z = t[i * 3 + 2]
    const rx = x * cy - y * sy, ry = x * sy + y * cy             // z 축으로 돌림
    const sx = rx, sz = ry * sp + z * cp, depth = ry * cp - z * sp   // x 축으로 기울임 (화면 위 = sz)
    P[i * 3] = sx; P[i * 3 + 1] = -sz; P[i * 3 + 2] = depth
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (-sz < y0) y0 = -sz; if (-sz > y1) y1 = -sz
  }
  const s = (size * 0.86) / Math.max(x1 - x0, y1 - y0, 1e-6), ox = size / 2 - (x0 + x1) / 2 * s, oy = size / 2 - (y0 + y1) / 2 * s
  // 먼 면부터 (depth 큰 것 = 멂)
  const order = new Uint32Array(n), dep = new Float32Array(n)
  for (let f = 0; f < n; f++) { order[f] = f; dep[f] = P[f * 9 + 2] + P[f * 9 + 5] + P[f * 9 + 8] }
  order.sort((a, b) => dep[b] - dep[a])
  const L = [0.35, -0.55, 0.76], cache = {}
  const rgb = (h) => cache[h] || (cache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])
  for (let k = 0; k < n; k++) {
    const f = order[k], o = f * 9
    const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2], vx = t[o + 6] - t[o], vy = t[o + 7] - t[o + 1], vz = t[o + 8] - t[o + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    const lit = 0.45 + 0.55 * Math.abs(nx * L[0] + ny * L[1] + nz * L[2])
    const c = rgb(colorOf(f) || '#c9ced6')
    g.fillStyle = 'rgb(' + Math.round(c[0] * lit) + ',' + Math.round(c[1] * lit) + ',' + Math.round(c[2] * lit) + ')'
    g.strokeStyle = g.fillStyle
    g.beginPath()
    g.moveTo(P[o] * s + ox, P[o + 1] * s + oy); g.lineTo(P[o + 3] * s + ox, P[o + 4] * s + oy); g.lineTo(P[o + 6] * s + ox, P[o + 7] * s + oy)
    g.closePath(); g.fill(); g.stroke()
  }
  return cv
}

/** 캔버스 → PNG 바이트 */
export function pngBytes(cv) {
  return new Promise((ok) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => ok(new Uint8Array(a))) : ok(null)), 'image/png'))
}
