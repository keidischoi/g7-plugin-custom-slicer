/*! custom-slicer 0.1.84 — 🧪 레진 슬라이스: 층 그림 · 서포트 · 속 비우기 · 빼낼 구멍 · 프린터 파일
 * 0.1.84 출력 검사기(custom-print_check 0.26.141)에서 옮겨 옴 — 이제 슬라이서가 원본 (FDM · 레진 모두). 출력 검사기는 window.G7Slicer.resin 으로 붙임
 *  레진 프린터 · 레진 자료(/config · /printers · /resin) · 계산 코어(print-check-core.js) · 화면 CSS 는 출력 검사기 것을 주소로 씀
 * 모델은 서버로 가지 않음 — 회원 브라우저의 Web Worker 에서 계산
 * PCResin.* — 계산 / PCResinUI(A) — 화면 (A = 출력 검사기 앱이 빌려주는 것)
 * 같은 파일을 Web Worker 로도 씀 · 파일 모양: .goo · .prz (Elegoo · Phrozen) / Anycubic 표 형식 v516 (PW0 압축) */
(function (root, factory) {
  var G = factory();
  if (typeof module === 'object' && module.exports) module.exports = G;
  else if (typeof window === 'undefined' && typeof importScripts === 'function') G.worker(root);
  else { root.PCResin = G; root.PCResinUI = G.ui; root.PCResinMount = G.mount; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // 0.1.84 이 파일 주소 — 같은 파일을 Web Worker 로 띄울 때 (어느 플러그인이 내려줬든)
  var SELF = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';

  // 이름 · 화소 X · Y · 화면 mm X · Y · 높이 mm · 확장자 — 전용 암호 형식(CTB 암호판 · PM7 등)을 쓰는 기종은 뺌
  var PRINTERS = [
    ['Anycubic Photon M3', 4096, 2560, 163.84, 102.4, 180, 'pm3'], ['Anycubic Photon M3 Max', 6480, 3600, 298.08, 165.6, 300, 'pm3m'], ['Anycubic Photon M3 Plus', 5760, 3600, 198.15, 123.84, 245, 'pwmb'], ['Anycubic Photon M3 Premium', 7680, 4320, 218.88, 123.12, 250, 'pm3r'],
    ['Anycubic Photon Mono', 1620, 2560, 82.62, 130.56, 165, 'pwmo'], ['Anycubic Photon Mono 4K', 3840, 2400, 134.4, 84, 165, 'pwma'], ['Anycubic Photon Mono SE', 1620, 2560, 82.62, 130.56, 160, 'pwms'], ['Anycubic Photon Mono SQ', 2400, 2560, 120, 128, 200, 'pmsq'],
    ['Anycubic Photon Mono X', 3840, 2400, 192, 120, 245, 'pwmx'], ['Anycubic Photon Mono X 6K', 5760, 3600, 198.15, 123.84, 245, 'pwmb'], ['Anycubic Photon Mono X2', 4096, 2560, 196.61, 122.88, 200, 'pmx2'], ['Anycubic Photon Ultra', 1280, 720, 102.4, 57.6, 165, 'dlp'], ['Anycubic Photon D2', 2560, 1440, 130.56, 73.44, 165, 'dl2p'],
    ['Elegoo Mars 4', 8520, 4320, 153.36, 77.76, 175, 'goo'], ['Elegoo Mars 4 DLP', 2560, 1440, 132.8, 74.7, 150, 'goo'], ['Elegoo Mars 4 Max', 5760, 3600, 195.84, 122.4, 150, 'goo'], ['Elegoo Mars 4 Ultra', 8520, 4320, 153.36, 77.76, 165, 'goo'], ['Elegoo Mars 5', 4098, 2560, 143.43, 89.6, 150, 'goo'],
    ['Elegoo Saturn 3', 11520, 5120, 218.88, 122.88, 250, 'goo'], ['Elegoo Saturn 3 Ultra', 11520, 5120, 218.88, 122.88, 260, 'goo'], ['Elegoo Saturn 4', 11520, 5120, 218.88, 122.88, 220, 'goo'], ['Elegoo Jupiter 2', 15120, 6230, 302.4, 161.98, 300, 'goo'],
    ['Phrozen Sonic Mini 8K S', 7536, 3240, 165.792, 71.28, 170, 'prz']
  ].map(function (p) { return { name: p[0], px: [p[1], p[2]], mm: [p[3], p[4]], z: p[5], ext: p[6] }; });
  var ANY_VER = 516;
  var ANY_MAX = { pwmx: 516, pwmo: 516, pwms: 516, pmsq: 516, dlp: 516, pwma: 516, pm3: 516, pm3m: 516, pwmb: 517, dl2p: 517, pmx2: 517, pm3r: 517 };

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  /** 검사기에서 고른 프린터 이름 → 표의 프린터 (제일 길게 맞는 것) */
  function findPrinter(name) {
    var n = norm(name), best = null;
    if (!n) return null;
    PRINTERS.forEach(function (p) { var k = norm(p.name), s = norm(p.name.replace(/^\S+\s/, '')); if ((n === k || n === s || n.indexOf(k) >= 0 || n.indexOf(s) >= 0) && (!best || p.name.length > best.name.length)) best = p; });
    return best;
  }
  /** 값 — 카탈로그 프로필 + 회원 입력. 빠진 칸은 흔한 기본값 */
  function params(prof, over) {
    var p = prof || {}, m = over || {}, pick = function (k, a, d) { return m[k] > 0 ? +m[k] : p[a] > 0 ? +p[a] : d; }, lift = pick('lift', 'lift_mm', 6), ls = pick('ls', 'lift_speed', 1);
    return { exposure: pick('exp', 'exposure_s', 2.5), bottomExposure: pick('bot', 'bottom_exposure_s', 25), bottomLayers: Math.round(pick('bl', 'bottom_layers', 5)), lightOff: pick('off', 'light_off_s', 1), lift: lift, liftSpeed: ls, bottomLift: pick('blift', 'bottom_lift_mm', Math.max(lift, 8)), bottomLiftSpeed: pick('bls', 'bottom_lift_speed', Math.min(1, Math.max(0.5, ls / 2))), retractSpeed: pick('rs', 'retract_speed', 3) };
  }
  function layerSeconds(q, bottom) { return bottom ? q.bottomExposure + q.lightOff + q.bottomLift / q.bottomLiftSpeed + q.bottomLift / q.retractSpeed : q.exposure + q.lightOff + q.lift / q.liftSpeed + q.lift / q.retractSpeed; }
  function printSeconds(q, n) { var b = Math.min(n, q.bottomLayers); return b * layerSeconds(q, true) + (n - b) * layerSeconds(q, false); }

  /** 서포트 끝 굵기 추천 — 박리 힘(어림 1 N/cm²)과 모델 무게 · 0.26.13 굳기 전 강도는 인장의 1/10 · 힘은 끝의 1/3 이 받는다고 어림 · 무게별 최소 굵기 */
  function tipFor(o) {
    var count = Math.max(1, o.count || 0), tensile = o.tensile > 0 ? o.tensile : 30, area = o.maxAreaMm2 || 0, gram = o.grams || 0;
    var load = (area * 0.01 + gram * 0.0098 * 2) / Math.max(1, count / 3), d = 2 * Math.sqrt(load / (tensile * 0.1 * Math.PI));
    var floor = gram < 20 ? 0.3 : gram < 50 ? 0.4 : gram < 120 ? 0.45 : gram < 300 ? 0.5 : 0.6;
    return Math.min(0.6, Math.max(floor, Math.round(d * 0.8 * 20) / 20));
  }
  /** 0.26.21 기둥 굵기 — 끝의 1.8배 · 높을수록 조금 굵게 (높이 100 mm 마다 +0.5) */
  function bodyFor(tip, height) { return Math.min(2, Math.round(Math.max(0.8, tip * 1.8 + (height || 0) / 200) * 10) / 10); }

  /** 한 층의 윤곽 → 줄마다 [시작 x, 끝 x …]. tris = 놓인 삼각형 · ids = 지금 층에 걸린 삼각형 번호 · 모든 좌표는 화소 */
  function rows(tris, ids, z, W, H, sx, sy, cross) {
    var i, r, touched = [];
    for (i = 0; i < ids.length; i++) {
      var o = ids[i] * 9, pts = [], e;
      for (e = 0; e < 3; e++) {
        var a = o + e * 3, b = o + ((e + 1) % 3) * 3, za = tris[a + 2] - z, zb = tris[b + 2] - z;
        if ((za < 0) !== (zb < 0)) { var k = za / (za - zb); pts.push(tris[a] + (tris[b] - tris[a]) * k, tris[a + 1] + (tris[b + 1] - tris[a + 1]) * k); }
      }
      if (pts.length !== 4) continue;
      // 바깥쪽이 오른쪽이 되게 — 삼각형 법선으로 방향을 정함
      var ux = tris[o + 3] - tris[o], uy = tris[o + 4] - tris[o + 1], uz = tris[o + 5] - tris[o + 2], vx = tris[o + 6] - tris[o], vy = tris[o + 7] - tris[o + 1], vz = tris[o + 8] - tris[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, x0 = pts[0], y0 = pts[1], x1 = pts[2], y1 = pts[3];
      if ((y1 - y0) * nx - (x1 - x0) * ny < 0) { x0 = pts[2]; y0 = pts[3]; x1 = pts[0]; y1 = pts[1]; }
      var d = y1 < y0 ? 1 : -1, px0 = x0 * sx + W / 2, py0 = y0 * sy + H / 2, px1 = x1 * sx + W / 2, py1 = y1 * sy + H / 2;
      if (py0 > py1) { var t = px0; px0 = px1; px1 = t; t = py0; py0 = py1; py1 = t; }
      var r0 = Math.max(0, Math.ceil(py0 - 0.5)), r1 = Math.min(H - 1, Math.ceil(py1 - 0.5) - 1), slope = py1 > py0 ? (px1 - px0) / (py1 - py0) : 0;
      for (r = r0; r <= r1; r++) {
        var c = cross[r]; if (!c.length) touched.push(r);
        // x 를 1/16 화소로 묶고 맨 아래 비트에 방향
        c.push(Math.round((px0 + (r + 0.5 - py0) * slope) * 16) * 2 + (d > 0 ? 1 : 0));
      }
    }
    var out = {};
    for (i = 0; i < touched.length; i++) {
      r = touched[i];
      var list = cross[r], spans = [], w = 0, start = 0;
      list.sort(function (p, q) { return p - q; });
      for (var j = 0; j < list.length; j++) {
        var v = list[j], x = Math.floor(v / 2) / 16, was = w;
        w += v % 2 === 1 ? 1 : -1;
        if (was === 0 && w !== 0) start = x; else if (was !== 0 && w === 0) { var xa = Math.max(0, Math.round(start)), xb = Math.min(W, Math.round(x)); if (xb > xa) spans.push(xa, xb); }
      }
      list.length = 0;
      if (spans.length) out[r] = spans;
    }
    return out;
  }
  /** 정렬된 [a,b …] 둘을 합침 */
  function unite(a, b) {
    var out = [], i = 0, j = 0, s = -1, e = -1, x, y;   // 0.26.90 둘 다 정렬돼 있으니 앞에서부터 합침
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && a[i] <= b[j])) { x = a[i]; y = a[i + 1]; i += 2; } else { x = b[j]; y = b[j + 1]; j += 2; }
      if (e < 0) { s = x; e = y; } else if (x <= e) { if (y > e) e = y; } else { out.push(s, e); s = x; e = y; }
    }
    if (e >= 0) out.push(s, e);
    return out;
  }
  /** a 에서 b 를 뺌 */
  function cutOut(a, b) {
    var out = [], j = 0;
    for (var i = 0; i < a.length; i += 2) {
      var s = a[i], e = a[i + 1];
      while (j < b.length && b[j + 1] <= s) j += 2;
      var k = j;
      while (k < b.length && b[k] < e) { if (b[k] > s) out.push(s, b[k]); s = Math.max(s, b[k + 1]); k += 2; }
      if (s < e) out.push(s, e);
    }
    return out;
  }
  function addSpan(map, r, a, b, H) { if (r < 0 || r >= H || b <= a) return; map[r] = map[r] ? unite(map[r], [a, b]) : [a, b]; }
  function addDisc(map, cx, cy, rx, ry, W, H) {
    var r0 = Math.ceil(cy - ry), r1 = Math.floor(cy + ry);
    for (var r = r0; r <= r1; r++) { var t = (r - cy) / ry, hw = rx * Math.sqrt(Math.max(0, 1 - t * t)); addSpan(map, r, Math.max(0, Math.round(cx - hw)), Math.min(W, Math.round(cx + hw)), H); }
  }

  /** 🕳 속 비우기 — 거친 칸에서 겉면까지 거리가 벽보다 먼 곳이 빈 곳. 위아래까지 3차원으로 재서 층마다 깎는 것보다 안전 */
  /** 0.26.102 속 안쪽에 뜬 곳 — 밖에서 받칠 수 없어 바닥까지 단단한 기둥으로 남김 */
  function hollowPillar(h, x, y, z) {
    var v = h.v, r = Math.ceil(1.5 / v), jx = Math.floor((x - h.x0) / v), jy = Math.floor((y - h.y0) / v), top = Math.min(h.nz - 1, Math.floor(z / v + 0.5) + 1), a, b, k;
    for (b = -r; b <= r; b++) for (a = -r; a <= r; a++) { var ix = jx + a, iy = jy + b, seen = false; if (a * a + b * b > r * r || ix < 0 || iy < 0 || ix >= h.nx || iy >= h.ny) continue; for (k = top; k >= 0; k--) { var c = (k * h.ny + iy) * h.nx + ix; if (h.g[c]) { h.g[c] = 0; seen = true; } else if (seen) break; } }
  }
  function hollowAt(h, x, y, z) { var v = h.v, r = Math.ceil(1.2 / v), jx = Math.floor((x - h.x0) / v), jy = Math.floor((y - h.y0) / v), k = Math.floor(z / v + 0.5), a, b; if (k < 0 || k >= h.nz) return false; for (b = -r; b <= r; b++) for (a = -r; a <= r; a++) { var ix = jx + a, iy = jy + b; if (ix >= 0 && iy >= 0 && ix < h.nx && iy < h.ny && h.g[(k * h.ny + iy) * h.nx + ix]) return true; } return false; }
  function hollowGrid(tris, hi, wall, lat) {
    var n = tris.length / 9 | 0, mn = [Infinity, Infinity], mx = [-Infinity, -Infinity], i;
    for (i = 0; i < tris.length; i += 3) { var x = tris[i], y = tris[i + 1]; if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x; if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y; }
    var sz = [mx[0] - mn[0], mx[1] - mn[1], hi], v = Math.max(0.2, wall / 5, Math.cbrt(sz[0] * sz[1] * sz[2] / 2e7));
    var nx = Math.ceil(sz[0] / v) + 3, ny = Math.ceil(sz[1] / v) + 3, nz = Math.ceil(sz[2] / v) + 3, g = new Uint8Array(nx * ny * nz), cross = [], k, r;
    for (r = 0; r < ny; r++) cross.push([]);
    var cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, shifted = new Float32Array(tris.length);
    for (i = 0; i < tris.length; i += 3) { shifted[i] = tris[i] - cx; shifted[i + 1] = tris[i + 1] - cy; shifted[i + 2] = tris[i + 2]; }
    var all = []; for (i = 0; i < n; i++) all.push(i);
    for (k = 0; k < nz; k++) {
      var z = (k - 0.5) * v, hit = [];
      for (i = 0; i < n; i++) { var o = i * 9, a = shifted[o + 2], b = shifted[o + 5], c = shifted[o + 8]; if (Math.min(a, b, c) <= z && Math.max(a, b, c) >= z) hit.push(i); }
      var m = rows(shifted, hit, z, nx, ny, 1 / v, 1 / v, cross);
      for (r in m) { var sp = m[r], base = (k * ny + (+r)) * nx; for (var q = 0; q < sp.length; q += 2) g.fill(1, base + sp[q], base + sp[q + 1]); }
    }
    // 겉면까지 거리 — 앞뒤로 두 번 쓸어내는 어림 (칸 단위)
    var d = new Float32Array(g.length), big = 1e6, dx = [1, nx - 1, nx, nx + 1], sxy = nx * ny, nb = [[-1, 0, 0, 1], [0, -1, 0, 1], [0, 0, -1, 1], [-1, -1, 0, 1.414], [1, -1, 0, 1.414], [-1, 0, -1, 1.414], [1, 0, -1, 1.414], [0, -1, -1, 1.414], [0, 1, -1, 1.414], [-1, -1, -1, 1.732], [1, -1, -1, 1.732], [-1, 1, -1, 1.732], [1, 1, -1, 1.732]];
    for (i = 0; i < g.length; i++) d[i] = g[i] ? big : 0;
    function sweep(sign) {
      var zs = sign > 0 ? 1 : nz - 2, ze = sign > 0 ? nz - 1 : 0;
      for (var kz = zs; kz !== ze; kz += sign) for (var ky = sign > 0 ? 1 : ny - 2; ky !== (sign > 0 ? ny - 1 : 0); ky += sign) for (var kx = sign > 0 ? 1 : nx - 2; kx !== (sign > 0 ? nx - 1 : 0); kx += sign) {
        var id = kz * sxy + ky * nx + kx; if (!g[id]) continue;
        var best = d[id];
        for (var t = 0; t < nb.length; t++) { var w = d[id + sign * (nb[t][0] + nb[t][1] * nx + nb[t][2] * sxy)] + nb[t][3]; if (w < best) best = w; }
        d[id] = best;
      }
    }
    sweep(1); sweep(-1);
    var need = wall / v + 0.5, cav = new Uint8Array(g.length), count = 0;
    // 0.26.90 속 격자 — 세 방향 막대를 남겨 벽이 찌그러지지 않게. 막대 사이로 레진이 빠짐
    var pv = lat ? Math.max(3, Math.round(lat / v)) : 0, tv = Math.max(2, Math.round(1.2 / v)), ix, iy, iz;
    for (iz = 0; iz < nz; iz++) for (iy = 0; iy < ny; iy++) for (ix = 0; ix < nx; ix++) {
      i = iz * sxy + iy * nx + ix; if (!g[i] || d[i] <= need) continue;
      if (pv && (ix % pv < tv ? 1 : 0) + (iy % pv < tv ? 1 : 0) + (iz % pv < tv ? 1 : 0) >= 2) continue;
      cav[i] = 1; count++;
    }
    return { g: cav, nx: nx, ny: ny, nz: nz, v: v, x0: cx - nx * v / 2, y0: cy - ny * v / 2, count: count, dx: dx };
  }
  /** 빼낼 구멍 자리 — 빈 곳의 맨 아래에서 가운데 + 그곳에서 제일 먼 곳. 판 쪽 입구라 공기가 갇히지 않음 */
  function drainHoles(h, count) {
    var i, j, k, low = -1, list = [];
    for (k = 0; k < h.nz && low < 0; k++) for (i = 0; i < h.nx * h.ny; i++) if (h.g[k * h.nx * h.ny + i]) { low = k; break; }
    if (low < 0) return [];
    var top = Math.min(h.nz, low + Math.ceil(3 / h.v) + 1);
    for (k = low; k < top; k++) for (j = 0; j < h.ny; j++) for (i = 0; i < h.nx; i++) if (h.g[(k * h.ny + j) * h.nx + i]) list.push([h.x0 + (i + 0.5) * h.v, h.y0 + (j + 0.5) * h.v, (k + 0.5) * h.v]);
    if (!list.length) return [];
    var mx = 0, my = 0; list.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= list.length; my /= list.length;
    var a = list[0], da = Infinity; list.forEach(function (p) { var t = Math.hypot(p[0] - mx, p[1] - my); if (t < da) { da = t; a = p; } });
    if (count < 2) return [a];
    var b = a, db = -1; list.forEach(function (p) { var t = Math.hypot(p[0] - a[0], p[1] - a[1]); if (t > db) { db = t; b = p; } });
    return db > 2 ? [a, b] : [a];
  }

  /**
   * 슬라이스 — t = 놓인 삼각형 (가운데 0,0 · 바닥 z=0)
   * o: printer · layer · lift(띄움) · support · spacing · tip · body · raft · hollow · wall · holes · hole · mirror · overhang
   * core = PCCore (supports) · onProgress(0~1)
   * @return { w, h, layers:[Int32Array [시작 위치, 길이 …]], areas, supports, holes, tip … } — 위치 = 줄 × 가로 + x, 이미 파일에 쓸 방향
   */
  /** 0.26.22 회전 행렬 — turned 와 같은 순서 (X → Y → Z) · 도구로 돌린 값을 세 각도로 바꿈 */
  function rotMat(r) { var d = Math.PI / 180, a = r[0] * d, b = r[1] * d, c = r[2] * d, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c); return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca]; }
  function axisMat(i, deg) { var r = [0, 0, 0]; r[i] = deg; return rotMat(r); }
  function mat3(a, b) { var o = [], i, j; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) o.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[j + 3] + a[i * 3 + 2] * b[j + 6]); return o; }
  function eulerOf(m) { var d = 180 / Math.PI, sy = Math.hypot(m[0], m[3]), x, y = Math.atan2(-m[6], sy), z; if (sy > 1e-6) { x = Math.atan2(m[7], m[8]); z = Math.atan2(m[3], m[0]); } else { x = Math.atan2(-m[5], m[4]); z = 0; } return [x, y, z].map(function (v) { return Math.round(v * d * 10) / 10; }); }
  /**
   * 0.26.90 자동 기울임 — 판과 나란한 넓은 면 · 오버행 · 높이를 함께 보고 가장 나은 X · Y 각도를 찾음
   * @param {{ placed: function }} C 코어
   * @param {Float32Array} t 삼각형
   * @param {string} key 놓은 방향
   * @param {{ mm: number[], z: number }} box 프린터 크기
   * @return {{ rot: number[], before: number, after: number }}
   */
  function autoTilt(C, t, key, box) {
    var o = C.placed(t, key), n = o.length / 9 | 0, st = Math.max(1, Math.ceil(n / 60000)), N = [], A = 0, i, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (i = 0; i < n; i += st) {
      var q = i * 9, ux = o[q + 3] - o[q], uy = o[q + 4] - o[q + 1], uz = o[q + 5] - o[q + 2], vx = o[q + 6] - o[q], vy = o[q + 7] - o[q + 1], vz = o[q + 8] - o[q + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l > 1e-9) { N.push(nx / l, ny / l, nz / l, l / 2); A += l / 2; }
    }
    var Pt = []; for (i = 0; i < o.length; i += 3 * Math.max(1, Math.ceil(o.length / 3 / 20000))) { Pt.push(o[i], o[i + 1], o[i + 2]); x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); z0 = Math.min(z0, o[i + 2]); z1 = Math.max(z1, o[i + 2]); }
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, diag = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1, r = Math.PI / 180;
    var score = function (a, b) {
      var ca = Math.cos(a * r), sa = Math.sin(a * r), cb = Math.cos(b * r), sb = Math.sin(b * r), over = 0, flat = 0, k, hi = -Infinity, lo = Infinity, xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
      for (k = 0; k < N.length; k += 4) { var z = -N[k] * sb + (N[k + 1] * sa + N[k + 2] * ca) * cb; if (z < -0.94) flat += N[k + 3]; if (z < -0.707) over += N[k + 3] * (-z - 0.707); }
      for (k = 0; k < Pt.length; k += 3) { var px = Pt[k] - cx, py = Pt[k + 1] - cy, pz = Pt[k + 2] - cz, y1a = py * ca - pz * sa, z1a = py * sa + pz * ca, xx = px * cb + z1a * sb, zz = -px * sb + z1a * cb; if (zz > hi) hi = zz; if (zz < lo) lo = zz; if (xx < xa) xa = xx; if (xx > xb) xb = xx; if (y1a < ya) ya = y1a; if (y1a > yb) yb = y1a; }
      if (box && (hi - lo > box.z - 6 || xb - xa > box.mm[0] - 4 || yb - ya > box.mm[1] - 4)) return Infinity;
      return (over + flat * 2) / A + (hi - lo) / diag * 0.15 + (Math.abs(a) + Math.abs(b)) / 60 * 0.01;
    };
    var bestV = score(0, 0), before = bestV, rot = [0, 0, 0], ax, by;
    for (ax = -60; ax <= 60; ax += 15) for (by = -60; by <= 60; by += 15) { var v0 = score(ax, by); if (v0 < bestV - 1e-9) { bestV = v0; rot = [ax, by, 0]; } }
    return { rot: rot, before: Math.round(before * 1000) / 1000, after: Math.round(bestV * 1000) / 1000 };
  }
  /** 0.26.19 놓은 방향에 X · Y · Z 회전(도)을 더함 — 판 가운데 · 바닥 z = 0 으로 다시 놓음 */
  function turned(C, t, key, rot) {
    var o = C.placed(t, key), i; if (!rot || (!rot[0] && !rot[1] && !rot[2])) return o;
    var r = Math.PI / 180, ca = Math.cos(rot[0] * r), sa = Math.sin(rot[0] * r), cb = Math.cos(rot[1] * r), sb = Math.sin(rot[1] * r), cc = Math.cos(rot[2] * r), sc = Math.sin(rot[2] * r);
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
    for (i = 0; i < o.length; i += 3) {
      var x = o[i], y = o[i + 1], z = o[i + 2], y1a = y * ca - z * sa, z1a = y * sa + z * ca, x2 = x * cb + z1a * sb, z2 = -x * sb + z1a * cb, x3 = x2 * cc - y1a * sc, y3 = x2 * sc + y1a * cc;
      o[i] = x3; o[i + 1] = y3; o[i + 2] = z2;
      if (x3 < x0) x0 = x3; if (x3 > x1) x1 = x3; if (y3 < y0) y0 = y3; if (y3 > y1) y1 = y3; if (z2 < z0) z0 = z2;
    }
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (i = 0; i < o.length; i += 3) { o[i] -= cx; o[i + 1] -= cy; o[i + 2] -= z0; }
    return o;
  }
  function sizeOf(t) { var a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity], i; for (i = 0; i < t.length; i++) { var k = i % 3; if (t[i] < a[k]) a[k] = t[i]; if (t[i] > b[k]) b[k] = t[i]; } return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
  /** 0.26.18 래프트 모양 — 모델을 위에서 본 그림자 + pad mm. rows[j] = [시작 칸, 끝 칸, …] */
  function raftShape(t, pads) {
    var pad = pads[0], g = 0.3, i, j, masks = [], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (i = 0; i < t.length; i += 3) { if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i]; if (t[i + 1] < y0) y0 = t[i + 1]; if (t[i + 1] > y1) y1 = t[i + 1]; }
    x0 -= pad + g; y0 -= pad + g;
    var nx = Math.ceil((x1 + pad + g - x0) / g), ny = Math.ceil((y1 + pad + g - y0) / g), m = new Uint8Array(nx * ny);
    function mark(x, y) { m[Math.floor((y - y0) / g) * nx + Math.floor((x - x0) / g)] = 1; }
    function edge(ax, ay, bx, by) { var c = Math.ceil(Math.hypot(bx - ax, by - ay) / g) || 1; for (var k = 0; k <= c; k++) mark(ax + (bx - ax) * k / c, ay + (by - ay) * k / c); }
    for (i = 0; i < t.length; i += 9) {
      var ax = t[i], ay = t[i + 1], bx = t[i + 3], by = t[i + 4], cx = t[i + 6], cy = t[i + 7];
      edge(ax, ay, bx, by); edge(bx, by, cx, cy); edge(cx, cy, ax, ay);
      var i0 = Math.floor((Math.min(ax, bx, cx) - x0) / g), i1 = Math.floor((Math.max(ax, bx, cx) - x0) / g), j0 = Math.floor((Math.min(ay, by, cy) - y0) / g), j1 = Math.floor((Math.max(ay, by, cy) - y0) / g);
      if (i1 - i0 < 2 || j1 - j0 < 2) continue;
      for (j = j0; j <= j1; j++) for (var q = i0; q <= i1; q++) {
        var px = x0 + (q + 0.5) * g, py = y0 + (j + 0.5) * g, d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx), d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
        if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) m[j * nx + q] = 1;
      }
    }
    var levels = pads.map(function (pd) {   // 0.26.26 층마다 넓이가 다른 쐐기 — 판 쪽부터
      var r = Math.ceil(pd / g), disc = [], o = m.slice(); masks.push(o);
      for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) if (i * i + j * j <= r * r) disc.push(i, j);
      for (j = 1; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
        var c0 = j * nx + i; if (!m[c0] || (m[c0 - 1] && m[c0 + 1] && m[c0 - nx] && m[c0 + nx])) continue;
        for (var d = 0; d < disc.length; d += 2) { var u = i + disc[d], v = j + disc[d + 1]; if (u >= 0 && u < nx && v >= 0 && v < ny) o[v * nx + u] = 1; }
      }
      return rowsOf(o);
    });
    function rowsOf(o) {
      var rows = [];
      for (j = 0; j < ny; j++) { var line = [], on = false, st = 0; for (i = 0; i <= nx; i++) { var c1 = i < nx && o[j * nx + i]; if (c1 && !on) { on = true; st = i; } else if (!c1 && on) { on = false; line.push(st, i); } } rows.push(line); }
      return rows;
    }
    return { g: g, x0: x0, y0: y0, levels: levels, nx: nx, ny: ny, masks: masks, rowsOf: rowsOf };
  }
  /** 0.26.47 뗏목 구멍 — 판에 붙는 면적을 줄여 잘 떨어지게. 가장자리와 기둥 발은 피해서 규칙적으로 뚫음. 뚫은 수를 돌려줌 */
  function raftCarve(sh, cols) {
    var g = sh.g, rows0 = sh.levels[0], got = [], i, j;
    var on = function (x, y) { var ln = rows0[Math.floor((y - sh.y0) / g)], c0 = (x - sh.x0) / g; if (ln) for (var k = 0; k < ln.length; k += 2) if (c0 >= ln[k] && c0 < ln[k + 1]) return true; return false; };
    var feet = (cols || []).filter(function (c) { return !c[3]; }).map(function (c) { return [c[0], c[1], (c[5] ? c[5] / 2 : 0.5) + 0.5]; });
    var x1 = sh.x0 + sh.nx * g, y1 = sh.y0 + sh.ny * g;
    // 빈 곳은 Ø3.5, 기둥 사이는 Ø2, 빽빽한 곳은 틈에 Ø1.5
    [[1.75, 6, 0.8], [1, 4, 0.6], [0.75, 3, 0.3]].forEach(function (sz) {
      var r = sz[0], gap = sz[1], rim = r + 2.5, step = gap / 4, row = 0, a;
      for (var y = sh.y0; y < y1; y += step * 0.866, row++) for (var x = sh.x0 + (row % 2 ? step / 2 : 0); x < x1; x += step) {
        var ok = on(x, y); for (a = 0; ok && a < 8; a++) if (!on(x + Math.cos(a * Math.PI / 4) * rim, y + Math.sin(a * Math.PI / 4) * rim)) ok = false;
        for (a = 0; ok && a < feet.length; a++) if (Math.hypot(feet[a][0] - x, feet[a][1] - y) < r + feet[a][2] + sz[2]) ok = false;
        for (a = 0; ok && a < got.length; a++) if (Math.hypot(got[a][0] - x, got[a][1] - y) < Math.max(gap, got[a][2] + r + 1)) ok = false;
        if (ok) got.push([x, y, r]);
      }
    });
    sh.masks.forEach(function (o, l) {
      got.forEach(function (h) { var rc = Math.ceil(h[2] / g), ci = Math.floor((h[0] - sh.x0) / g), cj = Math.floor((h[1] - sh.y0) / g); for (j = -rc; j <= rc; j++) for (i = -rc; i <= rc; i++) if (i * i + j * j <= rc * rc) { var u = ci + i, v = cj + j; if (u >= 0 && u < sh.nx && v >= 0 && v < sh.ny) o[v * sh.nx + u] = 0; } });
      sh.levels[l] = sh.rowsOf(o);
    });
    return got.length;
  }
  /**
   * 0.26.89 위험 층 찾기 — 아래층에 닿지 않고 떠 있는 조각 · 갑자기 넓어지는 층 · 가장 넓은 층
   * @param {Int32Array[]} layers 층마다 [시작 위치, 길이 …] (위치 차례대로)
   * @param {{ skip: number, min: number }} [o] skip = 뗏목처럼 넓어도 괜찮은 맨 아래 층 수 · min = 섬으로 칠 최소 화소
   * @return {{ islands: Array, jumps: number[], peak: number }}
   */
  function audit(layers, W, H, areas, o) {
    o = o || {}; var min = o.min || 4, skip = o.skip || 0, islands = [], jumps = [], peak = 0, L, a, b;
    for (L = 1; L < layers.length; L++) {
      var R = layers[L], P = layers[L - 1], n = R.length / 2, up = new Int32Array(n), lay = new Uint8Array(n), i, j = 0;
      for (i = 0; i < n; i++) up[i] = i;
      var find = function (v) { while (up[v] !== v) { up[v] = up[up[v]]; v = up[v]; } return v; };
      for (i = 0; i < n; i++) {   // 아래층과 닿는 줄
        var s0 = R[i * 2], e0 = s0 + R[i * 2 + 1]; while (j < P.length && P[j] + P[j + 1] <= s0) j += 2;
        lay[i] = j < P.length && P[j] < e0 ? 1 : 0;
      }
      for (i = 0, j = 0; i < n; i++) {   // 윗줄과 이어진 줄끼리 묶음 — 화면 위치는 줄을 넘지 않으므로 W 만큼 밀어 견줌
        var s1 = R[i * 2] - W, e1 = s1 + R[i * 2 + 1]; while (j < n && R[j * 2] + R[j * 2 + 1] <= s1) j++;
        for (b = j; b < n && R[b * 2] < e1; b++) { var x1 = find(i), x2 = find(b); if (x1 !== x2) up[x1] = x2; }
      }
      var box = {}; for (i = 0; i < n; i++) { var g = find(i), c = box[g] || (box[g] = { on: 0, px: 0, sx: 0, sy: 0 }), len = R[i * 2 + 1], row = Math.floor(R[i * 2] / W); c.on |= lay[i]; c.px += len; c.sx += (R[i * 2] - row * W + (len - 1) / 2) * len; c.sy += row * len; }
      for (i = 0; i < n; i++) { var g2 = find(i), c2 = box[g2]; if (c2.on) continue; var row2 = Math.floor(R[i * 2] / W), s2 = R[i * 2] - row2 * W, ux = c2.sx / c2.px, uy = c2.sy / c2.px, nx0 = Math.max(s2, Math.min(s2 + R[i * 2 + 1] - 1, ux)), dd2 = (nx0 - ux) * (nx0 - ux) + (row2 - uy) * (row2 - uy); var mid2 = s2 + (R[i * 2 + 1] - 1) / 2; (c2.alt || (c2.alt = [])).push([mid2, row2]); if (c2.bd == null || dd2 < c2.bd) { c2.bd = dd2; c2.ix = nx0; c2.iy = row2; } }   // 0.26.102 고리 모양이면 중심이 공중 — 조각 위의 가장 가까운 점
      for (a in box) { var q = box[a]; if (!q.on && q.px >= min && islands.length < 300) islands.push({ l: L, x: q.sx / q.px, y: q.sy / q.px, ix: q.ix, iy: q.iy, alt: [q.alt[0], q.alt[q.alt.length - 1], q.alt[q.alt.length >> 1]], px: q.px }); }
    }
    for (L = 0; L < areas.length; L++) {
      if (areas[L] > areas[peak]) peak = L;
      if (L > 0 && L >= skip && areas[L] - areas[L - 1] >= Math.max(50, areas[L - 1] * 0.25)) jumps.push(L);
    }
    return { islands: islands, jumps: jumps, peak: peak };
  }

  function slice(t, o, core, onProgress) {
    // 0.26.99 진행바에 단계 이름 — 떠 있는 곳이 있으면 처음 + 다시 만들기 최대 3번
    var again = o.fixPass ? '🔧 떠 있는 곳 서포트 추가 ' + o.fixPass + '/5' : '', say = function (p, st) { if (onProgress) onProgress(!(o.fixIslands && o.support) ? p : o.fixPass ? 0.7 + (o.fixPass - 1 + p) * 0.06 : p * 0.7, st); };   // 0.26.100 진행바 한 줄 — 처음 70% · 다시 만들기 6%씩
    var autoP = [];
    var P = o.printer, W = P.px[0], H = P.px[1], sx = W / P.mm[0], sy = H / P.mm[1], ly = o.layer, i, n = t.length / 9 | 0;
    var lift = o.support || o.raft ? Math.max(0, o.lift || 0) : 0, moved = new Float32Array(t.length), top = 0;
    for (i = 0; i < t.length; i += 3) { moved[i] = t[i]; moved[i + 1] = t[i + 1]; moved[i + 2] = t[i + 2] + lift; if (moved[i + 2] > top) top = moved[i + 2]; }
    var count = Math.ceil(top / ly - 1e-6), cols = null, limbs = [], links = [], heads = [], tip = o.tip || 0.4, body = o.body || 1, res = { w: W, h: H, layers: [], areas: new Float64Array(count), supports: 0, holes: [], tip: tip, wallCavity: 0 };
    if (top > P.z) throw new Error('높이가 프린터(' + P.z + ' mm)보다 커요.');
    var hollow = null, holes = [], holeD = o.hole || 3;
    if (o.hollow) {
      say(0, again || '🕳 속 비우는 중');
      hollow = hollowGrid(moved, top, o.wall || 2, o.lattice || 0);
      res.wallCavity = hollow.count * hollow.v * hollow.v * hollow.v / 1000;
      (o.solid || []).forEach(function (p) { hollowPillar(hollow, p[0], p[1], p[2]); });
      if (hollow.count) { holes = drainHoles(hollow, o.holes == null ? 2 : o.holes); res.holes = holes.map(function (p) { return [p[0], p[1], p[2]]; }); } else hollow = null;
    }
    if (o.support && core) {
      say(0, again || '🧩 서포트 만드는 중');
      var within = null;   // 0.26.45 가지의 줄기는 뗏목 안에만
      { var rs0 = raftShape(moved, [2]), rows0 = rs0.levels[0], on0 = function (x, y) { var ln = rows0[Math.floor((y - rs0.y0) / rs0.g)], c0 = (x - rs0.x0) / rs0.g; if (ln) for (var a = 0; a < ln.length; a += 2) if (c0 >= ln[a] && c0 < ln[a + 1]) return true; return false; }; within = function (x, y) { return on0(x, y) && on0(x - 1.2, y) && on0(x + 1.2, y) && on0(x, y - 1.2) && on0(x, y + 1.2); }; }
      var eb = o.ebase; if (eb) body = eb.body; autoP = ((eb && eb.auto) || []).concat(o.autoPins || []);   // 0.26.85 고친 뒤에는 처음 값 그대로 — 자리가 달라지면 고친 표시가 안 맞음
      var sup = core.supports(moved, { overhangAngle: (eb && eb.angle) || o.overhang || 45, spacing: (eb && eb.spacing) || o.spacing || 3, grams: eb ? eb.grams : 0, edit: (o.edits || []).map(function (e) { return { p: [e.p[0], e.p[1], e.p[2] + lift], gone: e.gone, tip: e.tip, body: e.body }; }), max: 8000 * ((o.more || 0) + 1), pinLen: 2, tip: tip, fit: o.fit !== false && !eb, tree: !!o.tree, plateOnly: !!o.plateOnly, within: within, extra: (o.pins || []).map(function (p) { return [p[0], p[1], p[2] + lift, 2]; }).concat(autoP), body: body, avoid: holes.length ? function (x, y) { return holes.some(function (h) { return Math.hypot(x - h[0], y - h[1]) < holeD / 2 + body; }); } : null });
      if (sup.body) body = sup.body; res.load = sup.load || null; cols = []; var gone = {}; for (i = 0; i < sup.count; i++) { var c = i * 5; if (!holes.some(function (h) { return Math.hypot(sup.cols[c] - h[0], sup.cols[c + 1] - h[1]) < holeD / 2 + body; })) { cols.push([sup.cols[c], sup.cols[c + 1], sup.cols[c + 2], sup.cols[c + 3], sup.cols[c + 4]]); if (sup.thick && sup.thick[i]) cols[cols.length - 1][5] = sup.thick[i]; } else gone[i] = 1; }
      var tipN = cols.length; limbs = sup.limbs || []; links = sup.links || []; heads = (sup.heads || []).filter(function (h) { return !gone[h[6]]; }); (sup.trunks || []).forEach(function (b) { cols.push([b[0], b[1], b[2], 0, 0, b[3], b[4] ? 1 : 0]); });   // 줄기는 끝이 없고 제 굵기 (c[5])
      res.supports = tipN + limbs.length; res.missed = sup.missed || 0; res.missedPin = sup.missedPin || 0; res.forcedModel = sup.forcedModel || 0; res.forcedCols = sup.forcedCols || 0; res.soloLeft = sup.soloLeft || 0; res.left = sup.left || []; res.cols = cols; res.limbs = limbs; res.links = links; res.heads = heads; res.body = body;
    }
    // 뗏목 — 0.26.18 모델 그림자 + 2mm (서포트는 그림자 안에 있음)
    var raft = null;
    if (o.raft) {
      var wd = o.raftWedge ? 3 : 0, pads = wd ? [2, 2 + wd * 0.25, 2 + wd * 0.5, 2 + wd * 0.75, 2 + wd] : [2], rh = o.raftH || 1;   // 0.26.29 판 쪽이 좁고 위가 넓음 — 판과 가장자리 사이 틈으로 스크레이퍼가 들어감
      var shape = raftShape(moved, pads), levels = [], runs = [], bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      if (o.raftHoles !== false && lift > rh) res.raftHoles = raftCarve(shape, cols);
      shape.levels.forEach(function (rows, lv) {
        var rs = [], z0 = lv * rh / pads.length, z1 = (lv + 1) * rh / pads.length;
        rows.forEach(function (ln, j) {
          var ya = shape.y0 + j * shape.g, yb = ya + shape.g, spans = [];
          for (var k = 0; k < ln.length; k += 2) {
            var xa = shape.x0 + ln[k] * shape.g, xb = shape.x0 + ln[k + 1] * shape.g; runs.push(xa, xb, ya, yb, z0, z1); spans.push(Math.max(0, Math.round(xa * sx + W / 2)), Math.min(W, Math.round(xb * sx + W / 2)));
            if (xa < bx0) bx0 = xa; if (xb > bx1) bx1 = xb; if (ya < by0) by0 = ya; if (yb > by1) by1 = yb;
          }
          rs.push(spans);
        });
        levels.push(rs);
      });
      raft = { h: rh, g: shape.g, y0: shape.y0, levels: levels };
      res.raftMm = [bx0, bx1, by0, by1, raft.h]; res.raftRuns = runs;
    }
    var order = []; for (i = 0; i < n; i++) order.push(i);
    var zmin = new Float32Array(n), zmax = new Float32Array(n);
    for (i = 0; i < n; i++) { var q = i * 9, a = moved[q + 2], b = moved[q + 5], d = moved[q + 8]; zmin[i] = Math.min(a, b, d); zmax[i] = Math.max(a, b, d); }
    order.sort(function (p, r) { return zmin[p] - zmin[r]; });
    var next = 0, active = [], cross = [], r0;
    for (r0 = 0; r0 < H; r0++) cross.push([]);
    var pxArea = (1 / sx) * (1 / sy);
    for (var L = 0; L < count; L++) {
      var z = (L + 0.5) * ly;
      while (next < n && zmin[order[next]] <= z) active.push(order[next++]);
      active = active.filter(function (id) { return zmax[id] >= z; });
      var map = rows(moved, active, z, W, H, sx, sy, cross), key;
      if (hollow) {
        var kz = Math.floor(z / hollow.v + 0.5);
        if (kz >= 0 && kz < hollow.nz) {
          var v = hollow.v, base = kz * hollow.ny * hollow.nx;
          for (key in map) {
            var y = (+key + 0.5 - H / 2) / sy, jy = Math.floor((y - hollow.y0) / v); if (jy < 0 || jy >= hollow.ny) continue;
            var line = [], on = false, st = 0;
            for (var ix = 0; ix <= hollow.nx; ix++) { var c1 = ix < hollow.nx && hollow.g[base + jy * hollow.nx + ix]; if (c1 && !on) { on = true; st = ix; } else if (!c1 && on) { on = false; line.push(Math.round((hollow.x0 + st * v) * sx + W / 2), Math.round((hollow.x0 + ix * v) * sx + W / 2)); } }
            if (line.length) { var cutA = cutOut(map[key], line); if (cutA.length) map[key] = cutA; else delete map[key]; }
          }
        }
      }
      // 빼낼 구멍 — 빈 곳 바닥까지 곧게 뚫음 (바깥 판 쪽부터)
      for (i = 0; i < holes.length; i++) if (z <= holes[i][2] + 0.5) {
        var hm = {}, cxh = holes[i][0] * sx + W / 2, cyh = holes[i][1] * sy + H / 2; addDisc(hm, cxh, cyh, holeD / 2 * sx, holeD / 2 * sy, W, H);
        for (key in hm) if (map[key]) { var ca = cutOut(map[key], hm[key]); if (ca.length) map[key] = ca; else delete map[key]; }
      }
      if (cols) for (i = 0; i < cols.length; i++) {
        var cl = cols[i], tz = cl[2], bz = cl[3], tap = cl[6] ? cl[5] * 0.4 : 0; if (z > tz + tap || z < bz) continue;
        var bd = cl[5] || body, fromTop = tz - z, fromBot = z - bz, rad = bd / 2;
        if (z > tz) rad = Math.max(0.1, bd / 2 * (1 - (z - tz) / tap));   // 0.26.80 줄기 끝은 뾰족하게
        else if (fromTop < 1 && !cl[5] && !heads.length) rad = tip / 2 + (bd - tip) / 2 * fromTop;   // 모델에 닿는 끝은 가늘게
        else if (cl[4] && fromBot < 1) rad = tip / 2 + (bd - tip) / 2 * fromBot;   // 모델 위에 선 기둥의 발도 가늘게
        else if (!cl[4] && fromBot < 1) rad = bd / 2 + (1 - fromBot) * 0.5;   // 판 쪽 발은 넓게
        addDisc(map, cl[0] * sx + W / 2, cl[1] * sy + H / 2, rad * sx, rad * sy, W, H);
      }
      for (i = 0; i < limbs.length; i++) {   // 0.26.16 나무 가지 — 끝에서 1.5 mm 곧게 · 그 아래는 줄기로 비스듬히
        var lb = limbs[i], bendZ = lb[2] - (lb[6] || 1.5); if (z > lb[2] || z < lb[5]) continue;
        var lw = z >= bendZ ? 0 : (bendZ - z) / (bendZ - lb[5]), lr = lb[2] - z < 1 && !heads.length ? tip / 2 + (body - tip) / 2 * (lb[2] - z) : (lb[7] || body) / 2;
        addDisc(map, (lb[0] + (lb[3] - lb[0]) * lw) * sx + W / 2, (lb[1] + (lb[4] - lb[1]) * lw) * sy + H / 2, lr * sx, lr * sy, W, H);
      }
      for (i = 0; i < heads.length; i++) {   // 0.26.52 핀 — 면에 직각 · 끝에서 마디까지 곧게 굵어짐 + 마디 공
        var hp = heads[i], hr = hp[7] || pinKnee(body), dz = z - hp[5], hw = (hp[2] - z) / (hp[2] - hp[5]), ht = hp[8] || tip;
        if (hw >= 0 && hw <= 1) { var pr = (ht + (pinNeck(ht, body) - ht) * hw) / 2; addDisc(map, (hp[0] + (hp[3] - hp[0]) * hw) * sx + W / 2, (hp[1] + (hp[4] - hp[1]) * hw) * sy + H / 2, pr * sx, pr * sy, W, H); }
        if (Math.abs(dz) < hr) { var br = Math.sqrt(hr * hr - dz * dz); addDisc(map, hp[3] * sx + W / 2, hp[4] * sy + H / 2, br * sx, br * sy, W, H); }
      }
      for (i = 0; i < links.length; i++) {   // 0.26.22 줄기끼리 잇는 토막
        var lk = links[i]; if (z > lk[2] || z < lk[5]) continue;
        var kw = lk[2] > lk[5] ? (lk[2] - z) / (lk[2] - lk[5]) : 0, kr = lk[6] / 2;
        addDisc(map, (lk[0] + (lk[3] - lk[0]) * kw) * sx + W / 2, (lk[1] + (lk[4] - lk[1]) * kw) * sy + H / 2, kr * sx, kr * sy, W, H);
      }
      if (raft && z <= raft.h) for (var ry = 0; ry < H; ry++) { var rl = raft.levels[Math.min(raft.levels.length - 1, Math.floor(z / raft.h * raft.levels.length))][Math.floor(((ry + 0.5 - H / 2) / sy - raft.y0) / raft.g)]; if (rl) for (var rk = 0; rk < rl.length; rk += 2) if (rl[rk + 1] > rl[rk]) addSpan(map, ry, rl[rk], rl[rk + 1], H); }
      // 파일 방향으로 — 위쪽(+Y) 이 그림 맨 위 · LCD 프린터는 좌우가 뒤집혀 맺힘
      var keys = Object.keys(map).map(Number).sort(function (p, r) { return r - p; }), buf = [], on2 = 0;
      for (i = 0; i < keys.length; i++) {
        var sp = map[keys[i]], row = H - 1 - keys[i], s0;
        if (o.mirror) for (s0 = sp.length - 2; s0 >= 0; s0 -= 2) { buf.push(row * W + (W - sp[s0 + 1]), sp[s0 + 1] - sp[s0]); on2 += sp[s0 + 1] - sp[s0]; }
        else for (s0 = 0; s0 < sp.length; s0 += 2) { buf.push(row * W + sp[s0], sp[s0 + 1] - sp[s0]); on2 += sp[s0 + 1] - sp[s0]; }
      }
      res.layers.push(Int32Array.from(buf)); res.areas[L] = on2 * pxArea;
      if (L % 8 === 0) say(L / count, again ? again + ' · 층 다시 만드는 중' : '🧱 층 그림 만드는 중');
    }
    res.lift = lift; res.count = count; res.top = top;
    res.volume = 0; res.maxArea = 0;
    for (i = 0; i < count; i++) { res.volume += res.areas[i] * ly; if (res.areas[i] > res.maxArea) res.maxArea = res.areas[i]; }
    say(1, '🔎 떠 있는 곳 살피는 중');
    res.audit = audit(res.layers, W, H, res.areas, { skip: raft ? Math.ceil(raft.h / ly) + 2 : 3 }); res.autoPins = autoP; res.solid = (o.solid || []).length;
    // 0.26.103 외부 · 내부(속 비운 안쪽)를 나눠 알림
    var inCav = function (a) { var ax0 = a.ix == null ? a.x : a.ix, ay0 = a.iy == null ? a.y : a.iy, mx = ((o.mirror ? W - ax0 - 1 : ax0) + 0.5 - W / 2) / sx, my = (H - 1 - ay0 + 0.5 - H / 2) / sy; return !!hollow && [0.15, 0.6, 1.2].some(function (dz) { return hollowAt(hollow, mx, my, a.l * ly - dz); }); };
    res.audit.islands.forEach(function (a) { a.inner = inCav(a); });
    // 0.26.91 「서포트 추가」를 눌렀을 때만 떠 있는 곳에 넣어 다시 만듦
    var pass = o.fixPass || 0;
    if (o.fixIslands && o.support && res.audit.islands.length && pass < 5) {
      var add = (o.autoPins || []).slice(), solid = (o.solid || []).slice();
      res.audit.islands.slice(0, 80).forEach(function (a) {
        (pass ? [[a.ix, a.iy]].concat(a.alt) : [[a.ix, a.iy]]).forEach(function (pt) {   // 0.26.104 다시 하면 조각의 다른 점도
        var ax0 = pt[0] == null ? a.x : pt[0], ay0 = pt[1] == null ? a.y : pt[1], mx = ((o.mirror ? W - ax0 - 1 : ax0) + 0.5 - W / 2) / sx, my = (H - 1 - ay0 + 0.5 - H / 2) / sy, from = (a.l - 1) * ly, zb = (a.l + 1) * ly, f;
        if (a.inner) { solid.push([mx, my, a.l * ly]); return; }
        for (f = 0; f < n; f++) {   // 그 층에서 처음 나타나는 아랫면에 찍음
          var c9 = f * 9, ax = moved[c9], ay = moved[c9 + 1], bx = moved[c9 + 3], by = moved[c9 + 4], cx = moved[c9 + 6], cy = moved[c9 + 7], dn = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(dn) < 1e-9) continue;
          var l1 = ((by - cy) * (mx - cx) + (cx - bx) * (my - cy)) / dn, l2 = ((cy - ay) * (mx - cx) + (ax - cx) * (my - cy)) / dn, l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          var zh = l1 * moved[c9 + 2] + l2 * moved[c9 + 5] + l3 * moved[c9 + 8]; if (zh >= from && zh < zb) zb = zh;
        }
        add.push([mx, my, zb, 1]);
        });
      });
      var more = slice(t, Object.assign({}, o, { autoPins: add, solid: solid, fixPass: pass + 1 }), core, onProgress);
      if (more.audit.islands.length <= res.audit.islands.length) return more;
    }
    return res;
  }

  // ───────────────────────── 파일 쓰기 ─────────────────────────
  function Bytes(size, little) { var b = new ArrayBuffer(size); this.u = new Uint8Array(b); this.v = new DataView(b); this.p = 0; this.le = !!little; }
  Bytes.prototype = {
    u8: function (x) { this.v.setUint8(this.p, x); this.p += 1; return this; }, u16: function (x) { this.v.setUint16(this.p, x, this.le); this.p += 2; return this; }, u32: function (x) { this.v.setUint32(this.p, x >>> 0, this.le); this.p += 4; return this; }, f32: function (x) { this.v.setFloat32(this.p, x, this.le); this.p += 4; return this; },
    raw: function (a) { this.u.set(a, this.p); this.p += a.length; return this; },
    str: function (s, len) { for (var i = 0; i < len; i++) this.u[this.p + i] = i < s.length ? s.charCodeAt(i) & 255 : 0; this.p += len; return this; }
  };
  /** 까만 칸을 사이에 끼운 (색, 길이) 순서로 부름 */
  function eachRun(runs, total, fn) { var at = 0; for (var i = 0; i < runs.length; i += 2) { if (runs[i] > at) fn(0, runs[i] - at); fn(255, runs[i + 1]); at = runs[i] + runs[i + 1]; } if (at < total) fn(0, total - at); }
  function mergeRuns(runs) { var out = [], i; for (i = 0; i < runs.length; i += 2) { var e = out.length; if (e && out[e - 2] + out[e - 1] === runs[i]) out[e - 1] += runs[i + 1]; else out.push(runs[i], runs[i + 1]); } return out; }

  /** GOO 층 그림 — 55 + 조각들 + 체크섬 */
  function gooLayer(runs, total) {
    var out = [0x55];
    eachRun(mergeRuns(runs), total, function (c, n) {
      var extra = n <= 0xF ? 0 : n <= 0xFFF ? 1 : n <= 0xFFFFF ? 2 : 3, first = (n & 0xF) | (extra << 4) | (c ? 0xC0 : 0);
      out.push(first);
      if (extra >= 3) out.push((n >>> 20) & 255);
      if (extra >= 2) out.push((n >>> 12) & 255);
      if (extra >= 1) out.push((n >>> 4) & 255);
    });
    var sum = 0; for (var i = 1; i < out.length; i++) sum = (sum + out[i]) & 255;
    out.push(~sum & 255);
    return Uint8Array.from(out);
  }
  /** PW0 층 그림 — 2바이트 (색 4비트 · 길이 12비트) */
  function pw0Layer(runs, total) {
    var out = [];
    eachRun(mergeRuns(runs), total, function (c, n) {
      var nib = c ? 0xF : 0;
      while (n > 0) { var d = Math.min(n, 0xFFF), w = d | (nib << 12); out.push((w >> 8) & 255, w & 255); n -= d; }
    });
    return Uint8Array.from(out);
  }
  /** 작은 그림 (RGB565) — 층을 겹친 실루엣. be = 큰 쪽이 먼저 */
  function thumb(res, tw, th, be) {
    var out = new Uint8Array(tw * th * 2), stepL = Math.max(1, Math.floor(res.layers.length / 40)), hit = new Uint8Array(tw * th), i, L;
    for (L = 0; L < res.layers.length; L += stepL) {
      var runs = res.layers[L];
      for (i = 0; i < runs.length; i += 2) {
        var row = Math.floor(runs[i] / res.w), x0 = runs[i] - row * res.w, x1 = x0 + runs[i + 1], ty = Math.floor(row * th / res.h), a = Math.floor(x0 * tw / res.w), b = Math.max(a + 1, Math.ceil(x1 * tw / res.w));
        hit.fill(1, ty * tw + a, ty * tw + Math.min(tw, b));
      }
    }
    for (i = 0; i < hit.length; i++) { var c = hit[i] ? 0x7DFF : 0x2124; out[i * 2] = be ? c >> 8 : c & 255; out[i * 2 + 1] = be ? c & 255 : c >> 8; }
    return out;
  }
  /** .goo · .prz */
  function writeGoo(res, o, q) {
    var P = o.printer, total = res.w * res.h, parts = [], h = new Bytes(195477 + 4096), n = res.count, sec = Math.round(printSeconds(q, n)), lm = q.liftSpeed * 60, blm = q.bottomLiftSpeed * 60, rm = q.retractSpeed * 60;
    var when = new Date().toISOString().slice(0, 19).replace('T', ' '), magic = [0x07, 0, 0, 0, 0x44, 0x4C, 0x50, 0];
    h.str('V3.0', 4).raw(magic).str('3DS Print Check', 32).str('0.1.84', 24).str(when, 24).str(P.name, 32).str('DLP', 32).str(o.resinName || '3DS', 32);
    h.u16(1).u16(1).u16(0);
    h.raw(thumb(res, 116, 116, true)).u8(0x0D).u8(0x0A).raw(thumb(res, 290, 290, true)).u8(0x0D).u8(0x0A);
    h.u32(n).u16(res.w).u16(res.h).u8(0).u8(0).f32(P.mm[0]).f32(P.mm[1]).f32(P.z).f32(o.layer).f32(q.exposure);
    h.u8(1).f32(0).f32(0).f32(0).f32(q.lightOff).f32(0).f32(0).f32(q.lightOff);   // 1 = WaitTime 방식 · 굳히기 전 기다림
    h.f32(q.bottomExposure).u32(q.bottomLayers).f32(q.bottomLift).f32(blm).f32(q.lift).f32(lm).f32(q.bottomLift).f32(rm).f32(q.lift).f32(rm);
    h.f32(0).f32(lm).f32(0).f32(lm).f32(0).f32(rm).f32(0).f32(rm);
    h.u16(255).u16(255).u8(0).u32(sec).f32(res.volume / 1000).f32(res.volume / 1000 * (o.density || 1.1)).f32(0).str('$', 8);
    var addrAt = h.p; h.u32(0).u8(1).u16(0);
    h.v.setUint32(addrAt, h.p, false);
    parts.push(h.u.slice(0, h.p));
    for (var L = 0; L < n; L++) {
      var bottom = L < q.bottomLayers, rle = gooLayer(res.layers[L], total), d = new Bytes(70), exp = bottom ? q.bottomExposure : q.exposure, lh = bottom ? q.bottomLift : q.lift, lsp = bottom ? blm : lm;
      d.u16(0).f32(P.z).f32((L + 1) * o.layer).f32(exp).f32(0).f32(0).f32(0).f32(q.lightOff).f32(lh).f32(lsp).f32(0).f32(lsp).f32(lh).f32(rm).f32(0).f32(rm).u16(255).u8(0x0D).u8(0x0A).u32(rle.length);
      parts.push(d.u.slice(0, d.p), rle, Uint8Array.of(0x0D, 0x0A));
    }
    var f = new Bytes(11); f.u8(0).u8(0).u8(0).raw(magic); parts.push(f.u);
    return parts;
  }
  /** Anycubic 표 형식 v516 — 프린터별 확장자 · 작은 쪽이 먼저 */
  function writeAny(res, o, q) {
    var P = o.printer, total = res.w * res.h, n = res.count, sec = Math.round(printSeconds(q, n)), um = Math.max(P.mm[0] / res.w, P.mm[1] / res.h) * 1000, vol = res.volume / 1000, g = vol * (o.density || 1.1);
    var FM = 52, HDR = 16 + 84, PV_W = 224, PV_H = 168, PV = 28 + PV_W * PV_H * 2, CT = 4 + 4 + 16 + 4;
    var ldAddr = FM + HDR + PV + CT, imgFirst = ldAddr + 16 + 4 + 32 * n, EX = 16 + 56, MA = 156, img = imgFirst + EX + MA;
    function tb(b, name, len) { b.str(name, 12).u32(len); }
    var a = new Bytes(img + 16, true), L;
    a.str('ANYCUBIC', 12).u32(ANY_VER).u32(8).u32(FM).u32(0).u32(FM + HDR).u32(FM + HDR + PV).u32(ldAddr).u32(imgFirst).u32(imgFirst + EX).u32(img);
    tb(a, 'HEADER', 84);
    a.f32(um).f32(o.layer).f32(q.exposure).f32(q.lightOff).f32(q.bottomExposure).f32(q.bottomLayers).f32(q.lift).f32(q.liftSpeed).f32(q.retractSpeed).f32(vol).u32(1).u32(res.w).u32(res.h).f32(g).f32(0).str('$', 4).u32(0).u32(sec).u32(0).u32(0).u32(0);
    tb(a, 'PREVIEW', PV); a.u32(PV_W).str('x', 4).u32(PV_H).raw(thumb(res, PV_W, PV_H, false));
    a.u32(0).u32(16); for (L = 0; L < 16; L++) a.u8(255); a.u32(0);
    tb(a, 'LAYERDEF', 4 + 32 * n); a.u32(n);
    var parts = [], addr = img, idx = a.p, rles = [];
    for (L = 0; L < n; L++) {
      var rle = pw0Layer(res.layers[L], total), bottom = L < q.bottomLayers, on = 0; for (var i = 1; i < res.layers[L].length; i += 2) on += res.layers[L][i];
      a.p = idx + L * 32; a.u32(addr).u32(rle.length).f32(bottom ? q.bottomLift : q.lift).f32(bottom ? q.bottomLiftSpeed : q.liftSpeed).f32(bottom ? q.bottomExposure : q.exposure).f32(o.layer).u32(on).u32(0);
      rles.push(rle); addr += rle.length;
    }
    a.p = imgFirst;
    tb(a, 'EXTRA', 24); a.u32(2).f32(q.bottomLift).f32(q.bottomLiftSpeed).f32(q.retractSpeed).f32(0).f32(q.bottomLiftSpeed).f32(q.retractSpeed).u32(2).f32(q.lift).f32(q.liftSpeed).f32(q.retractSpeed).f32(0).f32(q.liftSpeed).f32(q.retractSpeed);
    tb(a, 'MACHINE', MA); a.str(P.name, 96).str('pw0Img', 16).u32(16).u32(1).f32(P.mm[0]).f32(P.mm[1]).f32(P.z).u32(ANY_MAX[P.ext] || 516).u32(6506241);
    parts.push(a.u.slice(0, img));
    return parts.concat(rles);
  }
  function write(res, o, q) { return o.printer.ext === 'goo' || o.printer.ext === 'prz' ? writeGoo(res, o, q) : writeAny(res, o, q); }

  // ───────────────────────── Web Worker ─────────────────────────
  function worker(self) {
    var last = null, opts = null;
    self.onmessage = function (e) {
      var m = e.data;
      try {
        if (m.do === 'slice') {
          if (m.core) self.importScripts(m.core);
          opts = m.o;
          last = slice(m.t, m.o, self.PCCore, function (p, st) { self.postMessage({ progress: p, stage: st }); });
          self.postMessage({ done: 1, r: { count: last.count, supports: last.supports, load: last.load, missed: last.missed, missedPin: last.missedPin, raftHoles: last.raftHoles, holes: last.holes, top: last.top, lift: last.lift, volume: last.volume, maxArea: last.maxArea, audit: last.audit, autoPins: last.autoPins, solid: last.solid, forcedModel: last.forcedModel, cavity: last.wallCavity, w: last.w, h: last.h, areas: last.areas, cols: last.cols || [], limbs: last.limbs || [], links: last.links || [], heads: last.heads || [], tip: last.tip, body: last.body || 1, raftMm: last.raftMm || null, raftRuns: last.raftRuns || null } });
        } else if (m.do === 'layer') {
          self.postMessage({ layer: m.i, runs: last.layers[m.i] });
        } else if (m.do === 'file') {
          var parts = write(last, Object.assign({}, opts, m.o), m.q), type = 'application/octet-stream';
          self.postMessage({ file: new Blob(parts, { type: type }) });
        }
      } catch (err) { self.postMessage({ err: String((err && err.message) || err) }); }
    };
  }

  // ───────────────────────── 화면 ─────────────────────────
  function ui(A) {
    var S = A.S, q = A.q, esc = A.esc, ic = A.ic, n1 = A.n1, U = { printer: null, resinKey: null, pick: null, layer: 0.05, lift: 5, support: true, tree: true, plateOnly: true, lat: false, latP: 8, spacing: 3, more: 0, tip: 0.4, body: 1.5, bodyIn: 0, autoTip: true, raft: true, raftH: 1, wedge: true, rhole: true, hollow: false, wall: 2, holes: 2, hole: 3, mirror: true, over: {}, w: null, done: null, at: 0 };
    var KEEP = ['lat', 'latP', 'support', 'tree', 'plateOnly', 'raft', 'wedge', 'rhole', 'raftH', 'autoTip', 'hollow', 'mirror', 'lift', 'spacing', 'more', 'tip', 'bodyIn', 'wall', 'hole', 'holes'];   // 0.26.24 설정은 이 브라우저에 기억
    try { var kept = JSON.parse(localStorage.getItem('prz-opts') || '{}'); KEEP.forEach(function (k) { if (k in kept) U[k] = kept[k]; }); if (!kept.tree2) U.tree = true; if (!kept.plate2) U.plateOnly = true; if (U.bodyIn > 0) U.body = U.bodyIn; } catch (e) {}
    function box() { return q('#pck-rslice'); }
    function resins() { return S.cfg.resins || []; }
    // 0.26.90 값 묶음 — 모델 종류마다 값을 한 번에. 내 묶음은 이 브라우저에 기억
    var SETS = [{ n: '🧸 세밀한 피규어', v: { layer: 0.03, autoTip: false, tip: 0.35, more: 1, tree: true, hollow: false } }, { n: '🔩 튼튼한 부품', v: { layer: 0.05, autoTip: false, tip: 0.5, bodyIn: 1.5, body: 1.5, more: 0, tree: false, hollow: false } }, { n: '💧 레진 절약', v: { layer: 0.05, autoTip: true, more: 0, tree: true, hollow: true, wall: 2, lat: true } }];
    function mySets() { try { return JSON.parse(localStorage.getItem('prz-sets') || '[]'); } catch (e) { return []; } }
    function setSets(l) { try { localStorage.setItem('prz-sets', JSON.stringify(l)); } catch (e) { A.toast('이 브라우저에는 저장할 수 없어요.', true); } }
    function row() { return resins().filter(function (r) { return r.key === U.resinKey; })[0] || null; }
    function fit() { var r = row(), name = U.printer ? U.printer.name : ''; return window.PCCore.resinProfile(r, name, U.layer); }
    function prof() { var f = fit(); return (U.pick != null ? f.list[U.pick] : null) || f.profile; }
    function num(id, label, val, unit, step) { return '<label class="pck-lb">' + label + (unit ? ' <small>' + unit + '</small>' : '') + '<input class="pck-in" type="number" min="0" step="' + (step || 'any') + '" data-rz="' + id + '" value="' + val + '"></label>'; }
    /** 0.26.9 파일을 만드는 기종 + 카탈로그의 나머지 (3D · 계산만) */
    function plist() {
      if (U.list) return U.list;
      var has = {}, out = PRINTERS.slice(); PRINTERS.forEach(function (p) { has[norm(p.name)] = 1; });
      (S.cfg.rprinters || []).forEach(function (p) {
        if (has[norm(p.n)] || !(p.b[0] > 0 && p.b[1] > 0)) return; has[norm(p.n)] = 1;
        var st = Math.max(0.05, Math.max(p.b[0], p.b[1]) / 4096); out.push({ name: p.n, px: [Math.round(p.b[0] / st), Math.round(p.b[1] / st)], mm: [p.b[0], p.b[1]], z: p.b[2] || 300, ext: '' });
      });
      U.list = S.plist = out; return out;
    }
    function opts(list, file) { return list.map(function (x, i) { return !x.ext !== !file ? '' : '<option value="' + i + '"' + (x === U.printer ? ' selected' : '') + '>' + esc(x.name) + (x.ext ? ' (.' + x.ext + ')' : '') + '</option>'; }).join(''); }
    function panel() {
      var b = box(); if (!b) return; var plst = plist();
      if (!U.printer && S.printer) U.printer = findPrinter(S.printer.name || S.printer.model);
      if (!U.printer) U.printer = PRINTERS[0];
      var f = fit(), p = prof(), v = params(p, U.over), r = row(), src = U.over.exp > 0 ? '✏️ 직접 넣은 값' : p ? '🏭 카탈로그 공식 값' : '⚙️ 기본값 — 레진을 고르거나 직접 넣어 주세요';
      var hid = function (k) { return (U.ptab || 'print') === k ? '' : ' hidden'; }, tabs = '<div class="pck-rzs-pt">' + [['print', '🖨 프린터 · 레진', '노출 · 값 묶음 · LCD'], ['sup', '🧩 서포트', '래프트 · 간격 · 굵기'], ['hol', '🕳 속 비우기', '벽 · 구멍 · 격자']].map(function (t) { return '<button type="button" data-pt="' + t[0] + '" class="pck-rzs-tb' + ((U.ptab || 'print') === t[0] ? ' on' : '') + '"><b>' + t[1] + '</b><small>' + t[2] + '</small></button>'; }).join('') + '</div>';   // 0.26.94 칸이 길어져 분류별로 나눔
      b.innerHTML = '<h3>' + ic('drop') + ' 레진 슬라이스 <small class="pck-tag">🧪 베타</small></h3>' +
        (S.tris ? '' : '<p class="pck-hint">' + (S.solo ? '먼저 왼쪽에 모델을 올려 주세요.' : '먼저 왼쪽에 모델을 올려 주세요. 방향은 「검사」 탭의 방향 고르기를 따라요.') + '</p>') +
        tabs + '<div data-pn="print"' + hid('print') + '><label class="pck-lb">프린터</label><select class="pck-in" id="prz-printer"><optgroup label="파일 받기 됨">' + opts(plst, true) + '</optgroup><optgroup label="서포트 포함 STL 받기">' + opts(plst, false) + '</optgroup>' + '</select>' +
        (U.printer ? '<small class="pck-hint" id="prz-plate-size">📐 판 ' + U.printer.mm[0] + ' × ' + U.printer.mm[1] + ' mm · 높이 ' + U.printer.z + ' mm · ' + U.printer.px[0] + ' × ' + U.printer.px[1] + ' px</small>' : '') +
        '<small class="pck-hint">「서포트 포함 STL 받기」 기종은 전용 파일 대신 STL 로 받아 공식 슬라이서에서 열어요.</small>' +
        '<label class="pck-lb">레진</label><select class="pck-in" id="prz-resin"><option value="">직접 넣기</option>' + resins().map(function (x) { return '<option value="' + esc(x.key) + '"' + (x.key === U.resinKey ? ' selected' : '') + '>' + esc(x.b + ' ' + x.n) + '</option>'; }).join('') + '</select>' +
        (r && f.list.length && (!f.profile || f.list.length > 1) ? '<label class="pck-lb">프로필</label><select class="pck-in" id="prz-pick"><option value="">고르기</option>' + f.list.map(function (x, i) { return '<option value="' + i + '"' + (i === U.pick ? ' selected' : '') + '>' + esc(x.printer + ' · ' + x.layer_mm + ' mm · ' + (x.exp_txt || x.exposure_s) + '초' + (x.film ? ' · ' + x.film : '')) + '</option>'; }).join('') + '</select>' : '') +
        '<div class="pck-rz-grid">' + num('layer', '층 높이', U.layer, 'mm', '0.01') + num('exp', '노출', v.exposure, '초') + num('bot', '바닥 노출', v.bottomExposure, '초') + num('bl', '바닥 층', v.bottomLayers, '층', '1') + num('lift', '리프트', v.lift, 'mm') + num('ls', '리프트 속도', v.liftSpeed, 'mm/s') + num('blift', '바닥 리프트', v.bottomLift, 'mm') + num('bls', '바닥 리프트 속도', v.bottomLiftSpeed, 'mm/s') + '</div><small class="pck-hint">' + src + '</small>' +
        '<h4>값 묶음</h4><div class="pck-rzs-tr"><select class="pck-in" id="prz-set" aria-label="값 묶음"><option value="">고르기</option>' + SETS.concat(mySets()).map(function (x, i) { return '<option value="' + i + '">' + esc(x.n) + '</option>'; }).join('') + '</select><button type="button" class="pck-rzs-tb" id="prz-set-s">💾 저장</button><button type="button" class="pck-rzs-tb" id="prz-set-d">🗑</button></div>' +
        '<label class="pck-switch"><input type="checkbox" id="prz-mir"' + (U.mirror ? ' checked' : '') + '><i></i><span>LCD 좌우 뒤집기 (보통 켬)</span></label>' + '</div><div data-pn="sup"' + hid('sup') + '>' +
        '<label class="pck-switch"><input type="checkbox" id="prz-sup"' + (U.support ? ' checked' : '') + '><i></i><span>서포트 만들기</span></label>' +
        (U.support ? '<label class="pck-switch"><input type="checkbox" id="prz-tree"' + (U.tree ? ' checked' : '') + '><i></i><span>🌳 나무 가지 서포트 (레진 아낌)</span></label><label class="pck-switch"><input type="checkbox" id="prz-plate"' + (U.plateOnly ? ' checked' : '') + '><i></i><span>판에서만 서포트 (모델 위에 안 세움)</span></label>' + (U.plateOnly ? '' : '<small class="pck-hint">⚠ 끄면 모델 표면에 서포트 자국이 남아 출력 품질이 나빠질 수 있어요.</small>') + '' + (U.plateOnly ? '<small class="pck-hint">⚠ 아래가 모델로 막힌 오버행은 받치지 않아요.</small>' : '') : '') +
        '<label class="pck-switch"><input type="checkbox" id="prz-raft"' + (U.raft ? ' checked' : '') + '><i></i><span>래프트 (뗏목 · 바닥 판)</span></label>' +
        (U.raft ? '<label class="pck-switch"><input type="checkbox" id="prz-wedge"' + (U.wedge ? ' checked' : '') + '><i></i><span>래프트 가장자리 경사 (스크레이퍼가 잘 들어감)</span></label><label class="pck-switch"><input type="checkbox" id="prz-rhole"' + (U.rhole ? ' checked' : '') + '><i></i><span>래프트 구멍 (판에서 잘 떨어짐)</span></label>' : '') +
        '<div class="pck-rz-grid">' + num('lf', '판에서 띄움', U.lift, 'mm') + num('sp', '서포트 간격', U.spacing, 'mm') + num('tip', '끝 굵기', U.tip, 'mm') + num('bd', '기둥 굵기', U.body, 'mm') + (U.raft ? num('rh', '래프트 두께', U.raftH, 'mm') : '') + '</div>' +
        '<div class="pck-rzs-more"><span>서포트 더 넣기</span>' + ['기본', '많이', '아주 많이'].map(function (t, i) { return '<button type="button" id="prz-more' + i + '" class="pck-rzs-tb' + (U.more === i ? ' on' : '') + '">' + t + '</button>'; }).join('') + '</div>' +
        '<label class="pck-switch"><input type="checkbox" id="prz-auto"' + (U.autoTip ? ' checked' : '') + '><i></i><span>끝 굵기 자동 (무게 · 높이 어림)</span></label>' +
        '</div><div data-pn="hol"' + hid('hol') + '><label class="pck-switch"><input type="checkbox" id="prz-hol"' + (U.hollow ? ' checked' : '') + '><i></i><span>속 비우기 · 빼낼 구멍 자동</span></label>' +
        (U.hollow ? '<div class="pck-rz-grid">' + num('wl', '벽 두께', U.wall, 'mm') + num('hd', '구멍 지름', U.hole, 'mm') + num('hn', '구멍 수', U.holes, '개', '1') + (U.lat ? num('lp', '격자 간격', U.latP, 'mm') : '') + '</div><label class="pck-switch"><input type="checkbox" id="prz-lat"' + (U.lat ? ' checked' : '') + '><i></i><span>🕸 속 격자 (벽을 안에서 받침)</span></label><small class="pck-hint">⚠ 속 안쪽 천장에는 서포트가 없어요. 넓은 천장은 방향을 바꿔 주세요.</small>' : '') +
        '</div>' +
        '<button type="button" class="pck-btn pck-btn--pri" id="prz-go"' + (S.tris && !U.done ? '' : ' disabled') + '>' + ic('slice') + ' 슬라이스</button><button type="button" class="pck-btn" id="prz-goall" style="display:none">' + ic('slice') + ' 모든 플레이트 슬라이스</button><div id="prz-all"></div><div id="prz-out"></div>';
      bind();
      if (U.done) result();
    }
    function bind() {
      try { var keep = {}; KEEP.forEach(function (k) { keep[k] = U[k]; }); keep.tree2 = 1; keep.plate2 = 1; localStorage.setItem('prz-opts', JSON.stringify(keep)); } catch (e) {}
      A.qa('[data-pt]', box()).forEach(function (t) { t.onclick = function () { U.ptab = t.getAttribute('data-pt'); A.qa('[data-pt]', box()).forEach(function (x) { x.classList.toggle('on', x === t); }); A.qa('[data-pn]', box()).forEach(function (x) { x.hidden = x.getAttribute('data-pn') !== U.ptab; }); }; });
      q('#prz-printer').onchange = function () { U.printer = plist()[+this.value]; U.pick = null; clear(); panel(); };
      q('#prz-resin').onchange = function () { U.resinKey = this.value || null; U.pick = null; U.over = {}; clear(); var r0 = row();
        if (r0 && !r0.profiles) { A.api('GET', '/resin?key=' + encodeURIComponent(r0.key)).then(function (j) { r0.profiles = (j.data && j.data.profiles) || []; var f = fit(); if (f.profile) U.layer = f.profile.layer_mm; else if (r0.profiles[0]) U.layer = r0.profiles[0].layer_mm; panel(); }).catch(function () { r0.profiles = []; panel(); }); }
        panel(); };
      q('#prz-set').onchange = function () { var x = SETS.concat(mySets())[+this.value]; if (this.value === '' || !x) return; Object.keys(x.v).forEach(function (k) { U[k] = x.v[k]; }); U.pick = null; clear(); panel(); A.toast(x.n + ' 값을 넣었어요.'); };
      q('#prz-set-s').onclick = function () { var nm = window.prompt('묶음 이름'); if (!nm) return; var v = {}; KEEP.forEach(function (k) { v[k] = U[k]; }); v.tip = U.tip; v.body = U.body; v.layer = U.layer; var l = mySets().filter(function (x) { return x.n !== nm; }); l.push({ n: nm.slice(0, 30), v: v }); setSets(l); panel(); A.toast('💾 저장했어요.'); };
      q('#prz-set-d').onclick = function () { var i = +q('#prz-set').value - SETS.length, l = mySets(); if (q('#prz-set').value === '' || i < 0) { A.toast('내가 저장한 묶음을 고르면 지울 수 있어요.', true); return; } l.splice(i, 1); setSets(l); panel(); };
      var pk = q('#prz-pick'); if (pk) pk.onchange = function () { U.pick = this.value === '' ? null : +this.value; U.over = {}; clear(); panel(); };
      A.qa('[data-rz]', box()).forEach(function (el) { el.onchange = function () {
        var k = el.getAttribute('data-rz'), v = +el.value;
        if (k === 'layer') { U.layer = Math.max(0.01, v); U.pick = null; } else if (k === 'lf') U.lift = v; else if (k === 'rh') U.raftH = Math.min(5, Math.max(0.3, v)); else if (k === 'sp') U.spacing = Math.max(1, v); else if (k === 'tip') { U.tip = v; U.autoTip = false; } else if (k === 'bd') { U.bodyIn = U.body = Math.max(0.3, v); U.autoTip = false; } else if (k === 'lp') U.latP = Math.max(3, v); else if (k === 'wl') U.wall = Math.max(0.8, v); else if (k === 'hd') U.hole = Math.max(1, v); else if (k === 'hn') U.holes = Math.max(1, Math.min(2, Math.round(v))); else U.over[k] = v;
        clear(); panel(); }; });
      [0, 1, 2].forEach(function (i) { var b = q('#prz-more' + i); if (b) b.onclick = function () { U.more = i; clear(); panel(); }; });   // 0.26.30 간격을 좁히고 덜 기운 면까지 받침
      [['#prz-sup', 'support'], ['#prz-tree', 'tree'], ['#prz-plate', 'plateOnly'], ['#prz-wedge', 'wedge'], ['#prz-rhole', 'rhole'], ['#prz-raft', 'raft'], ['#prz-auto', 'autoTip'], ['#prz-hol', 'hollow'], ['#prz-lat', 'lat'], ['#prz-mir', 'mirror']].forEach(function (x) { var b = q(x[0]); if (b) b.onchange = function () { U[x[1]] = this.checked; clear(); panel(); }; });
      q('#prz-go').onclick = go; q('#prz-goall').onclick = goAll;
    }
    function checkOn(v) { ['[data-act=check]', '#prz-pinv'].forEach(function (k) { var b = q(k); if (b) b.disabled = !v; }); }   // 0.26.95 검사 · 서포트 숨기기는 슬라이스 뒤에만
    function goOn(v) { var g = q('#prz-go'); if (g) g.disabled = !v; }   // 0.26.101 슬라이스가 끝나면 끄고 무엇이든 바뀌면 다시 켬
    function clear() { U.lo = 0; checkOn(false); goOn(!!S.tris); U.done = null; if (U.w && !allHas(U.w)) U.w.terminate(); U.w = null; if (S.view) S.view.back(); }
    function setup() {
      var r = row(), o = { printer: U.printer, layer: U.layer, lift: U.lift, support: U.support, tree: U.tree, plateOnly: U.plateOnly, lattice: U.lat ? U.latP : 0, fixIslands: !(S.edits && S.edits.list.length), spacing: Math.max(0.9, U.spacing / [2, 2.8, 4][U.more]), pins: A.pins ? A.pins() : [], edits: A.edits ? A.edits() : null, ebase: S.edits && S.edits.list.length ? S.edits.base : null, tip: U.tip, body: 1, raft: U.raft, raftWedge: U.wedge, raftHoles: U.rhole, raftH: U.raftH, hollow: U.hollow, wall: U.wall, holes: U.holes, hole: U.hole, mirror: U.mirror, overhang: (S.cfg.settings.overhang_angle || 45) + U.more * 10, more: U.more, density: r && r.density ? +r.density : 1.1, resinName: r ? (r.b + ' ' + r.n).slice(0, 31) : 'Custom' };
      if (U.autoTip && U.support) { var s = S.opt.scale, dm = S.rd || S.orient.dims, area = (dm[0] * dm[1] * s * s) * 0.6, g = S.a.volume * s * s * s / 1000 * o.density; o.tip = U.tip = tipFor({ count: Math.max(8, area / (o.spacing * o.spacing) * 0.5), tensile: r && r.tensile, maxAreaMm2: area, grams: g }); }
      if (U.support) o.body = U.body = Math.max(o.tip, U.bodyIn > 0 ? U.bodyIn : 1.5);   // 0.26.119 기둥 기본 1.5 mm · 칸에 넣은 값이 우선
      return o;
    }
    function go() {
      var t = A.plateTris(); if (!t.length) { A.toast('판 위에 모델이 없어요 — 판 밖 모델을 판으로 끌어다 놓아 주세요.'); return false; } var i, o = setup(), tipIn = q('[data-rz=tip]'), bdIn = q('[data-rz=bd]'); if (tipIn) tipIn.value = U.tip; if (bdIn && U.body) bdIn.value = U.body;
      var mx = [0, 0]; for (i = 0; i < t.length; i += 3) { mx[0] = Math.max(mx[0], Math.abs(t[i])); mx[1] = Math.max(mx[1], Math.abs(t[i + 1])); }
      if (mx[0] * 2 > U.printer.mm[0] || mx[1] * 2 > U.printer.mm[1]) { A.toast('모델이 판 밖으로 나가요 — 크기 · 방향 · 자리를 바꿔 주세요.'); return false; }
      if (!U.onDone && U.all) { var cur9 = A.plCur() + 1; U.all = U.all.filter(function (x) { if (x.n !== cur9) return true; if (x.w !== U.w) x.w.terminate(); else U.dead = x.w; return false; }); }
      clear(); if (U.dead) { U.dead.terminate(); U.dead = null; } allList();
      var out = q('#prz-out'), w = U.w = new Worker(SELF || '/api/plugins/custom-slicer/assets/resin.js?v=' + A.V);
      out.innerHTML = '<div class="pck-prog pck-prog--st"><i id="prz-bar" style="width:0"></i><span id="prz-st">준비하는 중…</span></div>';
      w.onmessage = function (e) {
        var m = e.data;
        if (m.err) { U.onDone = null; out.innerHTML = '<div class="pck-empty bad">' + esc(m.err) + '</div>'; return; }
        if (m.progress != null) { var bar = q('#prz-bar'), bs = q('#prz-st'), pc = Math.round(m.progress * 100); if (bar) bar.style.width = pc + '%'; if (bs) bs.textContent = (m.stage || '') + ' · ' + pc + '%'; return; }
        if (m.done && U.onDone) { var fin = U.onDone; U.onDone = null; fin(m.r); return; }
        if (m.done) { U.aud = false; U.done = m.r; U.at = m.r.count - 1; result(); if (S.reEdit) { S.reEdit = 0; var pv = q('[data-v=prep]'), pt = q('[data-tool=pin]'); if (pv) pv.click(); if (pt && !pt.classList.contains('on')) pt.click(); var y = S.reY; scrollTo(0, y); requestAnimationFrame(function () { scrollTo(0, y); }); } return; }   // 0.26.5 3D 는 전체 모습부터
        if (m.runs) { draw(m.runs); return; }
        if (m.file) { save(m.file, w); }
      };
      w.onerror = function (e) { out.innerHTML = '<div class="pck-empty bad">슬라이스에 실패했어요: ' + esc(e.message || '') + '</div>'; };
      w.postMessage({ do: 'slice', t: t, o: o, core: location.origin + A.API + '/assets/print-check-core.js?v=' + A.V }, [t.buffer]);
    }
    /** 0.26.126 모든 플레이트 슬라이스 — 모델이 있는 판을 차례로 · 0.26.128 결과는 판마다 남겨 두고 판을 누르면 그 판 서포트 · 미리 보기 */
    function allHas(w) { return (U.all || []).some(function (x) { return x.w === w; }); }
    function allSig(i) { return A.plSig(i) + JSON.stringify([U.layer, U.lift, U.spacing, U.autoTip ? 0 : U.tip, U.bodyIn, U.more, U.support, U.tree, U.raft, U.raftH, U.hollow, U.wall, U.printer && U.printer.name]); }
    function goAll() {
      (U.all || []).forEach(function (x) { x.w.terminate(); }); U.all = []; U.allOn = false; U.w = null; allList(); var L = A.plFilled(), n = 0, v = quality();
      var next = function () {
        if (n >= L.length) { U.allOn = true; A.plGo(L[0]); allList(); restore(true); return; }
        A.plGo(L[n]); U.onDone = function (r) { U.all.push({ n: L[n] + 1, w: U.w, r: r, v: v, sig: allSig(L[n]), name: S.file && S.file.name }); U.w = null; n++; next(); };
        if (go() === false) { U.onDone = null; U.all.forEach(function (x) { x.w.terminate(); }); U.all = []; return; } var st = q('#prz-st'); if (st) st.textContent = '판 ' + (L[n] + 1) + ' · ' + (n + 1) + ' / ' + L.length;
      };
      next();
    }
    function allList() {
      var el = q('#prz-all'), ext = U.printer && U.printer.ext, on = U.allOn ? (U.all || []).filter(function (x) { return x.sig === allSig(x.n - 1); }) : [], key = on.map(function (x) { return x.n; }).join() + '/' + (A.plCur() + 1); if (!el || el.__k === key) return; el.__k = key; A.plSups(on.map(function (x) { return { i: x.n - 1, r: x.r }; }));
      el.innerHTML = on.length ? '<div class="pck-rz-stats"><b>판 ' + on.length + '개 슬라이스 완료</b><small>판을 누르면 그 판의 서포트 · 미리 보기가 보여요.</small></div>' + on.map(function (x) { return '<div class="pck-rz-stats"><b>판 ' + x.n + ' · ' + x.r.count.toLocaleString() + '층 · 약 ' + window.PCCore.duration(printSeconds(x.v, x.r.count)) + '</b><small>' + n1(x.r.volume / 1000) + ' ml · 서포트 ' + x.r.supports + '개</small></div>' + (ext ? '<div class="pck-rz-dl"><button type="button" class="pck-btn pck-btn--pri" data-allf="' + x.n + '">' + ic('upload') + ' 판 ' + x.n + ' .' + esc(ext) + ' 파일 받기</button></div>' : ''); }).join('') : '';
      Array.prototype.forEach.call(el.querySelectorAll('[data-allf]'), function (b) { b.onclick = function () { var n = +this.getAttribute('data-allf'); U.all.some(function (x) { if (x.n !== n) return false; x.w.postMessage({ do: 'file', o: {}, q: x.v }); return true; }); }; });
    }
    function restore(pre) {   // 0.26.132 결과만 되살리고 화면은 보던 그대로 — 준비에서 판을 눌러도 미리 보기로 튀지 않음
      if (!U.allOn || U.onDone) return; var i = A.plCur(), x = null; (U.all || []).forEach(function (a) { if (a.n === i + 1 && a.sig === allSig(i)) x = a; }); allList(); if (!x) return;
      if (U.w && !allHas(U.w)) U.w.terminate(); U.w = x.w; U.aud = false; U.done = x.r; U.lo = 0; U.at = x.r.count - 1; U.quiet = !pre; result(); U.quiet = false;
    }
    function quality() { return params(prof(), U.over); }
    function result() {
      checkOn(true); goOn(false);
      if (S.view) S.view.empty();
      var d = U.done, out = q('#prz-out'), v = quality(), r = row(), den = r && r.density ? +r.density : 1.1, ml = d.volume / 1000, warn = [];
      if (U.hollow && !d.holes.length) warn.push('벽이 두꺼워 비울 곳이 없어요.');
      if (U.support && !d.supports) warn.push('서포트가 필요한 곳을 찾지 못했어요. 바닥이 판에 붙어 있는지 확인해 주세요.');
      out.innerHTML = '<div class="pck-rz-stats"><b>' + d.count.toLocaleString() + '층 · 약 ' + window.PCCore.duration(printSeconds(v, d.count)) + '</b><small>' + n1(ml) + ' ml · ' + n1(ml * den) + ' g · 서포트 ' + d.supports + '개' + (d.load && d.load.weak ? ' · ⚠ 모델이 커서 받침이 빠듯해요 — 속 비우기나 눕히기를 권해요' : '') + (d.raftHoles ? ' · 래프트 구멍 ' + d.raftHoles + '개' : '') + (d.holes.length ? ' · 구멍 ' + d.holes.length + '개' : '') + (d.cavity ? ' · 빈 곳 ' + n1(d.cavity) + ' ml' : '') + (U.support ? ' · 끝 ' + U.tip + ' mm' : '') + '</small></div>' +
        riskBar(d) + warn.map(function (x) { return '<p class="pck-hint">⚠ ' + esc(x) + '</p>'; }).join('') +
        '<canvas id="prz-cv" class="pck-rz-cv" width="480" height="270" aria-label="층 그림"></canvas><div class="pck-lb">층 <span id="prz-ln"></span><div class="pck-dual"><input type="range" id="prz-lo" aria-label="아래 층" title="아래를 잘라 내기" min="0" max="' + (d.count - 1) + '" value="' + (U.lo || 0) + '"><input type="range" id="prz-l" aria-label="위 층" title="위를 잘라 내기" min="0" max="' + (d.count - 1) + '" value="' + U.at + '"></div></div>' +
        (U.printer.ext ? '' : '<p class="pck-hint">이 프린터 전용 파일은 아직 못 만들어요. 아래 STL 을 공식 슬라이서에서 열어 슬라이스해 주세요 (자동 서포트는 끄고).</p>') +
        '<div class="pck-rz-dl">' + (U.printer.ext ? '<button type="button" class="pck-btn pck-btn--pri" id="prz-file">' + ic('upload') + ' .' + esc(U.printer.ext) + ' 파일 받기</button>' : '') + '<button type="button" class="pck-btn' + (U.printer.ext ? '' : ' pck-btn--pri') + '" id="prz-stl">' + ic('upload') + ' 서포트 포함 .stl 받기</button></div>' +
        (U.printer.ext ? '<small class="pck-hint pck-rz-dln">🧪 실제 프린터 시험 전이에요. 첫 출력은 작은 모델로 확인해 주세요.</small>' : '') + (U.hollow ? '<small class="pck-hint pck-rz-dln">⚠ STL 에는 속 비우기 · 구멍이 들어가지 않아요.</small>' : '');
      q('#prz-l').oninput = function () { U.at = Math.max(+this.value, U.lo || 0); this.value = U.at; ask(); if (S.view) S.view.clip((U.at + 1) * U.layer); };
      q('#prz-lo').oninput = function () { U.lo = Math.min(+this.value, U.at); this.value = U.lo; ask(); if (S.view) S.view.low(); };
      
      [['#prz-rp', -1], ['#prz-rn', 1]].forEach(function (a) { var b = q(a[0]); if (b) b.onclick = function () { riskGo(a[1]); }; });
      if (q('#prz-file')) q('#prz-file').onclick = function () { this.disabled = true; U.w.postMessage({ do: 'file', o: {}, q: v }); };
      if (q('#prz-stl')) q('#prz-stl').onclick = stlSave;
      ask(); if (S.view) S.view.done(d, (U.at + 1) * U.layer);
    }
    /** 0.26.89 위험 층 — 떠 있는 조각 · 갑자기 넓어지는 층 사이를 오감 */
    function riskList(d) { var a = d.audit, m = {}; if (!a) return []; a.islands.forEach(function (i) { m[i.l] = 1; }); a.jumps.forEach(function (l) { m[l] = 1; }); return Object.keys(m).map(Number).sort(function (x, y) { return x - y; }); }
    function riskBar(d) {
      var a = d.audit; if (!a) return ''; var n = riskList(d).length;
      if (!U.aud) return '';
      return '<div class="pck-rz-risk' + (a.islands.length ? ' bad' : '') + '"><span>' + (a.islands.length ? '🔴 떠 있는 곳 ' + (d.cavity ? '외부 ' + a.islands.filter(function (i) { return !i.inner; }).length + '곳 · 내부 ' + a.islands.filter(function (i) { return i.inner; }).length + '곳' : a.islands.length + '곳') : '✅ 떠 있는 곳 없음' + (d.cavity ? ' (외부 · 내부 모두)' : '')) + (d.missed ? ' · ⚠ 판에서 닿지 못한 곳 ' + d.missed + '곳' + (d.missedPin ? ' (📍 찍은 곳 ' + d.missedPin + ')' : '') : '') + (d.autoPins && d.autoPins.length ? ' · 🔧 외부 서포트 ' + d.autoPins.length + '개 추가함' : '') + (d.solid ? ' · 🧱 내부 기둥 ' + d.solid + '개 추가함' : '') + (d.forcedModel ? ' · ⚠ 판까지 길이 없어 모델 위에 세움 ' + d.forcedModel + '개' : '') + (a.jumps.length ? ' · 🟠 갑자기 넓어지는 층 ' + a.jumps.length + '곳' : '') + ' · 가장 넓은 층 ' + (a.peak + 1) + '</span>' + (n ? '<button type="button" class="pck-rzs-tb" id="prz-rp" aria-label="이전 위험 층">◀</button><button type="button" class="pck-rzs-tb" id="prz-rn" aria-label="다음 위험 층">▶</button>' : '') + '</div>';
    }
    function riskGo(dir) {
      var r = riskList(U.done), i, to = -1, l = q('#prz-l'); if (dir > 0) { for (i = 0; i < r.length; i++) if (r[i] > U.at) { to = r[i]; break; } if (to < 0) to = r[0]; } else { for (i = r.length - 1; i >= 0; i--) if (r[i] < U.at) { to = r[i]; break; } if (to < 0) to = r[r.length - 1]; }
      U.at = to; if (l) l.value = to; ask(); if (S.view) S.view.clip((U.at + 1) * U.layer);
    }
    function ask() { var el = q('#prz-ln'); if (el) el.textContent = (U.lo ? (U.lo + 1) + ' ~ ' : '') + (U.at + 1) + ' / ' + U.done.count + ' · ' + n1((U.at + 1) * U.layer) + ' mm · ' + n1(U.done.areas[U.at] / 100) + ' cm²'; U.w.postMessage({ do: 'layer', i: U.at }); }
    function draw(runs) {
      if (S.view) S.view.layer(runs, U.done, U.mirror, U.printer);
      var cv = q('#prz-cv'); if (!cv) return; var d = U.done, x = cv.getContext('2d'), W = d.w, H = d.h, k = Math.min(cv.width / W, cv.height / H), ox = (cv.width - W * k) / 2, oy = (cv.height - H * k) / 2;
      x.fillStyle = '#0b1020'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#1e293b'; x.fillRect(ox, oy, W * k, H * k); x.fillStyle = '#7dd3fc';
      for (var i = 0; i < runs.length; i += 2) { var row = Math.floor(runs[i] / W), c = runs[i] - row * W; x.fillRect(ox + c * k, oy + row * k, Math.max(0.5, runs[i + 1] * k), Math.max(0.6, k)); }
      if (d.audit && U.aud) { x.strokeStyle = '#ef4444'; x.lineWidth = 2; d.audit.islands.forEach(function (a) { if (a.l === U.at) { x.beginPath(); x.arc(ox + a.x * k, oy + a.y * k, Math.max(9, Math.sqrt(a.px) * k), 0, 6.3); x.stroke(); } }); }
    }
    /** 0.26.33 모델 + 서포트 + 래프트를 한 STL 로 — 슬라이스 때와 같은 자리 */
    function stlSave() {
      var d = U.done, t = A.plateTris(), lf = d.lift || 0, m = supportMesh(d), i;
      for (i = 2; i < t.length; i += 3) t[i] += lf;
      var blob = new Blob([stlOf([t, m.sup, m.raft])], { type: 'model/stl' }), name = String((S.file && S.file.name) || 'model').replace(/\.[^.]+$/, '') + '_supports.stl', a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000); A.toast(name + ' — ' + n1(blob.size / 1048576) + ' MB');
    }
    function saveName(w) {   // 0.26.132 모든 플레이트 결과는 그 판의 모델 이름 · 같은 이름이면 판 번호를 붙임
      var x = (U.all || []).filter(function (a) { return a.w === w; })[0], b = String((x ? x.name : S.file && S.file.name) || 'model').replace(/\.[^.]+$/, '');
      if (x && U.all.some(function (o) { return o !== x && o.name === x.name; })) b += '_판' + x.n; return b + '.' + U.printer.ext;
    }
    function save(blob, w) {
      var name = saveName(w), a = document.createElement('a'), b = q('#prz-file'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000); if (b) b.disabled = false; A.toast(name + ' — ' + n1(blob.size / 1048576) + ' MB');
    }
    return { goOn: goOn, restore: restore, quiet: function () { return !!U.quiet; }, idle: function () { U.done = null; U.lo = 0; checkOn(false); goOn(!!S.tris); var oo = q('#prz-out'); if (oo) oo.innerHTML = ''; allList(); }, panel: panel, check: function () { if (!U.done) return; U.aud = true; result(); }, aud: function () { return U.aud; }, printer: function () { return U.printer; }, mm: function () { return U.printer.mm; }, mirror: function () { return U.mirror; }, layer: function () { return U.layer; }, done: function () { return U.done; }, low: function () { return U.lo ? U.lo * U.layer : -1e9; }, again: function () { S.reEdit = 1; S.reY = scrollY; clear(); panel(); var g = q('#prz-go'); if (g) g.click(); }, reset: function () { clear(); panel(); }, redraw: function () { if (U.done && U.w) ask(); }, model: function () { var k = S.tris && [S.orient && S.orient.key, S.opt.scale, S.rot, S.pos].join(); if (S.tris === U.tris && k === U.key) return; U.tris = S.tris; U.key = k; clear(); panel(); allList(); } };
  }

  /** 0.26.4 작은 3D 뷰어 (WebGL) — 모델 · 서포트 · 뗏목 · 구멍 · LCD 판 · 돌리기 · 확대 · 층 높이로 자르기 */
  function viewer(cv) {
    var gl = cv.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true }); if (!gl) return null;
    function sh(t, src) { var x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); return x; }
    var P = gl.createProgram();
    gl.attachShader(P, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;uniform mat4 m;uniform mat4 mm;varying vec3 N;varying float Z;varying vec2 W;varying vec3 O;void main(){N=n;Z=p.z;W=p.xy;vec4 w=mm*vec4(p,1.);O=w.xyz;gl_Position=m*w;}'));
    gl.attachShader(P, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 N;varying float Z;varying vec2 W;varying vec3 O;uniform vec3 bd;uniform vec3 c;uniform vec3 L;uniform float clip;uniform float clo;uniform float un;uniform vec3 pl;uniform sampler2D tx;void main(){if(Z>clip||Z<clo)discard;if(un>.5){gl_FragColor=vec4(c,1.);return;}vec3 nn=normalize(N);if(pl.z>.5&&nn.z>.9&&Z>-.1){float mv=W.x/pl.x*.55+W.y/pl.y*.35+L.x*1.3-L.y*.9;gl_FragColor=vec4(texture2D(tx,vec2(.5+W.x/pl.x*.5,.5-W.y/pl.y*.5)).rgb+vec3(.05)*exp(-mv*mv*5.),1.);return;}float d=abs(dot(nn,L));float u=max(nn.z,0.);gl_FragColor=vec4(c*(.32+.48*d+.2*u)*(gl_FrontFacing?1.:.4),1.);if(bd.x>0.&&(abs(O.x)>bd.x||abs(O.y)>bd.y||O.z>bd.z))gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.,.13,.2),.8);}'));
    gl.linkProgram(P); gl.useProgram(P); gl.enable(gl.DEPTH_TEST);
    var ap = gl.getAttribLocation(P, 'p'), an = gl.getAttribLocation(P, 'n'), um = gl.getUniformLocation(P, 'm'), uc = gl.getUniformLocation(P, 'c'), uL = gl.getUniformLocation(P, 'L'), ucl = gl.getUniformLocation(P, 'clip'), uclo = gl.getUniformLocation(P, 'clo'), uun = gl.getUniformLocation(P, 'un'), upl = gl.getUniformLocation(P, 'pl'), ubd = gl.getUniformLocation(P, 'bd'), utx = gl.getUniformLocation(P, 'tx'), ptx = gl.createTexture(), umm = gl.getUniformLocation(P, 'mm'), ID4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), XF = ID4;
    gl.enableVertexAttribArray(ap); gl.enableVertexAttribArray(an);
    var Q = gl.createProgram();   // 0.26.6 자른 면
    gl.attachShader(Q, sh(gl.VERTEX_SHADER, 'attribute vec2 a;uniform mat4 m;uniform vec3 s;uniform float f;varying vec2 w;void main(){w=vec2(f>.5?1.-a.x:a.x,a.y);gl_Position=m*vec4((a.x-.5)*2.*s.x,(.5-a.y)*2.*s.y,s.z,1.);}'));
    gl.attachShader(Q, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 w;uniform sampler2D t;void main(){vec4 c=texture2D(t,w);if(c.a<.5)discard;gl_FragColor=vec4(.78,.93,1.,1.);}'));
    gl.linkProgram(Q);
    var qa0 = gl.getAttribLocation(Q, 'a'), qm = gl.getUniformLocation(Q, 'm'), qs = gl.getUniformLocation(Q, 's'), qf = gl.getUniformLocation(Q, 'f'), qb = gl.createBuffer(), qt = gl.createTexture(), sec = null;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    var B = {}, V = { yaw: -0.6, pitch: 0.55, dist: 300, t: [0, 0, 30], tHome: [0, 0, 30], home: 300, clip: 1e9, lo: -1e9 }, raf = 0, MVP = null, EYE = null, HK = null, CAM = null;
    function mul(a, b) { var o = new Float32Array(16), i, j; for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[i + 4] * b[j * 4 + 1] + a[i + 8] * b[j * 4 + 2] + a[i + 12] * b[j * 4 + 3]; return o; }
    function paint() {
      raf = 0; gl.useProgram(P);
      var r = window.devicePixelRatio || 1, w = Math.max(1, Math.round(cv.clientWidth * r)), h = Math.max(1, Math.round(cv.clientHeight * r));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var cp = Math.cos(V.pitch), d = [cp * Math.sin(V.yaw), -cp * Math.cos(V.yaw), Math.sin(V.pitch)], e = [V.t[0] + d[0] * V.dist, V.t[1] + d[1] * V.dist, V.t[2] + d[2] * V.dist];
      var f = [-d[0], -d[1], -d[2]], l = Math.hypot(f[1], f[0]) || 1, sd = [f[1] / l, -f[0] / l, 0], u = [sd[1] * f[2] - sd[2] * f[1], sd[2] * f[0] - sd[0] * f[2], sd[0] * f[1] - sd[1] * f[0]];
      var view = [sd[0], u[0], -f[0], 0, sd[1], u[1], -f[1], 0, sd[2], u[2], -f[2], 0, -(sd[0] * e[0] + sd[1] * e[1] + sd[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1];
      var near = V.dist / 50, far = V.dist * 6 + V.home * 6, t = 1 / Math.tan(0.31);   // 0.26.137 확대해도 뒤쪽이 잘리지 않게 먼 경계는 판 크기까지 봄
      if (h > (V.ref || 0)) V.ref = h; var sc = V.ref / h;   // 0.26.36 뷰가 위에서 줄어들어도 모델 크기 · 자리는 그대로
      var pr = [t * sc * h / w, 0, 0, 0, 0, t * sc, 0, 0, 0, sc - 1, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
      var mvp = MVP = mul(pr, view); EYE = d; CAM = { e: e, f: f, s: sd, u: u, k: 1 / (t * sc), a: w / h, y: 1 - sc }; gl.uniformMatrix4fv(um, false, mvp); gl.uniform3fv(uL, d);
      Object.keys(B).sort(function (p0, q0) { return (B[p0].top ? 1 : 0) - (B[q0].top ? 1 : 0); }).forEach(function (k) {
        var b = B[k]; if (b.off || (b.mx && V.solo) || ((k === 'plate' || k === 'plateb' || k === 'front') && e[2] < 0)) return;   // 0.26.17 판 아래에서 볼 때는 판이 가리지 않게
        gl.bindBuffer(gl.ARRAY_BUFFER, b.buf); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 24, 12);
        gl.uniformMatrix4fv(umm, false, b.mx || (k === 'model' ? XF : ID4)); if (b.top) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST); gl.uniform1f(uun, b.flat ? 1 : 0); gl.uniform1i(utx, 1); if (V.ph && (k === 'model' || k === 'sup' || k === 'raft')) gl.uniform3f(ubd, V.ph[0], V.ph[1], V.pz || 1e9); else gl.uniform3f(ubd, 0, 0, 0); gl.uniform3f(upl, V.ph ? V.ph[0] : 1, V.ph ? V.ph[1] : 1, k === 'plate' ? 1 : 0); gl.uniform3fv(uc, b.color); gl.uniform1f(ucl, b.noclip ? 1e9 : V.clip); gl.uniform1f(uclo, b.noclip ? -1e9 : V.lo); gl.drawArrays(b.lines ? gl.LINES : gl.TRIANGLES, 0, b.count);
        if ((k === 'plate' || k === 'plateb' || k === 'front') && V.others && !V.solo) V.others.forEach(function (o) { gl.uniformMatrix4fv(umm, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o[0], o[1], 0, 1])); gl.drawArrays(gl.TRIANGLES, 0, b.count); });   // 0.26.68 옆 판
      });
      gl.enable(gl.DEPTH_TEST);
      if (sec && V.clip < 1e8) {
        gl.useProgram(Q); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.vertexAttribPointer(qa0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(qa0);
        gl.uniformMatrix4fv(qm, false, mvp); gl.uniform3f(qs, sec.x, sec.y, V.clip); gl.uniform1f(qf, sec.mirror ? 1 : 0); gl.bindTexture(gl.TEXTURE_2D, qt); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    function draw() { if (!raf) raf = requestAnimationFrame(paint); }
    function section(cnv, x, y, mirror) { if (!cnv) { sec = null; draw(); return; } gl.bindTexture(gl.TEXTURE_2D, qt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); sec = { x: x, y: y, mirror: mirror }; draw(); }
    /** 삼각형 묶음 (x y z × 9개씩) → 면 법선을 붙여 올림 */
    function set(name, t, color, o) {
      var i, c = t.length / 9 | 0, a = new Float32Array(c * 18), ly = (o && o.z) || 0, smooth = o && o.smooth && c < 500000 ? new Map() : null;
      for (i = 0; i < c; i++) {
        var q = i * 9, ux = t[q + 3] - t[q], uy = t[q + 4] - t[q + 1], uz = t[q + 5] - t[q + 2], vx = t[q + 6] - t[q], vy = t[q + 7] - t[q + 1], vz = t[q + 8] - t[q + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1, k;
        nx /= nl; ny /= nl; nz /= nl;
        for (k = 0; k < 3; k++) { var w = i * 18 + k * 6; a[w] = t[q + k * 3]; a[w + 1] = t[q + k * 3 + 1]; a[w + 2] = t[q + k * 3 + 2] + ly; a[w + 3] = nx; a[w + 4] = ny; a[w + 5] = nz;
          if (smooth) { var key = Math.round(t[q + k * 3] * 200) + ',' + Math.round(t[q + k * 3 + 1] * 200) + ',' + Math.round(t[q + k * 3 + 2] * 200), sm = smooth.get(key); if (!sm) smooth.set(key, sm = [0, 0, 0]); sm[0] += nx * nl; sm[1] += ny * nl; sm[2] += nz * nl; } }
      }
      if (smooth) for (i = 0; i < a.length; i += 6) { var v0 = smooth.get(Math.round(a[i] * 200) + ',' + Math.round(a[i + 1] * 200) + ',' + Math.round((a[i + 2] - ly) * 200)); if (!v0) continue; var vl = Math.hypot(v0[0], v0[1], v0[2]) || 1, dx = v0[0] / vl, dy = v0[1] / vl, dz = v0[2] / vl; if (dx * a[i + 3] + dy * a[i + 4] + dz * a[i + 5] > 0.75) { a[i + 3] = dx; a[i + 4] = dy; a[i + 5] = dz; } }
      raw(name, a, color, o);
    }
    function raw(name, a, color, o) { var b = B[name] || (B[name] = { buf: gl.createBuffer() }); gl.bindBuffer(gl.ARRAY_BUFFER, b.buf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); b.count = a.length / 6; b.color = color; b.off = false; b.lines = !!(o && o.lines); b.noclip = !!(o && o.noclip); b.flat = !!(o && o.flat); b.top = !!(o && o.top); draw(); }
    var drag = null, hooked = false;
    /** 0.26.22 월드 점 → 화면 자리 (CSS 픽셀) */
    function project(p) { var m = MVP; if (!m) return null; var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w * 0.5 + 0.5) * cv.clientWidth, (0.5 - (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w * 0.5) * cv.clientHeight]; }
    /** 0.26.34 화면 자리에서 카메라로 가장 가까운 면 — T 는 (ox, oy, oz) 만큼 옮겨 그린 삼각형 · 답은 T 좌표 + 면 법선 z */
    function pick(x, y, T, ox, oy, oz) {
      var c = CAM; if (!c) return null; var nx = (x / cv.clientWidth * 2 - 1) * c.a * c.k, ny = (1 - y / cv.clientHeight * 2 - c.y) * c.k, dx = c.f[0] + c.s[0] * nx + c.u[0] * ny, dy = c.f[1] + c.s[1] * nx + c.u[1] * ny, dz = c.f[2] + c.s[2] * nx + c.u[2] * ny, px = c.e[0] - ox, py = c.e[1] - oy, pz = c.e[2] - oz, best = Infinity, hit = null, i;
      for (i = 0; i + 8 < T.length; i += 9) {
        var ax = T[i], ay = T[i + 1], az = T[i + 2], ux = T[i + 3] - ax, uy = T[i + 4] - ay, uz = T[i + 5] - az, vx = T[i + 6] - ax, vy = T[i + 7] - ay, vz = T[i + 8] - az;
        var hx = dy * vz - dz * vy, hy = dz * vx - dx * vz, hz = dx * vy - dy * vx, det = ux * hx + uy * hy + uz * hz; if (Math.abs(det) < 1e-12) continue;
        var sx = px - ax, sy = py - ay, sz = pz - az, a = (sx * hx + sy * hy + sz * hz) / det; if (a < 0 || a > 1) continue;
        var qx = sy * uz - sz * uy, qy = sz * ux - sx * uz, qz = sx * uy - sy * ux, b = (dx * qx + dy * qy + dz * qz) / det; if (b < 0 || a + b > 1) continue;
        var w = (vx * qx + vy * qy + vz * qz) / det; if (w <= 0 || w >= best) continue; var hitZ = c.e[2] + dz * w; if (hitZ > V.clip || hitZ < V.lo) continue;   // 0.26.105 잘린 곳은 지나감
        var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; best = w; hit = [px + dx * w, py + dy * w, pz + dz * w, cz / (Math.hypot(cx, cy, cz) || 1)];
      }
      return hit;
    }
    function at(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.onpointerdown = function (e) {
      if (e.button === 0 && !e.shiftKey && HK) { var p0 = at(e); if (HK.down(p0[0], p0[1])) { hooked = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} return; } }
      drag = [e.clientX, e.clientY, e.button]; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    };
    cv.onpointermove = function (e) {
      if (hooked) { var p1 = at(e); HK.move(p1[0], p1[1]); return; }
      if (!drag) return; var dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag[0] = e.clientX; drag[1] = e.clientY;
      if (drag[2] === 2 || e.shiftKey) { var k = V.dist / 900, c = Math.cos(V.yaw), s = Math.sin(V.yaw); V.t[0] -= (dx * c) * k; V.t[1] -= (dx * s) * k; V.t[2] += dy * k; }
      else {
        var dyw = -dx * 0.008, p2 = Math.max(-1.5, Math.min(1.5, V.pitch + dy * 0.008)), dp = p2 - V.pitch, cy = Math.cos(dyw), sy = Math.sin(dyw), tx = V.t[0] * cy - V.t[1] * sy, ty = V.t[0] * sy + V.t[1] * cy, tz = V.t[2];
        V.yaw += dyw; V.pitch = p2; var ax = -Math.cos(V.yaw), ay = -Math.sin(V.yaw), cd = Math.cos(dp), sd = Math.sin(dp), dt = ax * tx + ay * ty;   // 판 가운데(원점)를 축으로 돎
        V.t = [tx * cd + ay * tz * sd + ax * dt * (1 - cd), ty * cd - ax * tz * sd + ay * dt * (1 - cd), tz * cd + (ax * ty - ay * tx) * sd];
      }
      draw();
    };
    cv.onpointerup = cv.onpointercancel = function () { drag = null; if (hooked) { hooked = false; HK.up(); } };
    cv.oncontextmenu = function (e) { e.preventDefault(); };
    function zoom(k) { V.dist = Math.max(V.min || V.home * 0.05, Math.min(V.home * 6, V.dist * k)); draw(); }
    cv.addEventListener('wheel', function (e) { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    function fit() { V.yaw = -0.6; V.pitch = 0.55; V.dist = V.home; V.t = V.tHome.slice(); draw(); }
    cv.ondblclick = fit;
    try { new ResizeObserver(draw).observe(cv); } catch (e) {}
    function plateTex(cnv) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ptx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.activeTexture(gl.TEXTURE0); draw(); }
    return { plateTex: plateTex, set: set, raw: raw, draw: draw, V: V, fit: fit, zoom: zoom, project: project, eye: function () { return EYE; }, onTool: function (h) { HK = h; }, pick: pick, off: function (k, v) { if (B[k]) { B[k].off = !!v; draw(); } }, xform: function (m) { XF = m ? new Float32Array(m) : ID4; draw(); }, section: section, hide: function (n0, off) { if (B[n0]) { B[n0].off = off; draw(); } }, place: function (n0, mx) { if (B[n0]) { B[n0].mx = new Float32Array(mx); draw(); } }, drop: function (n0) { if (B[n0]) { gl.deleteBuffer(B[n0].buf); delete B[n0]; draw(); } } };
  }
  function boxTris(x0, x1, y0, y1, z0, z1) {
    function q(a, b, c, d) { return a.concat(b, c, a, c, d); }
    var A = [x0, y0, z0], Be = [x1, y0, z0], C = [x1, y1, z0], D = [x0, y1, z0], E = [x0, y0, z1], F = [x1, y0, z1], G = [x1, y1, z1], H = [x0, y1, z1];
    return q(A, D, C, Be).concat(q(E, F, G, H), q(A, Be, F, E), q(Be, C, G, F), q(C, D, H, G), q(D, A, E, H));
  }
  function cone(out, x, y, z0, r0, z1, r1, x1, y1) {   // 위쪽 중심 (x1, y1) 을 주면 비스듬히
    if (x1 === undefined) { x1 = x; y1 = y; }
    var N = 8, i; for (i = 0; i < N; i++) {
      var a = i / N * 6.2832, b = (i + 1) / N * 6.2832, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      out.push(x + ca * r0, y + sa * r0, z0, x + cb * r0, y + sb * r0, z0, x1 + cb * r1, y1 + sb * r1, z1, x + ca * r0, y + sa * r0, z0, x1 + cb * r1, y1 + sb * r1, z1, x1 + ca * r1, y1 + sa * r1, z1);
      out.push(x, y, z0, x + cb * r0, y + sb * r0, z0, x + ca * r0, y + sa * r0, z0, x1, y1, z1, x1 + ca * r1, y1 + sa * r1, z1, x1 + cb * r1, y1 + sb * r1, z1);   // 0.26.33 위아래를 막음 (STL 은 닫힌 모양)
    }
  }
  /** 0.26.56 FDM 슬라이서(custom-slicer plate.js)와 같은 판 그림 — 10mm 격자 · 50mm 굵은 줄 · 가장자리 눈금 · 제조사 글자 */
  var PLATE_BRANDS = [[/elegoo/i, 'ELEGOO', '#3b82f6'], [/anycubic/i, 'ANYCUBIC', '#38bdf8'], [/creality/i, 'CREALITY', '#14b8a6'], [/phrozen/i, 'PHROZEN', '#0ea5e9'], [/formlabs/i, 'FORMLABS', '#0ea5e9']];
  function plateShade(hex, pct) { var v = parseInt(hex.slice(1), 16), c = function (a) { return Math.max(0, Math.min(255, Math.round(a + 255 * pct / 100))); }; return 'rgb(' + c((v >> 16) & 255) + ',' + c((v >> 8) & 255) + ',' + c(v & 255) + ')'; }
  function plateCanvas(printer, W, D) {
    var base = '#1c1f24', ink = 'rgba(255,255,255,.16)', label = 'rgba(255,255,255,.18)', brand = String(printer || '').split(' ')[0].toUpperCase(), accent = '#0ea5e9', i, mm, s0;
    PLATE_BRANDS.forEach(function (b) { if (b[0].test(printer || '')) { brand = b[1]; accent = b[2]; } });
    var px = 1024 / Math.max(W, D), cw = Math.max(2, Math.round(W * px)), chh = Math.max(2, Math.round(D * px)), c = document.createElement('canvas'); c.width = cw; c.height = chh; var g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, cw, chh);
    grd.addColorStop(0, plateShade(base, 12)); grd.addColorStop(1, plateShade(base, -10)); g.fillStyle = grd; g.fillRect(0, 0, cw, chh);
    g.strokeStyle = ink;   // 0.26.67 격자는 눈금 숫자와 같이 왼쪽 아래 모서리부터 — 판 크기가 10의 배수가 아니면 가운데 기준 줄이 숫자와 어긋났음
    for (mm = 0; mm <= Math.max(W, D); mm += 10) { g.lineWidth = mm % 50 === 0 ? 2 : 1; g.globalAlpha = mm % 50 === 0 ? 1 : 0.55; var lx = mm * px, ly = chh - mm * px; if (lx <= cw) { g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx, chh); g.stroke(); } if (ly >= 0) { g.beginPath(); g.moveTo(0, ly); g.lineTo(cw, ly); g.stroke(); } }
    g.globalAlpha = 1; g.fillStyle = label; g.font = '600 ' + Math.max(10, Math.round(9 * px)) + 'px system-ui,sans-serif';
    for (mm = 0; mm <= W; mm += 10) { var tx = mm * px, big = mm % 50 === 0; g.fillRect(tx - 0.75, chh - (big ? 14 : 7), 1.5, big ? 14 : 7); if (big && mm > 0 && mm < W) g.fillText(String(mm), tx + 3, chh - 16); }
    for (mm = 0; mm <= D; mm += 10) { var ty = chh - mm * px, bg = mm % 50 === 0; g.fillRect(0, ty - 0.75, bg ? 14 : 7, 1.5); if (bg && mm > 0 && mm < D) g.fillText(String(mm), 16, ty + 4); }
    if (brand) { g.save(); g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '800 ' + Math.round(Math.min(cw / 12, 7.5 * px)) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.9; g.fillText(brand.split('').join(String.fromCharCode(8202)), cw / 2, chh - 16 - Math.max(10, Math.round(9 * px)) - Math.round(5 * px)); g.restore(); }
    g.save(); g.font = '600 ' + Math.round(Math.min(cw / 30, 4.5 * px)) + 'px system-ui,sans-serif'; g.textAlign = 'right'; g.fillText(Math.round(W) + '×' + Math.round(D) + ' mm', cw - 10, 22); g.restore();
    g.strokeStyle = accent; g.lineWidth = 2; g.globalAlpha = 0.7; g.beginPath(); g.arc(cw / 2, chh / 2, 6, 0, 6.3); g.stroke(); g.globalAlpha = 1;
    return c;
  }
  /** 둥근 네모 기둥 (둘레 + 위 · 아래 뚜껑) */
  function roundPrism(out, x, y, r, z0, z1) {
    var pts = [], i, k;
    [[-x + r, -y + r, 3.1416], [x - r, -y + r, 4.7124], [x - r, y - r, 0], [-x + r, y - r, 1.5708]].forEach(function (c) { for (k = 0; k <= 5; k++) { var a = c[2] + k / 5 * 1.5708; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } });
    for (i = 0; i < pts.length; i++) { var p = pts[i], q0 = pts[(i + 1) % pts.length]; out.push(p[0], p[1], z0, q0[0], q0[1], z0, q0[0], q0[1], z1, p[0], p[1], z0, q0[0], q0[1], z1, p[0], p[1], z1, 0, 0, z1, p[0], p[1], z1, q0[0], q0[1], z1, 0, 0, z0, q0[0], q0[1], z0, p[0], p[1], z0); }
  }
  /** 0.26.52 a → b 어느 방향이든 — 고리가 축에 직각인 토막 */
  function rod(out, a, ra, b, rb) {
    var wx = b[0] - a[0], wy = b[1] - a[1], wz = b[2] - a[2], l = Math.hypot(wx, wy, wz) || 1; wx /= l; wy /= l; wz /= l;
    var hx = Math.abs(wz) < 0.9 ? 0 : 1, hz = Math.abs(wz) < 0.9 ? 1 : 0, ux = -wy * hz, uy = wx * hz - wz * hx, uz = wy * hx, ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    var vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux, N = 8, i;
    var at = function (c, r, t) { var k = Math.cos(t) * r, q = Math.sin(t) * r; return [c[0] + ux * k + vx * q, c[1] + uy * k + vy * q, c[2] + uz * k + vz * q]; };
    for (i = 0; i < N; i++) {
      var t0 = i / N * 6.2832, t1 = (i + 1) / N * 6.2832, A = at(a, ra, t0), B = at(a, ra, t1), C = at(b, rb, t1), D = at(b, rb, t0);
      out.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
      out.push(a[0], a[1], a[2], B[0], B[1], B[2], A[0], A[1], A[2], b[0], b[1], b[2], D[0], D[1], D[2], C[0], C[1], C[2]);
    }
  }
  function pinNeck(tip, body) { return Math.max(tip, body * 0.85); }   // 핀 마디 쪽 지름 — 기둥보다 가늘게
  function pinKnee(body) { return body * 0.52; }   // 마디 공 반지름
  /** 0.26.33 슬라이스 결과의 서포트 · 래프트 삼각형 — 3D 와 STL 이 같이 씀 */
  function supportMesh(d) {
    var t = [], rt = [], tip = (d.tip || 0.4) / 2, rb = (d.body || 1) / 2, pinned = (d.heads || []).length > 0, ri, rj;
    (d.cols || []).forEach(function (c) { var x = c[0], y = c[1], tz = c[2], bz = c[3], h = tz - bz, fk = Math.min(1, h / 2), rc = c[5] ? c[5] / 2 : rb, bot = c[4] ? tip : rc + 0.5;
      cone(t, x, y, bz, bot, bz + fk, rc); cone(t, x, y, bz + fk, rc, tz - fk, rc); cone(t, x, y, tz - fk, rc, tz, c[5] || pinned ? rc : tip); if (c[6]) cone(t, x, y, tz, rc, tz + c[5] * 0.4, 0.05); });
    (d.limbs || []).forEach(function (l) { var B = l[6] || 1.5, B1 = Math.min(1, B * 2 / 3), lr = l[7] ? l[7] / 2 : rb; cone(t, l[0], l[1], l[2] - B1, lr, l[2], pinned ? lr : tip); cone(t, l[0], l[1], l[2] - B, lr, l[2] - B1, lr); cone(t, l[3], l[4], l[5], lr, l[2] - B, lr, l[0], l[1]); });
    (d.links || []).forEach(function (l) { cone(t, l[3], l[4], l[5], l[6] / 2, l[2], l[6] / 2, l[0], l[1]); });
    (d.heads || []).forEach(function (h) {   // 0.26.52 핀 + 마디 공
      var kr = h[7] || pinKnee(rb * 2), m = 0.7071 * kr, ht = h[8] ? h[8] / 2 : tip; rod(t, [h[3], h[4], h[5]], pinNeck(ht * 2, rb * 2) / 2, [h[0], h[1], h[2]], ht);
      for (var bi = 0; bi < 6; bi++) { var a0 = -Math.PI / 2 + bi * Math.PI / 6, a1 = a0 + Math.PI / 6; cone(t, h[3], h[4], h[5] + Math.sin(a0) * kr, Math.max(0.02, Math.cos(a0) * kr), h[5] + Math.sin(a1) * kr, Math.max(0.02, Math.cos(a1) * kr)); }   // 0.26.80 둥근 마디
    });
    if (d.raftMm) { var r = d.raftMm, rr = d.raftRuns || [r[0], r[1], r[2], r[3], 0, r[4]]; for (ri = 0; ri < rr.length; ri += 6) { var bt = boxTris(rr[ri], rr[ri + 1], rr[ri + 2], rr[ri + 3], rr[ri + 4], rr[ri + 5]); for (rj = 0; rj < bt.length; rj++) rt.push(bt[rj]); } }
    return { sup: t, raft: rt };
  }
  /** 삼각형 묶음들을 이진 STL 로 */
  function stlOf(parts) {
    var tot = 0, i, k, o = 84; parts.forEach(function (p) { tot += p.length / 9 | 0; });
    var b = new ArrayBuffer(84 + tot * 50), v = new DataView(b); v.setUint32(80, tot, true);
    parts.forEach(function (p) {
      for (i = 0; i + 8 < p.length; i += 9) {
        var ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], wx = p[i + 6] - p[i], wy = p[i + 7] - p[i + 1], wz = p[i + 8] - p[i + 2], nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
        v.setFloat32(o, nx / l, true); v.setFloat32(o + 4, ny / l, true); v.setFloat32(o + 8, nz / l, true); o += 12;
        for (k = 0; k < 9; k++) { v.setFloat32(o, p[i + k], true); o += 4; }
        o += 2;
      }
    });
    return b;
  }
  /** 0.26.3 · 0.26.4 🧪 레진 화면 — FDM 슬라이서와 같은 배치 (위 막대 · 왼쪽 3D · 오른쪽 설정) · 슬라이서 화면과 출력 검사기가 같이 씀 */
  function mount(el, opt) {
    opt = opt || {};
    var API = '/api/plugins/custom-print_check', V = '0.1.84', S = { root: el, solo: 1, cfg: null, opt: { scale: 1 }, tris: null, a: null, orient: null, file: null, printer: null }, RSL = null, G = null, pend = null, view3 = 'prep';
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function n1(v) { return (Math.round(v * 10) / 10).toLocaleString(); }
    function q(sel) { return el.querySelector(sel); }
    function qa(sel, b) { return Array.prototype.slice.call((b || el).querySelectorAll(sel)); }
    function ic(k) { return k === 'slice' ? '🔪' : k === 'upload' ? '📂' : '🧪'; }
    function toast(msg, bad) { try { if (window.G7Core && G7Core.toast) { G7Core.toast[bad ? 'error' : 'success'](msg); return; } } catch (e) {} var t = document.createElement('div'); t.className = 'pck-toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
    function token() {
      var t = '';
      try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || ''; } catch (e) {}
      if (!t) { try { t = localStorage.getItem('auth_token') || ''; } catch (e2) {} }
      return (!t || t === 'undefined' || t === 'null') ? '' : t;
    }
    function api(method, path) {
      var h = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = token(); if (t) h.Authorization = 'Bearer ' + t;
      return fetch(API + path, { method: method, credentials: 'same-origin', headers: h }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.success === false) throw new Error(d.message || '요청에 실패했어요.'); return d; }); });
    }
    function core() { return window.PCCore ? Promise.resolve(window.PCCore) : new Promise(function (ok, no) { var s = document.createElement('script'); s.src = API + '/assets/print-check-core.js?v=' + V; s.onload = function () { ok(window.PCCore); }; s.onerror = function () { no(new Error('계산 스크립트를 받지 못했어요.')); }; document.head.appendChild(s); }); }
    /** 판 위 모델 — lift 만큼 띄움 (서포트 · 뗏목이 있을 때) */
    function moveM() { var p = S.pos || [0, 0]; return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], 0, 1]; }
    function model3(lift) {
      S.ml = lift || 0; pinsDraw(); if (S.peers && S.peers.length) plDraw();
      if (!G || !S.tris) return;
      var mk = [S.orient.key, S.opt.scale, S.rot, lift || 0].join(); if (S.mt === S.tris && S.mk === mk) { G.xform(moveM()); return; }   // 0.26.23 자리만 바뀌면 다시 만들지 않음
      S.mt = S.tris; S.mk = mk;
      var t = turned(window.PCCore, S.tris, S.orient.key, S.rot), s = S.opt.scale, i; if (s !== 1) for (i = 0; i < t.length; i++) t[i] *= s;
      G.xform(moveM());
      G.set('model', t, [0.49, 0.83, 0.99], { z: lift || 0, smooth: true });
      var h = 0, mx = 0; for (i = 0; i < t.length; i += 3) { if (t[i + 2] > h) h = t[i + 2]; mx = Math.max(mx, Math.abs(t[i]), Math.abs(t[i + 1])); }
      var sel = q('#prz-printer'), pr = (sel && S.plist && S.plist[+sel.value]) || PRINTERS[0]; G.V.tHome = [0, 0, Math.min(h + (lift || 0), pr.z) / 3]; G.V.home = Math.max(pr.mm[0], pr.mm[1], h * 1.2) * 2.4; G.V.min = Math.max(Math.hypot(mx, mx, h / 2) * 0.25, 5); plHome(); if (S.fitFor !== S.tris) { S.fitFor = S.tris; G.fit(); }   // 0.26.22 새 모델일 때만 맞춤 (돌릴 때 시점 유지)
    }
    function plate() {
      if (!G) return; var sel = q('#prz-printer'), pr = (sel && S.plist && S.plist[+sel.value]) || PRINTERS[0], x = pr.mm[0] / 2, y = pr.mm[1] / 2, i;
      // 0.26.56 FDM 과 같은 판 — 윗면 그림 · 1.6mm 판 · 아래 8mm 받침 (둥근 모서리) + 앞쪽 FRONT 손잡이
      var top = [], body = [], word = [], tab = [], by = y + 3, tw = Math.min(44, x * 0.6), th = tw * 0.3, ti = th * 0.5, tp = [[-tw / 2, -by], [tw / 2, -by], [tw / 2 - ti, -by - th], [-tw / 2 + ti, -by - th]], u = th / 8, zt = -1.8, zb = -3.4;
      roundPrism(top, x, y, 5, -1.6, -0.05); roundPrism(body, x + 3, by, 7, -9.8, -1.8);
      tab.push(tp[0][0], tp[0][1], zt, tp[2][0], tp[2][1], zt, tp[1][0], tp[1][1], zt, tp[0][0], tp[0][1], zt, tp[3][0], tp[3][1], zt, tp[2][0], tp[2][1], zt, tp[0][0], tp[0][1], zb, tp[1][0], tp[1][1], zb, tp[2][0], tp[2][1], zb, tp[0][0], tp[0][1], zb, tp[2][0], tp[2][1], zb, tp[3][0], tp[3][1], zb);
      for (i = 0; i < 3; i++) { var g0 = tp[i], g1 = tp[i + 1]; tab.push(g0[0], g0[1], zb, g1[0], g1[1], zb, g1[0], g1[1], zt, g0[0], g0[1], zb, g1[0], g1[1], zt, g0[0], g0[1], zt); }
      [[[0, 0, 1, 5], [0, 4, 3, 5], [0, 2, 2.5, 3]], [[0, 0, 1, 5], [0, 4, 3, 5], [0, 2, 3, 3], [2, 3, 3, 4], [2, 0, 3, 2]], [[0, 0, 1, 5], [2, 0, 3, 5], [0, 4, 3, 5], [0, 0, 3, 1]], [[0, 0, 0.9, 5], [2.1, 0, 3, 5], [0.9, 5, 0.9, 3.5, 2.1, 0, 2.1, 1.5]], [[1, 0, 2, 5], [0, 4, 3, 5]]].forEach(function (L, li) { L.forEach(function (b) { var ox = (li * 4 - 9.5) * u, oy = -by - th * 0.5 - 2.5 * u; if (b.length === 8) { var P4 = [0, 2, 4, 6].map(function (e) { return [ox + b[e] * u, oy + b[e + 1] * u]; }), zw = zt + 0.03; word.push(P4[0][0], P4[0][1], zw, P4[1][0], P4[1][1], zw, P4[2][0], P4[2][1], zw, P4[0][0], P4[0][1], zw, P4[2][0], P4[2][1], zw, P4[3][0], P4[3][1], zw); return; } var x0 = ox + b[0] * u, x1 = ox + b[2] * u, y0 = oy + b[1] * u, y1 = oy + b[3] * u; word.push(x0, y0, zt + 0.03, x1, y0, zt + 0.03, x1, y1, zt + 0.03, x0, y0, zt + 0.03, x1, y1, zt + 0.03, x0, y1, zt + 0.03); }); });
      G.V.ph = [x, y]; G.V.pz = pr.z; G.plateTex(plateCanvas(pr.name, x * 2, y * 2)); G.set('plate', top, [0.09, 0.1, 0.12], { noclip: true }); G.set('plateb', body, [0.137, 0.149, 0.176], { noclip: true }); S.tabT = tab; S.tabPr = pr.name; S.tabOn = null; tabLook(); G.set('front', word, [0.86, 0.93, 1], { flat: true, noclip: true });
      if (!S.tris) { G.V.tHome = [0, 0, 0]; G.V.home = Math.max(pr.mm[0], pr.mm[1]) * 2.4; G.V.min = G.V.home * 0.05; plHome(); G.fit(); } else if (PL.list.length > 1 && S.phK && S.phK !== x + ',' + y) { plHome(); G.fit(); }
      S.phK = x + ',' + y; plDraw();   // 0.26.76 프린터를 바꾸면 옆 판 자리도
    }
    // 0.26.141 앞 손잡이 색 = 지금 이 슬라이서를 쓰는 중인지 (FDM 슬라이서의 앞 색 띠와 같게) — 누르거나 입력 중이면 판 색 · 아니면 붉은색
    function tabLook() {
      if (!G || !S.tabT) return; var a = document.activeElement, on = !!(S.act || (a && a !== document.body && S.root.contains(a))) && document.hasFocus();
      if (S.tabOn === on) return; S.tabOn = on; var hex = '#dc2626';
      if (on) { hex = '#0ea5e9'; PLATE_BRANDS.forEach(function (b) { if (b[0].test(S.tabPr || '')) hex = b[2]; }); }
      var n = parseInt(hex.slice(1), 16); G.set('ptab', S.tabT, [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255], { noclip: true }); G.draw();
    }
    function seg(v) {
      view3 = v; if (RSL && v === 'prep') RSL.goOn(!!S.tris); qa('[data-v]').forEach(function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      var ov = q('#prz-ov'); if (ov) ov.hidden = v !== 'pre';
      if (G) { G.V.solo = false; G.hide('sup', v !== 'pre'); G.hide('raft', v !== 'pre'); G.hide('hole', v !== 'pre'); G.hide('risk', v !== 'pre'); G.V.clip = v === 'pre' && G.V.at < G.V.top ? G.V.at : 1e9; cutApply(); G.draw(); }
      if (G && RSL && RSL.done()) model3(v === 'pre' ? RSL.done().lift : 0); if (G && PL.sup) plDraw();   // 0.26.132 준비에서는 모든 판이 같게 — 서포트는 미리 보기에서만
      var tn = q('[data-tool].on'); if (v === 'pre' && tn) tn.click();   // 0.26.76 미리 보기에는 이동 화살표 · 도구 칸을 남기지 않음
    }
    S.view = {
      empty: function () { var ov = q('#prz-ov'); if (ov) ov.innerHTML = ''; },
      back: function () { var b = q('[data-v=pre]'); if (b) b.disabled = true; if (RSL) RSL.idle(); if (G) { G.drop('sup'); G.drop('raft'); G.drop('hole'); G.section(null); G.V.at = 1e9; } this.empty(); seg('prep'); model3(0); plate(); },
      layer: function (runs, d, mirror, pr) {
        if (!G) return; var cn = S.secCv || (S.secCv = document.createElement('canvas')), W = d.w, H = d.h, k = Math.min(1, 2048 / Math.max(W, H)), i;
        cn.width = Math.max(2, Math.round(W * k)); cn.height = Math.max(2, Math.round(H * k)); var x = cn.getContext('2d'); x.clearRect(0, 0, cn.width, cn.height); x.fillStyle = '#fff';
        for (i = 0; i < runs.length; i += 2) { var row = Math.floor(runs[i] / W), c = runs[i] - row * W; x.fillRect(c * k, row * k, Math.max(1, runs[i + 1] * k), Math.max(1, k)); }
        G.section(cn, pr.mm[0] / 2, pr.mm[1] / 2, mirror);
      },
      low: function () { cutApply(); },
      clip: function (z) { if (G) { G.V.at = z; if (view3 === 'pre') { G.V.clip = z < G.V.top ? z : 1e9; G.draw(); } } },
      /** 슬라이스가 끝나면 — 층 그림 · 슬라이더를 3D 위로 옮기고 서포트 · 뗏목 · 구멍을 그림 */
      done: function (d, z) {
        var ov = q('#prz-ov'); if (ov) ov.innerHTML = '';   // 옛 층 그림이 남아 있으면 새 칸 대신 잡힘
        var cv = q('#prz-cv'), l = q('#prz-l');
        if (ov && cv && l) { lvBuild(ov, cv); ov.appendChild(l.closest('.pck-lb')); var rb = q('.pck-rz-risk'); if (rb) ov.appendChild(rb); }
        var b = q('[data-v=pre]'); if (b) b.disabled = false;
        if (G) {
          model3(d.lift);
          var sm = supportMesh(d);
          if (sm.sup.length) G.set('sup', sm.sup, [0.98, 0.47, 0.1]); else G.drop('sup');
          if (sm.raft.length) G.set('raft', sm.raft, [0.63, 0.55, 0.98]); else G.drop('raft');
          S.supShow = true; tool();   // 0.26.40 슬라이스 결과는 📍 도구에서도 보임
          var ht = []; (d.holes || []).forEach(function (p) { cone(ht, p[0], p[1], 0, 1.6, (p[2] || 1) + 0.5, 1.6); });
          if (ht.length) G.set('hole', ht, [0.96, 0.3, 0.45]); else G.drop('hole');
          var rk = [], mp = RSL.mm(), u3 = Math.max(0.6, Math.max(mp[0], mp[1]) * 0.006); ((d.audit && d.audit.islands) || []).forEach(function (a) { var px = (RSL.mirror() ? d.w - a.x : a.x) * mp[0] / d.w - mp[0] / 2, py = (d.h - a.y) * mp[1] / d.h - mp[1] / 2, pz = (a.l + 1) * RSL.layer(); cone(rk, px, py, pz - u3, 0.05, pz, u3); cone(rk, px, py, pz, u3, pz + u3, 0.05); });
          if (rk.length && RSL.aud()) G.set('risk', rk, [1, 0.15, 0.15], { flat: true, noclip: true }); else G.drop('risk');
          G.V.at = z; G.V.top = d.top;
        }
        seg(RSL.quiet() ? 'prep' : 'pre');
      }
    };
    var actions = {
      tilt: function () { if (!S.tris) return; var pr = (RSL.printer && RSL.printer()) || null, r = autoTilt(window.PCCore, S.tris, S.orient.key, pr ? { mm: pr.mm, z: pr.z } : null); S.rot = r.rot; turnNow(); toast(r.rot[0] || r.rot[1] ? '🧭 X ' + r.rot[0] + '° · Y ' + r.rot[1] + '° 로 기울였어요.' : '🧭 지금 방향이 가장 나아요.'); },
      fix: function () { if (!S.tris) return; var f0 = S.file, r = window.PCCore.repair(S.tris); if (r.changed) { var sc = S.opt.scale; use(f0, r.t, sc); } toast(r.changed ? '🔧 면 ' + r.removed + '개 뺌 · ' + r.flipped + '개 뒤집음 · 구멍 ' + r.holes + '곳 메움' + (r.left ? ' · 못 메운 곳 ' + r.left + '곳' : '') : '🔧 고칠 곳이 없어요.', !!r.left); },
      check: function () { if (S.tris) RSL.check(); }
    };
    function card() {
      var b = q('#prz-model'), s = S.opt.scale, d = S.orient && (S.rd || S.orient.dims), tl = q('#prz-tools'); if (tl) tl.hidden = !S.tris; if (!b) return;
      var dr = q('#prz-drop'); if (dr) dr.hidden = !!S.tris || PL.list.some(function (x) { return !!x; });
      b.innerHTML = !S.tris ? '' : '<p class="pck-rz-name"><b>' + esc(S.file.name) + '</b> · ' + n1(d[0] * s) + ' × ' + n1(d[1] * s) + ' × ' + n1(d[2] * s) + ' mm</p><div class="pck-rz-grid"><label class="pck-lb">방향<select class="pck-in" id="prz-orient">' +
        S.a.orients.map(function (o) { return '<option value="' + esc(o.key) + '"' + (o.key === S.orient.key ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select></label><label class="pck-lb">크기 %<input class="pck-in" type="number" min="1" step="1" id="prz-scale" value="' + Math.round(s * 100) + '"></label></div><div class="pck-rzs-tr"><button type="button" class="pck-rzs-tb" id="prz-fix">🔧 메시 수리</button>' + (S.a.open || S.a.nonManifold ? '<small class="pck-hint">⚠ 열린 모서리 ' + (S.a.open + S.a.nonManifold) + '곳</small>' : '') + '</div>';
      if (!S.tris) return;
      q('#prz-fix').onclick = actions.fix;
      q('#prz-orient').onchange = function () { var k = this.value; S.orient = S.a.orients.filter(function (o) { return o.key === k; })[0] || S.orient; turnNow(); };
      q('#prz-scale').onchange = function () { var v = +this.value; if (v > 0) { S.opt.scale = v / 100; card(); RSL.model(); tool(); } };
    }
    /** 0.26.22 3D 위 🔄 회전 링 · ✥ 이동 화살표 */
    function ringPt(g, a, ang, r) { var c = Math.cos(ang), s = Math.sin(ang), d = a === 0 ? [0, c, s] : a === 1 ? [s, 0, c] : [c, s, 0]; return [g.c[0] + d[0] * r, g.c[1] + d[1] * r, g.c[2] + d[2] * r]; }
    function giz() {
      if (!G) return; G.drop('gx'); G.drop('gy'); G.drop('gz'); S.gz = null;
      if (!S.tris || !S.orient || (S.tool !== 'rot' && S.tool !== 'move')) return;
      var dm = S.rd || S.orient.dims, s = S.opt.scale, h = dm[2] * s, r = Math.hypot(dm[0], dm[1], dm[2]) * s / 2 * 1.08, w = Math.max(0.5, r * 0.025), g = S.gz = { c: [S.pos[0], S.pos[1], h / 2], r: r, box: [dm[0] * s / 2, dm[1] * s / 2, h] }, names = ['gx', 'gy', 'gz'], cols = [[0.95, 0.3, 0.35], [0.35, 0.85, 0.45], [0.3, 0.55, 1]], a, k, N = 72, t;
      if (S.tool === 'rot') for (a = 0; a < 3; a++) {
        t = []; for (k = 0; k < N; k++) { var a0 = k / N * 6.2832, a1 = (k + 1) / N * 6.2832, p = ringPt(g, a, a0, r - w), q2 = ringPt(g, a, a0, r + w), p1 = ringPt(g, a, a1, r - w), q1 = ringPt(g, a, a1, r + w); t.push.apply(t, p.concat(q2, q1, p, q1, p1)); }
        G.set(names[a], t, cols[a], { flat: true, top: true, noclip: true });
      } else for (a = 0; a < 2; a++) {
        var cx = g.c[0], cy = g.c[1], z = 0.1, L = Math.max(g.box[a] + 8, 15), hw = L * 0.09, ex = a ? 0 : 1, ey = a ? 1 : 0, nx = -ey, ny = ex, b = w * 0.7, tx = cx + ex * L, ty = cy + ey * L, sx0 = cx - ex * L, sy0 = cy - ey * L, hx = ex * hw * 1.6, hy = ey * hw * 1.6;
        t = [sx0 + nx * b, sy0 + ny * b, z, tx + nx * b, ty + ny * b, z, tx - nx * b, ty - ny * b, z, sx0 + nx * b, sy0 + ny * b, z, tx - nx * b, ty - ny * b, z, sx0 - nx * b, sy0 - ny * b, z,
          tx + nx * hw, ty + ny * hw, z, tx + hx, ty + hy, z, tx - nx * hw, ty - ny * hw, z, sx0 - nx * hw, sy0 - ny * hw, z, sx0 - hx, sy0 - hy, z, sx0 + nx * hw, sy0 + ny * hw, z];
        G.set(names[a], t, cols[a], { flat: true, top: true, noclip: true });
        g['a' + a] = [[sx0 - hx, sy0 - hy, z], [tx + hx, ty + hy, z]];
      }
    }
    function segDist(x, y, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)); return Math.hypot(x - a[0] - dx * u, y - a[1] - dy * u); }
    /** 0.26.34 📍 직접 찍는 서포트 — 모양 · 방향 · 크기가 바뀌면 자리가 틀어지므로 비움 · 이동은 따라감 */
    function pinsNow() { var k = [S.orient && S.orient.key, S.opt.scale, S.rot].join(); if (S.pinT !== S.tris || S.pinK !== k) { S.pinT = S.tris; S.pinK = k; S.pins = []; S.pickT = null; S.edits = null; S.sel = []; } return S.pins; }
    function pinsDraw() {
      if (!G) return; var hide = S.tool === 'pin' && !S.supShow; G.off('sup', hide); G.off('raft', hide);   // 0.26.39 📍 도구에서는 서포트가 모델을 가리지 않게
      var t = [], p = S.pos || [0, 0], l = S.ml || 0, dm = (S.orient && (S.rd || S.orient.dims)) || [40, 40, 40], u = Math.max(0.35, Math.max(dm[0], dm[1], dm[2]) * S.opt.scale * 0.006); pinsNow().forEach(function (c) { cone(t, c[0] + p[0], c[1] + p[1], c[2] + l - u * 2.2, u, c[2] + l, 0.15); });
      if (t.length) G.set('pins', t, [1, 0.25, 0.5], { flat: true, noclip: true }); else G.drop('pins');
      var st = [], d = RSL && RSL.done && RSL.done(), hs = (d && d.heads) || []; (S.tool === 'pin' && S.sel ? S.sel : []).forEach(function (i) { var h = hs[i]; if (h) cone(st, h[3], h[4], h[5] - u * 1.2, u * 1.1, h[5] + u * 1.2, u * 1.1); });
      if (st.length) G.set('picks', st, [0.2, 1, 0.45], { flat: true, noclip: true }); else G.drop('picks');
    }
    /** 0.26.85 ✂️ 서포트 고르기 — 화면에서 가장 가까운 핀 */
    function editDown(x, y) {
      var d = RSL.done(), hs = (d && d.heads) || [], best = -1, bd = 14, i; for (i = 0; i < hs.length; i++) { var c = G.project([hs[i][3], hs[i][4], hs[i][5]]), e = c ? Math.hypot(c[0] - x, c[1] - y) : 1e9; if (e < bd) { bd = e; best = i; } }
      if (best < 0) return false; S.drag = { k: 'sel', i: best }; return true;
    }
    function editDo(a) {
      var d = RSL.done(), hs = (d && d.heads) || [], p = S.pos || [0, 0], l = d ? d.lift || 0 : 0, b = d && d.load, g = ++S.eg || (S.eg = 1); if (!S.sel || !S.sel.length) return;
      S.edits = S.edits || { list: [], base: b ? { spacing: b.spacing, angle: b.angle, body: b.body, grams: b.grams, auto: d.autoPins || [] } : null };
      if (S.edits.base) S.edits.base.auto = d.autoPins || [];
      S.sel.forEach(function (i) { var h = hs[i]; if (h) S.edits.list.push({ p: [h[9] - p[0], h[10] - p[1], h[11] - l], gone: a.gone, tip: a.tip, body: a.body, g: g }); });
      S.sel = []; RSL.again(); tool();
    }
    function editBar() { return RSL.done() || S.edits ? '<div class="pck-rzs-tr"><button type="button" class="pck-rzs-tb' + (S.pinMode === 'edit' ? '' : ' on') + '" data-pm="">📍 넣기</button><button type="button" class="pck-rzs-tb' + (S.pinMode === 'edit' ? ' on' : '') + '" data-pm="edit">✂️ 고치기</button></div>' : ''; }
    function editBody() {
      var n = (S.sel || []).length, e = S.edits ? S.edits.list.length : 0, btn = function (a, t) { return '<button type="button" class="pck-rzs-tb" ' + a + (n ? '' : ' disabled') + '>' + t + '</button>'; };
      if (S.moving) return '<small class="pck-hint">👉 옮길 자리를 모델에서 눌러 주세요.</small><div class="pck-rzs-tr"><button type="button" class="pck-rzs-tb" id="prz-e-nomove">취소</button></div>';
      if (!RSL.done()) return '<small class="pck-hint">슬라이스를 하면 서포트를 고를 수 있어요.</small>';
      return '<small class="pck-hint">핀의 마디를 누르면 골라져요 (초록). 다시 누르면 풀려요.</small><div class="pck-rzs-tr"><b>고른 서포트 ' + n + '개</b>' + btn('data-eg="1"', '🗑 지우기') + btn('id="prz-e-move"', '✋ 옮기기') + '</div>' +
        '<div class="pck-rzs-tr"><b>끝</b>' + [0.3, 0.4, 0.5, 0.6, 0.7].map(function (v) { return btn('data-et="' + v + '"', v); }).join('') + '</div><div class="pck-rzs-tr"><b>기둥</b>' + [1, 1.2, 1.5, 2].map(function (v) { return btn('data-eb="' + v + '"', v); }).join('') + '</div>' +
        '<div class="pck-rzs-tr"><button type="button" id="prz-e-none"' + (n ? '' : ' disabled') + '>고르기 풀기</button><button type="button" id="prz-e-undo"' + (e ? '' : ' disabled') + '>↩ 되돌리기</button><button type="button" id="prz-e-all"' + (e ? '' : ' disabled') + '>처음으로</button></div>';
    }
    function editBind(p) {
      qa('[data-pm]', p).forEach(function (b) { b.onclick = function () { S.pinMode = b.getAttribute('data-pm'); S.sel = []; S.moving = false; S.supShow = true; tool(); }; });
      qa('[data-eg]', p).forEach(function (b) { b.onclick = function () { editDo({ gone: 1 }); }; });
      qa('[data-et]', p).forEach(function (b) { b.onclick = function () { editDo({ tip: +b.getAttribute('data-et') }); }; });
      qa('[data-eb]', p).forEach(function (b) { b.onclick = function () { editDo({ body: +b.getAttribute('data-eb') }); }; });
      var a = q('#prz-e-none'); if (a) a.onclick = function () { S.sel = []; tool(); };
      a = q('#prz-e-move'); if (a) a.onclick = function () { S.moving = true; tool(); };
      a = q('#prz-e-nomove'); if (a) a.onclick = function () { S.moving = false; tool(); };
      a = q('#prz-e-undo'); if (a) a.onclick = function () { var l = S.edits.list, g = l[l.length - 1].g; S.edits.list = l.filter(function (e) { return e.g !== g; }); RSL.again(); tool(); };
      a = q('#prz-e-all'); if (a) a.onclick = function () { S.edits = null; RSL.again(); tool(); };
    }
    /** 0.26.105 가려진 곳을 찍을 수 있게 위 · 아래를 잘라 봄 — 📍 도구와 미리 보기 */
    function cutApply() {
      if (!G) return; var on = view3 === 'prep' && S.tool === 'pin' && !!S.tris, c = S.cut || (S.cut = { lo: 0, hi: 1000 }), b = q('#prz-cut');
      if (!b && on) {
        b = document.createElement('div'); b.id = 'prz-cut'; b.className = 'pck-lb pck-rzs-cut'; b.innerHTML = '✂ <span id="prz-cutn"></span><div class="pck-dual"><input type="range" id="prz-cl" aria-label="아래 잘라 내기" title="아래를 잘라 내기" min="0" max="1000" value="0"><input type="range" id="prz-ch" aria-label="위 잘라 내기" title="위를 잘라 내기" min="0" max="1000" value="1000"></div>'; q('#prz-gl').parentNode.appendChild(b);
        q('#prz-ch').oninput = function () { var k = S.cut; k.hi = Math.max(+this.value, k.lo + 5); this.value = k.hi; cutApply(); };
        q('#prz-cl').oninput = function () { var k = S.cut; k.lo = Math.min(+this.value, k.hi - 5); this.value = k.lo; cutApply(); };
      }
      if (b) b.hidden = !on;
      var lc = q('#prz-l'), lb = lc && lc.closest('.pck-lb'); if (lb) lb.style.display = on ? 'none' : '';
      if (on) { var h = (S.rd || S.orient.dims)[2] * S.opt.scale, l = S.ml || 0; G.V.clip = c.hi >= 1000 ? 1e9 : l + h * c.hi / 1000; G.V.lo = c.lo <= 0 ? -1e9 : l + h * c.lo / 1000; q('#prz-cutn').textContent = n1(h * c.lo / 1000) + ' ~ ' + n1(h * c.hi / 1000) + ' mm'; }
      else if (view3 === 'prep') { G.V.clip = 1e9; G.V.lo = -1e9; }
      else G.V.lo = RSL.low();
      G.draw();
    }
    function pinDown(x, y) {
      if (S.pinMode === 'edit' && !S.moving) return editDown(x, y);
      var i, p = S.pos || [0, 0], l = S.ml || 0, list = pinsNow(); if (!S.tris) return false;
      for (i = 0; i < list.length; i++) { var c = G.project([list[i][0] + p[0], list[i][1] + p[1], list[i][2] + l]); if (c && Math.hypot(c[0] - x, c[1] - y) < 12) { S.drag = { k: 'pin', i: i }; return true; } }
      if (!S.pickT) { var t = turned(window.PCCore, S.tris, S.orient.key, S.rot), s = S.opt.scale; if (s !== 1) for (i = 0; i < t.length; i++) t[i] *= s; S.pickT = t; }
      var h = G.pick(x, y, S.pickT, p[0], p[1], l); if (!h || h[3] > 0.1) return false;   // 위를 보는 면이면 그냥 돌리기
      S.drag = { k: 'pin', add: [Math.round(h[0] * 100) / 100, Math.round(h[1] * 100) / 100, Math.round(h[2] * 100) / 100] }; return true;
    }
    // 0.26.112 객체 고르기 · 바로 옮기기 — 누른 것이 고른 객체가 되고, 끌면 판 위에서 움직임
    function objDown(x, y) {
      if (PL.locks[PL.cur]) return false; var l = S.ml || 0, hit = -1, near = Infinity, i, e = G.eye(), dist = function (h, o) { return h ? Math.hypot(h[0] + o[0] - e[0], h[1] + o[1] - e[1], h[2] + l - e[2]) : Infinity; };
      if (!S.pickT) { var t = turned(window.PCCore, S.tris, S.orient.key, S.rot), s = S.opt.scale; if (s !== 1) for (i = 0; i < t.length; i++) t[i] *= s; S.pickT = t; }
      var d0 = dist(G.pick(x, y, S.pickT, S.pos[0], S.pos[1], l), S.pos); near = d0;
      (S.peers || []).forEach(function (k, n) { var d = dist(G.pick(x, y, objWorld(k), k.p[0], k.p[1], l), k.p); if (d < near) { near = d; hit = n; } });
      if (near === Infinity) return false; if (hit >= 0) objSwap(hit);
      var o = G.project([S.pos[0], S.pos[1], 0]), px = G.project([S.pos[0] + 1, S.pos[1], 0]), py = G.project([S.pos[0], S.pos[1] + 1, 0]); if (!o || !px || !py) return false;
      S.drag = { k: 'mov', ax: -1, x: x, y: y, p0: S.pos.slice(), a: [px[0] - o[0], px[1] - o[1]], b: [py[0] - o[0], py[1] - o[1]] }; return true;
    }
    /** 0.26.113 다른 판(또는 그 위 객체)을 누르면 그 판으로 넘어감 */
    function plTap(x, y) {
      var ph = G.V.ph, i; if (!ph || PL.list.length < 2) return false; var a = ph[0], b = ph[1], T = new Float32Array([-a, -b, 0, a, -b, 0, a, b, 0, -a, -b, 0, a, b, 0, -a, b, 0]);
      for (i = 0; i < PL.list.length; i++) {
        if (i === PL.cur) continue; var o = plOff(i), k = PL.list[i], objs = k ? [k].concat(k.peers || []) : [], hit = -1; objs.some(function (u, n) { if (G.pick(x, y, objWorld(u), o[0] + u.p[0], o[1] + u.p[1], u.l || 0)) { hit = n; return true; } return false; });
        if (hit < 0 && !G.pick(x, y, T, o[0], o[1], 0)) continue;
        var free = view3 === 'prep' && hit >= 0 && !PL.locks[i] && S.tool !== 'pin' && S.tool !== 'rot', u0 = hit >= 0 ? objs[hit] : null, c0 = u0 && G.project([o[0] + u0.p[0], o[1] + u0.p[1], 0]), cx = u0 && G.project([o[0] + u0.p[0] + 1, o[1] + u0.p[1], 0]), cy = u0 && G.project([o[0] + u0.p[0], o[1] + u0.p[1] + 1, 0]);
        var vt = G.V.t.slice(), vy = G.V.yaw, vp = G.V.pitch, vd = G.V.dist; plSave(); if (k) S.fitFor = k.t; plLoad(i, true); G.V.t = [vt[0] - o[0], vt[1] - o[1], vt[2]]; G.V.yaw = vy; G.V.pitch = vp; G.V.dist = vd; G.draw();   // 판 좌표가 바뀐 만큼 시점도 옮겨 화면은 그대로
        if (hit > 0) objSwap(hit - 1);
        if (free && c0 && cx && cy) S.drag = { k: 'mov', ax: -1, x: x, y: y, p0: S.pos.slice(), a: [cx[0] - c0[0], cx[1] - c0[1]], b: [cy[0] - c0[0], cy[1] - c0[1]] }; return true;
      }
      return false;
    }
    function gizDown(x, y) {
      if (plTap(x, y)) return true;
      if (S.tool === 'pin') return pinDown(x, y);
      var g = S.gz, a, k; if (view3 !== 'prep' || !S.tris) return false;
      if (S.tool !== 'rot' && !(S.tool === 'move' && g && [0, 1].some(function (n) { return segDist(x, y, G.project(g['a' + n][0]), G.project(g['a' + n][1])) < 12; }))) return objDown(x, y);
      if (!g) return false;
      if (S.tool === 'rot') {
        var best = -1, bd = 12; for (a = 0; a < 3; a++) for (k = 0; k < 72; k++) { var p = G.project(ringPt(g, a, k / 72 * 6.2832, g.r)); if (p) { var dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = a; } } }
        if (best < 0) return false; var c = G.project(g.c);
        S.drag = { k: 'rot', a: best, c: c, sgn: G.eye()[best] >= 0 ? 1 : -1, last: Math.atan2(y - c[1], x - c[0]), total: 0, R0: rotMat(S.rot) }; return true;
      }
      var ax = -2, o = G.project([g.c[0], g.c[1], 0]), px = G.project([g.c[0] + 1, g.c[1], 0]), py = G.project([g.c[0], g.c[1] + 1, 0]); if (!o) return false;
      for (a = 0; a < 2; a++) if (segDist(x, y, G.project(g['a' + a][0]), G.project(g['a' + a][1])) < 12) { ax = a; break; }
      S.drag = { k: 'mov', ax: ax, x: x, y: y, p0: S.pos.slice(), a: [px[0] - o[0], px[1] - o[1]], b: [py[0] - o[0], py[1] - o[1]] }; return true;
    }
    function gizMove(x, y) {
      if (S.drag && (S.drag.k === 'pin' || S.drag.k === 'sel')) return;
      var D = S.drag; if (!D) return; D.lx = x; D.ly = y;
      if (!D.st) { D.st = 1; var pb = q('[data-v=pre]'); if (pb && !pb.disabled && S.view) S.view.back(); }
      if (D.k === 'rot') {
        var a = Math.atan2(y - D.c[1], x - D.c[0]), da = a - D.last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; D.last = a; D.total += da;
        D.deg = Math.round(-D.total * D.sgn * 180 / Math.PI); S.rot = eulerOf(mat3(axisMat(D.a, D.deg), D.R0));
      } else {
        var dx = x - D.x, dy = y - D.y, A0 = D.a, B0 = D.b, u, v;
        if (D.ax === 0) { u = (dx * A0[0] + dy * A0[1]) / (A0[0] * A0[0] + A0[1] * A0[1] || 1); v = 0; }
        else if (D.ax === 1) { u = 0; v = (dx * B0[0] + dy * B0[1]) / (B0[0] * B0[0] + B0[1] * B0[1] || 1); }
        else { var det = A0[0] * B0[1] - A0[1] * B0[0]; if (Math.abs(det) < 1e-6) return; u = (dx * B0[1] - dy * B0[0]) / det; v = (dy * A0[0] - dx * A0[1]) / det; }
        S.pos = [Math.round((D.p0[0] + u) * 10) / 10, Math.round((D.p0[1] + v) * 10) / 10];
      }
      if (!S.lv) S.lv = requestAnimationFrame(function () {   // 0.26.23 끄는 동안은 그려 둔 모델을 행렬로만 옮김 · 놓을 때 다시 만듦
        S.lv = 0; var E = S.drag; if (!E) return;
        if (E.k === 'rot') { var r = axisMat(E.a, E.deg || 0), h = S.gz.c[2], p = S.pos; G.xform([r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, p[0] - r[2] * h, p[1] - r[5] * h, h - r[8] * h, 1]); qa('[data-rv]').forEach(function (b, i) { b.value = S.rot[i]; }); }
        else { G.xform(moveM()); giz(); qa('[data-mv]').forEach(function (b, i) { b.value = S.pos[i]; }); }
      });
    }
    function gizUp() { var D = S.drag; S.drag = null; if (S.lv) { cancelAnimationFrame(S.lv); S.lv = 0; } if (D && D.k === 'sel') { S.sel = S.sel || []; var si = S.sel.indexOf(D.i); if (si >= 0) S.sel.splice(si, 1); else S.sel.push(D.i); tool(); return; } if (D && D.k === 'pin') { if (D.add) S.pins.push(D.add); else S.pins.splice(D.i, 1); if (S.moving) { S.moving = false; editDo({ gone: 1 }); return; } tool(); RSL.reset(); return; } if (!D || !D.st) return; if (D.k === 'rot') turnNow(); else if (!plDrop(D)) { G.xform(moveM()); RSL.model(); tool(); } }
    /** 0.26.120 객체를 놓을 때 — 다른 판 위면 그 판으로 옮기고, 아니면 고른 판 안으로 밀어 넣음 */
    function plFit(t, p, ph) {
      var b = [1e9, -1e9, 1e9, -1e9], i; for (i = 0; i < t.length; i += 3) { b[0] = Math.min(b[0], t[i]); b[1] = Math.max(b[1], t[i]); b[2] = Math.min(b[2], t[i + 1]); b[3] = Math.max(b[3], t[i + 1]); }
      var at = function (lo, hi, v, h) { h -= 0.1; if (hi - lo >= h * 2) return -(lo + hi) / 2; return Math.max(-h - lo, Math.min(h - hi, v)); };
      return [Math.round(at(b[0], b[1], p[0], ph[0]) * 10) / 10, Math.round(at(b[2], b[3], p[1], ph[1]) * 10) / 10];
    }
    function plDrop(D) {
      var ph = G.V.ph, t = objWorld({ t: S.tris, o: S.orient, r: S.rot, s: S.opt.scale }), i, b = [1e9, -1e9, 1e9, -1e9], to = -1, o, hp; if (!ph) return false;
      for (i = 0; i < t.length; i += 3) { b[0] = Math.min(b[0], t[i]); b[1] = Math.max(b[1], t[i]); b[2] = Math.min(b[2], t[i + 1]); b[3] = Math.max(b[3], t[i + 1]); }
      var a0 = ph[0], b0 = ph[1], T = new Float32Array([-a0, -b0, 0, a0, -b0, 0, a0, b0, 0, -a0, -b0, 0, a0, b0, 0, -a0, b0, 0]);   // 멀리 있는 판은 원근 때문에 끈 거리로 못 재므로 마우스가 가리킨 판을 찾음
      PL.list.forEach(function (k, n) { if (n === PL.cur || PL.locks[n] || to >= 0) return; var q0 = plOff(n), h = G.pick(D.lx, D.ly, T, q0[0], q0[1], 0); if (h) { to = n; o = q0; hp = h; } });
      if (to < 0) { S.pos = plFit(t, S.pos, ph); qa('[data-mv]').forEach(function (e, n) { e.value = S.pos[n]; }); return false; }
      var mv = objSnap(S.oid), nx = (S.peers || []).shift(), vt = G.V.t.slice(), vy = G.V.yaw, vp = G.V.pitch, vd = G.V.dist; mv.eds = null; mv.peers = []; mv.p = plFit(t, [hp[0] - (b[0] + b[1]) / 2, hp[1] - (b[2] + b[3]) / 2], ph);
      if (nx) { PL.gone = (PL.gone || []).concat([nx.id]); nx.pk2 = null; objLoad(nx); S.oid = nx.id; } else { S.tris = null; S.oid = 0; }
      plSave(); if (PL.list[to]) PL.list[to].peers = (PL.list[to].peers || []).concat([mv]); else PL.list[to] = mv;
      plLoad(to, true); G.V.t = [vt[0] - o[0], vt[1] - o[1], vt[2]]; G.V.yaw = vy; G.V.pitch = vp; G.V.dist = vd; var n2 = S.peers.indexOf(mv); if (n2 >= 0) objSwap(n2); plDraw(); return true;
    }
    /** 0.26.19 🔄 회전 · 🔍 크기 메뉴 */
    function turnNow() { S.rd = S.rot && (S.rot[0] || S.rot[1] || S.rot[2]) ? sizeOf(turned(window.PCCore, S.tris, S.orient.key, S.rot)) : null; card(); RSL.model(); tool(); }
    function tool() {
      cutApply();
      giz(); pinsDraw(); var p = q('#prz-tp'); if (!p) return; if (!S.tool || !S.tris) { p.hidden = true; return; } p.hidden = false; S.rot = S.rot || [0, 0, 0];
      p.innerHTML = S.tool === 'pin' ? editBar() + (S.pinMode === 'edit' ? editBody() : '<small class="pck-hint">모델의 아래쪽 · 옆면을 누르면 서포트가 들어가요. 분홍 표시를 다시 누르면 빠져요. 빈 곳을 끌면 돌아가요.</small><div class="pck-rzs-tr"><b>직접 넣은 서포트 ' + S.pins.length + '개</b><button type="button" id="prz-pin0">모두 지우기</button><button type="button" id="prz-pinv"' + (RSL.done && RSL.done() ? '' : ' disabled') + '>' + (S.supShow ? '서포트 숨기기' : '서포트 보이기') + '</button></div><small class="pck-hint">슬라이스를 눌러야 반영돼요 · 「서포트 만들기」를 켜 두세요.</small>') : S.tool === 'move' ? ['X', 'Y'].map(function (a, i) { return '<div class="pck-rzs-tr"><b>' + a + '</b><button type="button" data-ma="' + i + '" data-d="-5">−5</button><input type="number" step="0.1" data-mv="' + i + '" value="' + S.pos[i] + '" aria-label="' + a + ' 자리"><button type="button" data-ma="' + i + '" data-d="5">+5</button></div>'; }).join('') + '<small class="pck-hint">모델이나 화살표를 끌어서 옮겨요.</small><button type="button" class="pck-rzs-tb" id="prz-m0">⌖ 판 가운데로</button>'
        : S.tool === 'rot' ? ['X', 'Y', 'Z'].map(function (a, i) { return '<div class="pck-rzs-tr"><b>' + a + '</b><button type="button" data-ra="' + i + '" data-d="-15">−15°</button><input type="number" step="1" data-rv="' + i + '" value="' + S.rot[i] + '" aria-label="' + a + ' 회전 각도"><button type="button" data-ra="' + i + '" data-d="15">+15°</button><button type="button" data-ra="' + i + '" data-d="90">90°</button></div>'; }).join('') + '<small class="pck-hint">색 링을 끌어서 돌려요.</small><button type="button" class="pck-rzs-tb" id="prz-r0">↺ 회전 처음으로</button>'
        : '<div class="pck-rzs-tr"><button type="button" data-sd="-10">−10%</button><input type="number" min="1" step="1" id="prz-s2" value="' + Math.round(S.opt.scale * 100) + '" aria-label="크기 퍼센트"><b>%</b><button type="button" data-sd="10">+10%</button></div><button type="button" class="pck-rzs-tb" id="prz-s0">↺ 원래 크기</button>';
      function setRot(i, v) { v = ((Math.round(v) + 180) % 360 + 360) % 360 - 180; S.rot = S.rot.slice(); S.rot[i] = v; turnNow(); }
      function setSize(v) { if (v > 0) { S.opt.scale = v / 100; card(); RSL.model(); tool(); } }
      qa('[data-ra]', p).forEach(function (b) { b.onclick = function () { S.rot = eulerOf(mat3(axisMat(+b.getAttribute('data-ra'), +b.getAttribute('data-d')), rotMat(S.rot))); turnNow(); }; });
      function setPos(i, v) { S.pos = S.pos.slice(); S.pos[i] = Math.round(v * 10) / 10; RSL.model(); tool(); }
      qa('[data-ma]', p).forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-ma'); setPos(i, S.pos[i] + +b.getAttribute('data-d')); }; });
      qa('[data-mv]', p).forEach(function (b) { b.onchange = function () { setPos(+b.getAttribute('data-mv'), +b.value || 0); }; });
      var pv = q('#prz-pinv'); if (pv) pv.onclick = function () { S.supShow = !S.supShow; tool(); };
      editBind(p);
      var pn = q('#prz-pin0'); if (pn) pn.onclick = function () { S.pins.length = 0; tool(); RSL.reset(); };
      var m0 = q('#prz-m0'); if (m0) m0.onclick = function () { S.pos = [0, 0]; RSL.model(); tool(); };
      qa('[data-rv]', p).forEach(function (b) { b.onchange = function () { setRot(+b.getAttribute('data-rv'), +b.value || 0); }; });
      qa('[data-sd]', p).forEach(function (b) { b.onclick = function () { setSize(Math.max(1, Math.round(S.opt.scale * 100) + +b.getAttribute('data-sd'))); }; });
      var r0 = q('#prz-r0'), s0 = q('#prz-s0'), s2 = q('#prz-s2'); if (r0) r0.onclick = function () { S.rot = [0, 0, 0]; turnNow(); }; if (s0) s0.onclick = function () { setSize(100); }; if (s2) s2.onchange = function () { setSize(+this.value); };
    }
    function use(f, tris, scale, key) { S.cut = { lo: 0, hi: 1000 }; var cb = q('#prz-cut'); if (cb) cb.parentNode.removeChild(cb); S.file = f; S.tris = tris; S.pickT = null; S.peers = []; S.rot = [0, 0, 0]; S.pos = [0, 0]; S.rd = null; S.opt.scale = scale || 1; S.a = window.PCCore.analyze(tris, { overhangAngle: S.cfg.settings.overhang_angle }); S.orient = S.a.orients.filter(function (o) { return o.key === key; })[0] || S.a.orients[0]; card(); RSL.model(); S.view.back(); tool(); plSave(); plBar(); }
    // 0.26.67 판 여러 장 — 판마다 모델 하나 · 판을 바꾸면 그 판의 모델 · 자리 · 핀을 불러옴 (슬라이스 결과는 다시)
    var PL = { list: [null], cur: 0, locks: [false], n: 0, names: [''] };
    function objSnap(id, gk) { return { id: id || ++PL.n, gk: gk, f: S.file, t: S.tris, a: S.a, o: S.orient, r: S.rot, p: S.pos, rd: S.rd, pins: S.pins || [], eds: S.edits || null, pk: S.pinK, pt: S.pinT, s: S.opt.scale, l: S.ml || 0, pickT: S.pickT, peers: S.peers || [] }; }
    function objLoad(k) { S.file = k.f; S.tris = k.t; S.a = k.a; S.orient = k.o; S.rot = k.r; S.pos = k.p; S.rd = k.rd; S.pins = k.pins; S.pinK = k.pk; S.pinT = k.pt; S.opt.scale = k.s; S.pickT = k.pickT || null; }
    function objWorld(k) { if (k.w) return k.w; var t = turned(window.PCCore, k.t, k.o.key, k.r), i; if (k.s !== 1) { t = t.slice(); for (i = 0; i < t.length; i++) t[i] *= k.s; } return (k.w = t); }
    function objDims(k) { var d = k.rd || k.o.dims; return [d[0] * k.s, d[1] * k.s]; }
    /** 판 위 객체 모두를 판 좌표 삼각형 하나로 — 슬라이스 · STL */
    function plIn(p) { var ph = G && G.V.ph; return !ph || (Math.abs(p[0]) < ph[0] && Math.abs(p[1]) < ph[1]); }   // 0.26.140 가운데가 판 밖이면 슬라이스에서 뺌
    function plateTris() {
      var l = [{ t: objWorld({ t: S.tris, o: S.orient, r: S.rot, s: S.opt.scale }), p: S.pos || [0, 0] }].concat((S.peers || []).map(function (k) { return { t: objWorld(k), p: k.p }; })).filter(function (x) { return plIn(x.p); }), n = 0, o = 0, i;
      l.forEach(function (x) { n += x.t.length; }); var a = new Float32Array(n);
      l.forEach(function (x) { a.set(x.t, o); for (i = o; i < o + x.t.length; i += 3) { a[i] += x.p[0]; a[i + 1] += x.p[1]; } o += x.t.length; }); return a;
    }
    /** 다른 객체를 고름 — 지금 객체는 옆으로 · 고친 서포트는 판 자리를 그대로 유지 */
    function objSwap(n) {
      var p0 = S.pos, cur = objSnap(S.oid), nx = S.peers[n]; cur.eds = null; S.peers.splice(n, 1); S.peers.push(cur); S.oid = nx.id; objLoad(nx); PL.gone = (PL.gone || []).concat([nx.id]); nx.pk2 = null;
      if (S.edits && S.edits.list) S.edits.list.forEach(function (e) { e.p = [e.p[0] + p0[0] - S.pos[0], e.p[1] + p0[1] - S.pos[1], e.p[2]]; });
      S.sel = []; S.mt = null; S.fitFor = S.tris; card(); RSL.model(); tool(); plDraw();
    }
    /** 객체들을 줄 맞춰 판 가운데에 — 안 들어가면 false (자리는 그대로) */
    function plRows(all) {
      var ph = G && G.V.ph; if (!ph) return null; var gap = 6, W = ph[0] * 2 - 4, H = ph[1] * 2 - 4, rows = [], r = null;
      all.forEach(function (x) { if (x.d[0] > W || x.d[1] > H) rows = null; if (!rows) return; if (!r || r.w + gap + x.d[0] > W) { r = { w: 0, h: 0, l: [] }; rows.push(r); } r.w += (r.l.length ? gap : 0) + x.d[0]; r.h = Math.max(r.h, x.d[1]); r.l.push(x); });
      if (!rows) return null; var tot = rows.reduce(function (s, x) { return s + x.h; }, 0) + gap * (rows.length - 1); if (tot > H) return null; rows.tot = tot; return rows;
    }
    function plPack() {
      var gap = 6, rows = plRows([{ d: objDims({ rd: S.rd, o: S.orient, s: S.opt.scale }), me: 1 }].concat((S.peers || []).map(function (k) { return { d: objDims(k), k: k }; }))); if (!rows) return false; var y = -rows.tot / 2;
      rows.forEach(function (w) { var x = -w.w / 2; w.l.forEach(function (o) { var p = [Math.round((x + o.d[0] / 2) * 10) / 10, Math.round((y + w.h / 2) * 10) / 10]; if (o.me) S.pos = p; else { o.k.p = p; } x += o.d[0] + gap; }); y += w.h + gap; }); return true;
    }
    function plSave() {
      var old = PL.list[PL.cur]; if (old && !S.tris && G) { G.drop('pg' + old.id); (old.peers || []).forEach(function (k) { G.drop('pg' + k.id); }); }
      PL.list[PL.cur] = S.tris ? objSnap(S.oid || (old ? old.id : 0), old && old.id === S.oid ? old.gk : null) : null; if (PL.list[PL.cur]) S.oid = PL.list[PL.cur].id;
    }
    // 0.26.68 판을 격자로 나란히 — 고른 판이 늘 원점이고 나머지는 그 옆에 (자리 · 슬라이스 셈은 그대로)
    function plOff(i) {
      var ph = G.V.ph, c = Math.ceil(Math.sqrt(PL.list.length)), sx = ph[0] * 2 + Math.max(30, ph[0] * 0.4), sy = ph[1] * 2 + Math.max(36, ph[1] * 0.4);
      return [(i % c - PL.cur % c) * sx, (Math.floor(PL.cur / c) - Math.floor(i / c)) * sy];
    }
    function plHome() {
      if (!G || !G.V.ph || PL.list.length < 2) return; var ph = G.V.ph, a = [1e9, 1e9, -1e9, -1e9]; PL.list.forEach(function (x, i) { var o = plOff(i); a[0] = Math.min(a[0], o[0]); a[1] = Math.min(a[1], o[1]); a[2] = Math.max(a[2], o[0]); a[3] = Math.max(a[3], o[1]); });
      G.V.tHome = [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2, 0]; var cv = q('#prz-gl'), asp = cv && cv.clientHeight ? Math.min(1, cv.clientWidth / cv.clientHeight) : 1; G.V.home = Math.max((a[2] - a[0] + ph[0] * 2 + 16) / asp, a[3] - a[1] + ph[1] * 2 + 16) * 1.75;   // 세로로 긴 화면이면 가로 폭에 맞춤
    }
    function plDraw() {
      if (!G || !G.V.ph) return; var oth = [];
      PL.list.forEach(function (k, i) {
        var o = plOff(i); if (i !== PL.cur) oth.push(o); if (!k) return;
        [k].concat(k.peers || []).forEach(function (u) { var nm = 'pg' + u.id, here = i === PL.cur, lf = view3 !== 'prep' && PL.sup && PL.sup[i] ? PL.sup[i].lift || 0 : 0, gk = [u.o && u.o.key, u.s, u.r, lf].join(); if (here) { G.hide(nm, true); return; }
          if (u.gk !== gk) { G.set(nm, objWorld(u), [0.33, 0.56, 0.68], { z: lf, noclip: true }); u.gk = gk; }
          G.hide(nm, false); G.place(nm, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o[0] + u.p[0], o[1] + u.p[1], 0, 1]); });
      });
      Object.keys(PL.sup || {}).forEach(function (i) { var o = plOff(+i), m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o[0], o[1], 0, 1]; ['ps', 'pr'].forEach(function (p) { if (PL.sup[i][p]) { G.place(p + i, m); G.hide(p + i, view3 === 'prep'); } }); });
      (PL.gone || []).forEach(function (id) { G.drop('pp' + id); }); PL.gone = [];
      (S.peers || []).forEach(function (u) { var nm = 'pp' + u.id, l = S.ml || 0, gk = [u.o && u.o.key, u.s, u.r, l].join(); if (u.pk2 !== gk) { G.set(nm, objWorld(u), [0.33, 0.56, 0.68], { z: l }); u.pk2 = gk; } G.hide(nm, false); G.place(nm, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u.p[0], u.p[1], 0, 1]); });
      G.V.others = oth; G.draw();
    }
    function plLoad(i, keep) {
      var k = PL.list[i], pv = view3; PL.cur = i; S.drag = null; S.mt = null;
      PL.gone = (PL.gone || []).concat((S.peers || []).map(function (u) { u.pk2 = null; return u.id; }));
      if (k) { objLoad(k); S.oid = k.id; S.peers = k.peers || []; S.edits = k.eds || null; S.sel = []; }
      else { S.peers = []; S.oid = 0; S.pickT = null; S.file = S.tris = S.a = S.orient = S.rd = null; S.rot = [0, 0, 0]; S.pos = [0, 0]; S.pins = []; S.edits = null; S.sel = []; S.opt.scale = 1; if (G) G.drop('model'); }
      card(); RSL.model(); S.view.back(); if (k) tool(); else { var tb = q('#prz-tools'); if (tb) tb.hidden = true; } plHome(); plBar(); if (G && !keep) G.fit(); if (RSL) RSL.restore(pv === 'pre');
    }
    /** 0.26.129 모든 플레이트 슬라이스 — 고르지 않은 판에도 서포트 · 래프트를 그림 */
    function plSups(on) {
      if (!G) return; var keep = {}, old = PL.sup || {}; on.forEach(function (x) { if (x.i !== PL.cur) keep[x.i] = x.r; });
      Object.keys(old).forEach(function (i) { if (keep[i] !== old[i].r) { G.drop('ps' + i); G.drop('pr' + i); } });
      var now = {}; Object.keys(keep).forEach(function (i) { var r = keep[i]; if (old[i] && old[i].r === r) { now[i] = old[i]; return; } var sm = supportMesh(r); now[i] = { r: r, lift: r.lift || 0, ps: sm.sup.length > 0, pr: sm.raft.length > 0 }; if (now[i].ps) G.set('ps' + i, sm.sup, [0.98, 0.47, 0.1], { noclip: true }); if (now[i].pr) G.set('pr' + i, sm.raft, [0.63, 0.55, 0.98], { noclip: true }); });
      PL.sup = now; plDraw();
    }
    function plGo(i) { if (i === PL.cur) return; var o = plOff(i), k = PL.list[i], vt = G.V.t.slice(), vy = G.V.yaw, vp = G.V.pitch, vd = G.V.dist; plSave(); if (k) S.fitFor = k.t; plLoad(i, true); G.V.t = [vt[0] - o[0], vt[1] - o[1], vt[2]]; G.V.yaw = vy; G.V.pitch = vp; G.V.dist = vd; G.draw(); }
    function plSig(i) { var k = PL.list[i], l = i === PL.cur ? [{ o: S.orient, r: S.rot, p: S.pos, s: S.opt.scale }].concat(S.peers || []) : k ? [k].concat(k.peers || []) : []; return JSON.stringify(l.map(function (u) { return [u.o && u.o.key, u.r, u.p, u.s].join('/'); }).sort()); }
    function plFilled() { var o = []; PL.list.forEach(function (k, i) { var l = i === PL.cur ? (S.tris ? [{ p: S.pos }].concat(S.peers || []) : []) : k ? [k].concat(k.peers || []) : []; if (l.some(function (u) { return plIn(u.p); })) o.push(i); }); return o; }
    function plBar() {
      plDraw();
    }
    function plNope(m) { toast(m, true); }
    /** 0.26.70 판 이름 — 연필을 누르면 그 자리에 입력 칸 · Enter 또는 칸 밖을 누르면 저장 · Esc 취소 */
    function plName(i, nb) {
      var v = q('#prz-view'), r = nb.getBoundingClientRect(), c = v.getBoundingClientRect(), t = document.createElement('input'), done = false, end = function (ok) { if (done) return; done = true; if (ok) PL.names[i] = t.value.trim(); t.remove(); };
      t.className = 'pck-rzs-ni'; t.maxLength = 30; t.value = PL.names[i] || ''; t.placeholder = '판 이름'; t.style.left = Math.max(4, Math.min(r.left - c.left, c.width - 190)) + 'px'; t.style.top = Math.max(4, r.top - c.top) + 'px'; nb.parentNode.appendChild(t); t.focus(); t.select();
      t.onblur = function () { end(true); }; t.onpointerdown = function (e) { e.stopPropagation(); }; t.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); };
    }
    var PB = {
      add: function () { if (PL.list.length >= 9) { plNope('판은 9개까지예요.'); return; } plSave(); PL.list.push(null); PL.locks.push(false); PL.names.push(''); plLoad(PL.list.length - 1); },
      arrange: function () { if (PL.locks[PL.cur]) { plNope('잠긴 판이에요 — 자물쇠를 풀어 주세요.'); return; } if (!S.tris) { plNope('이 판에 모델이 없어요.'); return; } if (!plPack()) S.pos = [0, 0]; plSave(); S.mt = null; RSL.model(); tool(); plDraw(); },
      lock: function () { PL.locks[PL.cur] = !PL.locks[PL.cur]; },
      del: function () {
        if (PL.locks[PL.cur]) { plNope('잠긴 판이에요 — 자물쇠를 풀어 주세요.'); return; }
                if (PL.list.length < 2) { if (S.tris && !confirm('판의 모델을 지울까요?')) return; plSave(); if (PL.list[0] && G) [PL.list[0]].concat(PL.list[0].peers || []).forEach(function (u) { G.drop('pg' + u.id); }); PL.list[0] = null; plLoad(0); return; }
        // 0.26.140 판만 지우고 모델은 다른 판에 넣지 않고 옆 판 뒤쪽 밖에 둠 — 슬라이스에서 빠지고 끌어다 놓으면 판 위로
        plSave(); var c = PL.cur, k = PL.list[c], objs = k ? [k].concat(k.peers || []) : [], to = c > 0 ? c - 1 : 1, T = PL.list[to], ph = G.V.ph;
        if (objs.length) {
          var ox = -ph[0]; (T ? [T].concat(T.peers || []) : []).forEach(function (u) { if (!plIn(u.p)) ox = Math.max(ox, u.p[0] + objDims(u)[0] / 2 + 6); });
          objs.forEach(function (u) { var dm = objDims(u); u.p = [Math.round((ox + dm[0] / 2) * 10) / 10, Math.round((ph[1] + dm[1] / 2 + 6) * 10) / 10]; ox += dm[0] + 6; u.gk = null; u.pk2 = null; u.peers = []; u.eds = null; });
          if (T) T.peers = (T.peers || []).concat(objs); else { objs[0].peers = objs.slice(1); PL.list[to] = objs[0]; }
        }
        PL.list.splice(c, 1); PL.locks.splice(c, 1); PL.names.splice(c, 1); plLoad(objs.length ? (to > c ? to - 1 : to) : Math.min(c, PL.list.length - 1));
        if (objs.length) toast('판을 지우고 모델은 판 밖에 두었어요.');
      }
    };
    /** 판 옆 단추 — FDM 슬라이서와 같게 판 몸체에 붙은 탭 · 판과 같은 기울기로 눕힘 */
    function plMount() {
      var v = q('#prz-view'); if (!v || !G) return; var w = document.createElement('div'), I = { add: '<path d="M12 5v14M5 12h14"/>', arrange: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>', del: '<path d="M6 6l12 12M18 6 6 18"/>' }, svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>'; }, T = [['add', '판 추가'], ['arrange', '모델을 판에 줄 맞춰 놓기'], ['lock', '판 잠금 — 잠그면 정렬 · 지우기를 하지 않아요'], ['del', '이 판 지우기']];
      w.className = 'pck-rzs-pbw'; v.appendChild(w);
      // 0.26.122 단추는 판마다 — 판 앞 가장자리 밖에 붙어 다니고, 누르면 그 판으로 넘어간 뒤 실행
      var bars = [];
      var mkBar = function (i) { var bar = document.createElement('span'); bar.className = 'pck-rzs-pbar'; v.appendChild(bar); bar.bs = T.map(function (t) { var b = document.createElement('button'); b.type = 'button'; b.className = 'pck-rzs-pb'; b.title = t[1]; b.setAttribute('aria-label', t[1]); b.innerHTML = svg(t[0]); bar.appendChild(b); b.onpointerdown = function (e) { e.stopPropagation(); }; b.onclick = function () { plGo(i); PB[t[0]](); }; return b; }); return bar; };
      var tags = [], mkTag = function (i) { var t = document.createElement('button'); t.type = 'button'; t.className = 'pck-rzs-pn'; t.textContent = i + 1; t.title = '판 ' + (i + 1) + ' 고르기'; t.hidden = true; w.appendChild(t); t.onpointerdown = function (e) { e.stopPropagation(); }; var nb = document.createElement('div'); nb.className = 'pck-rzs-nm'; nb.hidden = true; nb.innerHTML = '<span></span><button type="button" title="판 이름 고치기" aria-label="판 이름 고치기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg></button>'; w.appendChild(nb); t.nb = nb; nb.lastChild.onpointerdown = function (e) { e.stopPropagation(); }; nb.lastChild.onclick = function () { plName(i, nb); }; t.onclick = function () { if (i !== PL.cur) { plSave(); plLoad(i); } }; return t; };
      // 0.26.135 탭은 판 바닥(z 0)에 누워 있으므로 화면에서 모델 윤곽 안에 들면 모델 뒤 — 그림자 칸이라 3D 로 가려지지 않아 숨김
      var cov = { pts: {}, ck: '', hs: [] }, hullOf = function (a) {
        a.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }); var o = [], cr = function (O, A, B) { return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]); }, i, n = a.length, t;
        for (i = 0; i < n; i++) { while (o.length > 1 && cr(o[o.length - 2], o[o.length - 1], a[i]) <= 0) o.pop(); o.push(a[i]); }
        for (i = n - 2, t = o.length + 1; i >= 0; i--) { while (o.length >= t && cr(o[o.length - 2], o[o.length - 1], a[i]) <= 0) o.pop(); o.push(a[i]); }
        o.pop(); return o;
      }, inHull = function (h, x, y) { for (var i = 0; i < h.length; i++) { var A = h[i], B = h[(i + 1) % h.length]; if ((B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]) < 0) return false; } return h.length > 2; }, covered = function (x, y) { return cov.hs.some(function (h) { return inHull(h, x, y); }); };
      var plPts = function (i) {
        var k = PL.list[i], l = i === PL.cur ? (S.tris ? [{ t: S.tris, o: S.orient, r: S.rot, s: S.opt.scale, p: S.pos }].concat(S.peers || []) : []) : k ? [k].concat(k.peers || []) : [], key = plSig(i) + l.map(function (u) { return u.t.length; }).join(), c = cov.pts[i];
        if (c && c.key === key) return c.p;
        var p = l.map(function (u) { var w = objWorld(u), st = 3 * Math.max(1, Math.floor(w.length / 3 / 500)), o = [], j; for (j = 0; j + 2 < w.length; j += st) o.push([w[j] + u.p[0], w[j + 1] + u.p[1], w[j + 2]]); return o; });
        cov.pts[i] = { key: key, p: p }; return p;
      }, plCover = function () {
        if (S.drag) return; var a = G.project([0, 0, 0]), b = G.project([9, 9, 9]), sig = PL.list.map(function (u, i) { return plSig(i); }).join(), ck = [a, b, view3, S.ml, sig].join(); if (ck === cov.ck) return; cov.ck = ck; cov.hs = [];
        PL.list.forEach(function (u, i) { var of = plOff(i), L = i === PL.cur ? S.ml || 0 : view3 !== 'prep' && PL.sup && PL.sup[i] ? PL.sup[i].lift || 0 : 0; plPts(i).forEach(function (pp) { var o = []; pp.forEach(function (q) { var t = G.project([q[0] + of[0], q[1] + of[1], q[2] + L]), g = G.project([q[0] + of[0], q[1] + of[1], 0]); if (t) o.push(t); if (g) o.push(g); }); if (o.length > 2) cov.hs.push(hullOf(o)); }); });
      };
      (function tick() {
        if (!document.contains(v)) return; requestAnimationFrame(tick);
        var ph = G.V.ph, on = ph, W = v.clientWidth, H = v.clientHeight;   // 0.26.134 미리 보기에서도 판 탭을 보임
        if (ph) { while (bars.length < PL.list.length) bars.push(mkBar(bars.length)); plCover();
          bars.forEach(function (b, i) {   // 0.26.131 FDM 과 같게 — 판 오른쪽 가장자리에 붙은 탭 · 판과 같은 기울기 · mm 크기라 확대하면 같이 커짐
            var of = i < PL.list.length && plOff(i), mm = Math.max(14, Math.min(ph[0], ph[1]) * 2 * 0.09), half = mm / 2;
            b.bs.forEach(function (x, k) {
              var hide = !on || !of, px, py, o, ax, az, m; if (!hide) { px = of[0] + ph[0] + half; py = of[1] + ph[1] - mm * (0.9 + k * 1.15); o = G.project([px, py, 0]); ax = G.project([px + half, py, 0]); az = G.project([px, py - half, 0]); hide = !o || !ax || !az; }
              if (!hide) { m = [(ax[0] - o[0]) / 16, (ax[1] - o[1]) / 16, (az[0] - o[0]) / 16, (az[1] - o[1]) / 16]; hide = Math.hypot(m[0], m[1]) * 32 < 8 || Math.hypot(m[2], m[3]) * 32 < 6 || o[0] < 0 || o[1] < 0 || o[0] > W || o[1] > H; }
              if (!hide) { var ux = ax[0] - o[0], uy = ax[1] - o[1], vx = az[0] - o[0], vy = az[1] - o[1]; hide = covered(o[0], o[1]) || covered(o[0] + ux + vx, o[1] + uy + vy) || covered(o[0] + ux - vx, o[1] + uy - vy) || covered(o[0] - ux + vx, o[1] - uy + vy) || covered(o[0] - ux - vx, o[1] - uy - vy); }
              if (x.hidden !== hide) x.hidden = hide; if (!hide) x.style.transform = 'matrix(' + m.map(function (t) { return t.toFixed(4); }).join(',') + ',' + o[0].toFixed(1) + ',' + o[1].toFixed(1) + ')';
            });
            var lk = !!PL.locks[i]; if (b.bs[2].classList.contains('on') !== lk) { b.bs[2].classList.toggle('on', lk); b.bs[2].innerHTML = svg(lk ? 'lock' : 'unlock'); } });
        }
        var dr = q('#prz-drop'); if (dr && !dr.hidden) { var dp = ph && PL.list.length > 1 && G.project([0, 0, 0]), dl = dp ? dp[0].toFixed(1) + 'px' : '', dt = dp ? dp[1].toFixed(1) + 'px' : ''; if (dr.style.left !== dl) dr.style.left = dl; if (dr.style.top !== dt) dr.style.top = dt; }   // 0.26.127 판이 여럿이면 안내는 고른 판 위에
        var ga = q('#prz-goall'); if (ga) { var gs = plFilled().length > 1 ? '' : 'none'; if (ga.style.display !== gs) ga.style.display = gs; }
        w.style.display = on ? '' : 'none'; if (!on) return;
        while (tags.length < PL.list.length) tags.push(mkTag(tags.length));
        tags.forEach(function (t, i) {
          var live = i < PL.list.length, of = live && plOff(i), show = live && PL.list.length > 1, p = show && G.project([of[0] - ph[0] + 10, of[1] + ph[1] - 10, 0]), nb = t.nb, ns = 0.55, nx = live && of[0] - ph[0], ny = live && of[1] + ph[1] + 5 + 18 * ns, n0 = live && G.project([nx, ny, -1.8]), n1 = live && G.project([nx + 16 * ns, ny, -1.8]), n2 = live && G.project([nx, ny - 16 * ns, -1.8]);
          nb.hidden = !n0 || !n1 || !n2 || n0[0] < -150 || n0[1] < -30 || n0[0] > W || n0[1] > H;
          if (!nb.hidden) { nb.style.transform = 'matrix(' + [(n1[0] - n0[0]) / 16, (n1[1] - n0[1]) / 16, (n2[0] - n0[0]) / 16, (n2[1] - n0[1]) / 16].map(function (z) { return z.toFixed(4); }).join(',') + ',' + n0[0].toFixed(1) + ',' + n0[1].toFixed(1) + ')'; var nm = PL.names[i] || ''; if (nb.firstChild.textContent !== nm) nb.firstChild.textContent = nm; nb.classList.toggle('no', !nm); } });
      })();
    }
    // 0.26.111 파일 더하기 · 0.26.112 합치지 않고 객체로 — 판에 자리가 없으면 다음 판
    function plAdd(f, tris) {
      var keep = { peers: (S.peers || []).slice(), p: S.pos }, was = (S.peers || []).map(function (k) { return k.p; }), cur = objSnap(S.oid); cur.eds = null; S.peers = keep.peers.concat([cur]);
      var a = window.PCCore.analyze(tris, { overhangAngle: S.cfg.settings.overhang_angle }), peers = S.peers; S.oid = 0; S.pickT = null; S.pins = []; S.edits = null; S.file = f; S.tris = tris; S.a = a; S.orient = a.orients[0]; S.rot = [0, 0, 0]; S.pos = [0, 0]; S.rd = null; S.opt.scale = 1;
      if (!plPack()) { objLoad(cur); S.oid = cur.id; S.peers = keep.peers; S.peers.forEach(function (k, i) { k.p = was[i]; }); S.pos = keep.p; return false; }
      S.peers = peers; S.oid = ++PL.n; S.mt = null; S.fitFor = S.tris; S.sel = []; S.cut = { lo: 0, hi: 1000 }; var cb = q('#prz-cut'); if (cb) cb.parentNode.removeChild(cb); card(); RSL.model(); S.view.back(); tool(); plSave(); plBar(); return true;
    }
    function openAll(l) { var p = Promise.resolve(); Array.prototype.slice.call(l || []).forEach(function (f) { p = p.then(function () { return open(f); }); }); }
    function open(f) {
      if (!f) return Promise.resolve();
      if (PL.locks[PL.cur]) { toast('잠긴 판이에요 — 자물쇠를 풀어 주세요.', true); return Promise.resolve(); }
      if (!/\.(stl|obj|3mf)$/i.test(f.name)) { toast('STL · OBJ · 3MF 만 열 수 있어요.', true); return Promise.resolve(); }
      if (f.size > S.cfg.settings.max_mb * 1048576) { toast('파일이 너무 커요 (' + S.cfg.settings.max_mb + 'MB 까지).', true); return Promise.resolve(); }
      q('#prz-model').innerHTML = '<p class="pck-hint">' + esc(f.name) + ' 읽는 중…</p>';
      return f.arrayBuffer().then(function (buf) { return window.PCCore.read(f.name, buf); }).then(function (tris) { if (!S.tris) use(f, tris, 1); else if (!plAdd(f, tris)) { if (PL.list.length >= 9) { card(); toast('판에 자리가 없어요 (판은 9개까지).', true); return; } PB.add(); use(f, tris, 1); toast('자리가 없어 판 ' + (PL.cur + 1) + ' 에 놓았어요.'); } }).catch(function (e) { q('#prz-model').innerHTML = '<p class="pck-hint">⚠️ ' + esc(e.message) + '</p>'; });
    }
    el.innerHTML = '<div class="pck pck-rzs">' + (opt.embed ? '' : '<header class="pck-hero"><div class="pck-hero-bg" aria-hidden="true"><i></i><i></i><i></i></div><span class="pck-hero-ic">🧪</span><div><h1>레진 슬라이서</h1><p>STL · OBJ · 3MF 를 올려 서포트 · 속 비우기 · 빼낼 구멍을 만들고 프린터 파일로 받아요.</p></div><span class="pck-badge">🔒 모델은 이 브라우저에서만 — 서버로 안 가요</span></header>') +
      '<div class="pck-rzs-bar"><div class="pck-rzs-l"><b>🧪 레진</b><button type="button" class="pck-btn" id="prz-open">📂 파일 추가</button><button type="button" class="pck-btn pck-rzs-cloud" hidden title="내 저장소에서 가져오기" aria-label="내 저장소에서 가져오기"></button><input type="file" data-cls-skip id="prz-fin" accept=".stl,.obj,.3mf" multiple hidden></div><div class="pck-rzs-seg" role="group" aria-label="보기"><button type="button" data-v="prep" class="on">준비</button><button type="button" data-v="pre" disabled>미리 보기</button></div><span class="pck-hint">끌어서 돌리기 · 휠로 확대 · 두 번 눌러 맞춤</span></div>' +
      '<div class="pck-rzs-stage"><div class="pck-rzs-view" id="prz-view"><canvas id="prz-gl" aria-label="3D 미리 보기"></canvas><div class="pck-rzs-tools" id="prz-tools" hidden><div class="pck-rzs-tbs"><button type="button" data-tool="move">✥ 이동</button><button type="button" data-tool="rot">🔄 회전</button><button type="button" data-tool="pin">📍 서포트</button><button type="button" data-tool="size">🔍 크기</button><button type="button" data-act="tilt">🧭 자동 기울임</button><button type="button" data-act="check" disabled title="슬라이스한 뒤에 쓸 수 있어요">🔎 검사하기</button></div><div class="pck-rzs-tp" id="prz-tp" hidden></div></div><div class="pck-rzs-zoom"><button type="button" id="prz-zi" title="확대" aria-label="확대">＋</button><button type="button" id="prz-zo" title="축소" aria-label="축소">－</button><button type="button" id="prz-fs" title="전체화면" aria-label="전체화면">⛶</button></div><button type="button" class="pck-rzs-fit" id="prz-fit" title="처음 보기로">⟲ 맞춤</button><label class="pck-rz-drop" id="prz-drop" for="prz-fin">📂 <b>모델 파일을 끌어 놓거나 눌러서 고르세요</b><span>STL · OBJ · 3MF</span><button type="button" class="pck-rzs-cloud" hidden title="내 저장소에서 가져오기" aria-label="내 저장소에서 가져오기"></button></label><div class="pck-rzs-ov" id="prz-ov" hidden></div></div>' +
      '<aside class="pck-rzs-side"><div id="prz-model"></div><div id="pck-rslice"><p class="pck-hint">불러오는 중…</p></div></aside></div></div>';
    /** 0.26.26 층 미리보기 — 보이기/숨김 · 확대 · 축소 · 전체보기 배지 */
    function lvBuild(ov, cv) {
      var st = S.lvs || (S.lvs = { hide: false, z: 1, x: 0, y: 0, full: false }), w = document.createElement('div'), pan = null;
      w.className = 'pck-rzs-lv'; w.id = 'prz-lv';
      w.innerHTML = '<div class="pck-rzs-lb"><button type="button" data-lv="hide"></button><button type="button" data-lv="in" title="층 그림 확대" aria-label="층 그림 확대">＋</button><button type="button" data-lv="out" title="층 그림 축소" aria-label="층 그림 축소">－</button><button type="button" data-lv="full"></button></div><div class="pck-rzs-lbox"></div>';
      var box = w.querySelector('.pck-rzs-lbox'), bt = function (k) { return w.querySelector('[data-lv=' + k + ']'); }; box.appendChild(cv); ov.appendChild(w);
      // 0.26.63 층 그림 창 크기 — 위 오른쪽 손잡이를 끌어 조절 · 다시 슬라이스해도 유지
      var grip = document.createElement('i'); grip.className = 'pck-rzs-lgrip'; grip.title = '크기 조절'; grip.textContent = '↗'; w.appendChild(grip); if (st.w) w.style.width = st.w + 'px';
      grip.onpointerdown = function (e) { e.preventDefault(); e.stopPropagation(); var x0 = e.clientX, y0 = e.clientY, w0 = w.offsetWidth; grip.setPointerCapture(e.pointerId); grip.onpointermove = function (m) { st.w = Math.round(Math.max(160, Math.min(ov.clientWidth - 96, w0 + Math.max(m.clientX - x0, (y0 - m.clientY) * 16 / 9)))); w.style.width = st.w + 'px'; }; grip.onpointerup = function () { grip.onpointermove = grip.onpointerup = null; }; };
      function apply() {
        w.classList.toggle('full', st.full && !st.hide); box.hidden = st.hide;
        var h = bt('hide'), f = bt('full'); h.textContent = st.hide ? '🙈 층 그림' : '👁'; h.title = st.hide ? '층 그림 보이기' : '층 그림 숨기기'; h.setAttribute('aria-label', h.title);
        f.textContent = st.full ? '⛶ 작게' : '⛶'; f.title = st.full ? '층 그림 작게' : '층 그림 전체보기'; f.setAttribute('aria-label', f.title);
        bt('in').hidden = bt('out').hidden = f.hidden = st.hide;
        var tw = st.full || st.z > 1 ? 1440 : 480; if (cv.width !== tw) { cv.width = tw; cv.height = tw * 9 / 16; if (RSL.redraw) RSL.redraw(); }
        cv.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.z + ')'; cv.style.cursor = st.z > 1 ? 'grab' : '';
      }
      function zoom(k) {
        var z = Math.max(1, Math.min(12, st.z * k)), f = z / st.z, cx = box.clientWidth / 2, cy = box.clientHeight / 2;
        st.x = z === 1 ? 0 : (st.x - cx) * f + cx; st.y = z === 1 ? 0 : (st.y - cy) * f + cy; st.z = z; apply();
      }
      bt('hide').onclick = function () { st.hide = !st.hide; apply(); };
      bt('in').onclick = function () { zoom(1.5); }; bt('out').onclick = function () { zoom(1 / 1.5); };
      bt('full').onclick = function () { st.full = !st.full; st.z = 1; st.x = st.y = 0; apply(); };
      box.addEventListener('wheel', function (e) { e.preventDefault(); zoom(e.deltaY > 0 ? 1 / 1.25 : 1.25); }, { passive: false });
      cv.onpointerdown = function (e) { if (st.z <= 1) return; pan = [e.clientX - st.x, e.clientY - st.y]; try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
      cv.onpointermove = function (e) { if (!pan) return; st.x = e.clientX - pan[0]; st.y = e.clientY - pan[1]; apply(); };
      cv.onpointerup = cv.onpointercancel = function () { pan = null; };
      apply();
    }
    /** 0.26.25 스크롤해도 3D 는 헤더 바로 아래에 머묾 — 사이트 헤더 높이는 화면마다 달라 재서 씀 */
    function headBottom() {
      var y = 2, b = 0, x = innerWidth / 2, i, j;
      for (i = 0; i < 4; i++) {
        var els = document.elementsFromPoint(x, y), hit = 0;
        for (j = 0; j < els.length; j++) { var e0 = els[j]; while (e0 && e0 !== document.documentElement) { var ps = getComputedStyle(e0).position; if ((ps === 'fixed' || ps === 'sticky') && !e0.contains(el) && !el.contains(e0)) { var r0 = e0.getBoundingClientRect(); if (r0.bottom > y && r0.height < innerHeight * 0.5) hit = Math.max(hit, r0.bottom); } e0 = e0.parentElement; } }
        if (!hit) break; b = hit; y = hit + 2;
      }
      return b;
    }
    var vhUntil = Date.now() + 2500;
    function stick() {
      var v = q('#prz-view'); if (!v || !document.contains(v)) { removeEventListener('scroll', stickSoon, true); removeEventListener('resize', stickSoon); return; }
      if (document.fullscreenElement === v || v.classList.contains('fs')) return;
      if (innerWidth <= 900) { v.style.top = v.style.height = ''; v.classList.remove('stuck'); return; }
      var b = headBottom(); v.classList.add('stuck'); v.style.top = (b + 8) + 'px'; if (Date.now() < vhUntil) v.style.height = Math.max(360, innerHeight - b - 52) + 'px';   // 0.26.38 처음 · 창 크기가 바뀔 때만 잼 — 스크롤로는 안 변함 · 오른쪽 칸이 끝나면 뷰어도 같이 헤더 밑으로
    }
    var stickT = 0; function stickSoon() { if (!stickT) stickT = requestAnimationFrame(function () { stickT = 0; stick(); }); }
    addEventListener('scroll', stickSoon, { capture: true, passive: true }); addEventListener('resize', stickSoon); addEventListener('resize', function () { vhUntil = Date.now() + 400; if (G) { G.V.ref = 0; G.draw(); } }); setTimeout(stick, 0); setTimeout(stick, 1500);
    S.act = false;
    document.addEventListener('pointerdown', function (e) { S.act = !!(S.root && S.root.contains(e.target)); tabLook(); }, true);
    document.addEventListener('focusin', function () { if (!S.root.contains(document.activeElement)) S.act = false; tabLook(); }, true);
    window.addEventListener('blur', tabLook); window.addEventListener('focus', tabLook);
    G = viewer(q('#prz-gl')); if (G) { G.V.at = 1e9; G.V.top = 1e9; G.onTool({ down: gizDown, move: gizMove, up: gizUp }); plMount(); }
    Promise.all([core(), api('GET', '/config'), api('GET', '/printers?resin=1').catch(function () { return { data: { items: [] } }; })]).then(function (r) {
      S.cfg = r[1].data; S.cfg.rprinters = r[2].data.items || []; RSL = ui({ edits: function () { if (!S.edits || !S.edits.list.length) return null; var p = S.pos || [0, 0]; return S.edits.list.map(function (e) { return { p: [e.p[0] + p[0], e.p[1] + p[1], e.p[2]], gone: e.gone, tip: e.tip, body: e.body }; }); }, pins: function () { var p = S.pos || [0, 0], o = pinsNow().map(function (c) { return [c[0] + p[0], c[1] + p[1], c[2]]; }); (S.peers || []).forEach(function (k) { (k.pins || []).forEach(function (c) { o.push([c[0] + k.p[0], c[1] + k.p[1], c[2]]); }); }); return o; }, plateTris: plateTris, plFilled: plFilled, plGo: plGo, plSups: plSups, plSig: plSig, plCur: function () { return PL.cur; }, S: S, q: q, qa: qa, ic: ic, esc: esc, n1: n1, toast: toast, API: API, V: V, api: api }); RSL.panel(); plate();
      var pr = q('#prz-printer'), hook = function () { plate(); };
      q('#pck-rslice').addEventListener('change', function (e) { if (e.target && e.target.id === 'prz-printer') setTimeout(hook, 0); });
      q('#prz-open').onclick = function () { q('#prz-fin').click(); };
      q('#prz-fit').onclick = function () { if (G) G.fit(); };
      q('#prz-fs').onclick = function () {   // 0.26.26 3D 전체화면
        var v = q('#prz-view'); if (document.fullscreenElement) { document.exitFullscreen(); return; }
        if (v.classList.contains('fs')) { v.classList.remove('fs'); G.V.ref = 0; stickSoon(); G.draw(); return; }
        var box = function () { if (!document.fullscreenElement) { v.classList.add('fs'); stickSoon(); } };   // 0.26.28 답 없는 창(앱 안 브라우저 등)은 창 가득 채우기로
        if (!v.requestFullscreen) { box(); return; }
        v.requestFullscreen().catch(box); setTimeout(box, 600);
      };
      document.addEventListener('fullscreenchange', stickSoon);
      q('#prz-zi').onclick = function () { if (G) G.zoom(0.8); }; q('#prz-zo').onclick = function () { if (G) G.zoom(1.25); };
      qa('[data-act]').forEach(function (b) { b.onclick = function () { actions[b.getAttribute('data-act')](); }; });
      qa('[data-tool]').forEach(function (b) { b.onclick = function () { var t0 = b.getAttribute('data-tool'); S.tool = S.tool === t0 ? null : t0; qa('[data-tool]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tool') === S.tool); }); tool(); }; });
      // 0.26.19 ☁️ 내 저장소 (웹저장소 연결이 켜진 사이트만)
      var clTry = 0, clT = setInterval(function () {
        var C = window.G7Cloud; if (++clTry > 40) clearInterval(clT); if (!C || typeof C.pick !== 'function') return; clearInterval(clT);
        var icons = C.icons || {}, ready = {}; try { ready = (C.cfg && C.cfg().ready) || {}; } catch (e) {}
        var html = (ready.google && icons.google) || icons.cloud || (ready.onedrive && icons.onedrive) || '☁️';
        qa('.pck-rzs-cloud').forEach(function (b) { b.innerHTML = html; b.hidden = false; b.onclick = function (e) { e.preventDefault(); e.stopPropagation();
          Promise.resolve(C.pick({ accept: '.stl,.obj,.3mf', choose: e.shiftKey })).then(function (got) { var x = Array.isArray(got) ? got[0] : got; if (x) open(x instanceof File ? x : new File([x.blob || x], x.name || 'model.stl')); }).catch(function (er) { if (er && !/취소|cancel/i.test(String(er.message || er))) toast('☁️ ' + (er.message || er), true); }); }; });
      }, 250);
      q('#prz-fin').onchange = function () { openAll(this.files); this.value = ''; };
      qa('[data-v]').forEach(function (b) { b.onclick = function () { if (!b.disabled) seg(b.getAttribute('data-v')); }; });
      var d = q('#prz-view'); d.ondragover = function (e) { e.preventDefault(); d.classList.add('on'); }; d.ondragleave = function () { d.classList.remove('on'); };
      d.ondrop = function (e) { e.preventDefault(); d.classList.remove('on'); openAll(e.dataTransfer.files); };
      if (pend) { use(pend[0], pend[1], pend[2]); pend = null; }
    }).catch(function (e) { q('#pck-rslice').innerHTML = '<p class="pck-hint">⚠️ ' + esc(e.message) + '</p>'; });
    return { seed: function (f, tris, scale) { if (!tris || tris === S.tris) return; if (RSL) use(f, tris, scale); else pend = [f, tris, scale]; } };
  }

  return { mount: mount, autoTilt: autoTilt, audit: audit, raftShape: raftShape, raftCarve: raftCarve, rotMat: rotMat, axisMat: axisMat, mat3: mat3, eulerOf: eulerOf, turned: turned, sizeOf: sizeOf, bodyFor: bodyFor, PRINTERS: PRINTERS, findPrinter: findPrinter, params: params, printSeconds: printSeconds, tipFor: tipFor, supportMesh: supportMesh, stlOf: stlOf, slice: slice, write: write, gooLayer: gooLayer, pw0Layer: pw0Layer, unite: unite, cutOut: cutOut, worker: worker, ui: ui };
});
