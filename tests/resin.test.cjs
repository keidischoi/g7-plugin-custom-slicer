/* 레진 슬라이스 검사 — node tests/resin.test.cjs (0.1.84 출력 검사기에서 옮겨 옴)
 * 계산 코어는 출력 검사기 것 — 옆 폴더(../g7-plugin-custom-print_check)에 있어야 함 */
'use strict';
const R = require('../web/resin/resin.cjs');
const C = require('../../g7-plugin-custom-print_check/resources/assets/print-check-core.js');
let pass = 0, fail = 0;
const ok = (c, l) => { (c ? pass++ : fail++); console.log((c ? 'ok   ' : 'FAIL ') + l); };
const near = (a, b, e = 0.03) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

/** 상자 삼각형 (가운데 0,0 · 바닥 z0) — 법선 바깥 */
function box(w, d, h, z0 = 0, cx = 0, cy = 0) {
  const x = [cx - w / 2, cx + w / 2], y = [cy - d / 2, cy + d / 2], z = [z0, z0 + h], v = (a, b, c) => [x[a], y[b], z[c]], out = [];
  const q = (a, b, c, e) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  q(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)); q(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1));
  q(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)); q(v(1, 1, 0), v(0, 1, 0), v(0, 1, 1), v(1, 1, 1));
  q(v(0, 1, 0), v(0, 0, 0), v(0, 0, 1), v(0, 1, 1)); q(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1));
  return Float32Array.from(out);
}
const P = { name: 'T', px: [1000, 500], mm: [100, 50], z: 100, ext: 'goo' };
const cat = (parts) => { const n = parts.reduce((s, p) => s + p.length, 0), u = new Uint8Array(n); let a = 0; for (const p of parts) { u.set(p, a); a += p.length; } return u; };

// 합치기 · 빼기
ok(R.unite([0, 5, 10, 12], [4, 11]).join() === '0,12', '구간 합치기');
ok(R.cutOut([0, 10], [2, 3, 5, 6]).join() === '0,2,3,5,6,10', '구간 빼기');
ok(R.cutOut([0, 10], [0, 10]).length === 0, '전부 빼기');

// 꽉 찬 상자 — 면적 · 부피 · 층 수
const q = R.params({ exposure_s: 2, bottom_exposure_s: 20, bottom_layers: 4, lift_mm: 5, bottom_lift_mm: 5, lift_speed: 1, bottom_lift_speed: 1, retract_speed: 5, light_off_s: 1 });
let s = R.slice(box(20, 10, 5), { printer: P, layer: 0.05, mirror: false }, null);
ok(s.count === 100, '층 수');
ok(near(s.areas[50], 200) && near(s.volume, 1000), '면적 200 · 부피 1000');
ok(s.layers[0].length === 200, '줄마다 구간 하나 (10mm = 100줄)');
const pos = (r) => [Math.floor(r / 1000), r % 1000];
ok(pos(s.layers[0][0])[1] === 400 && s.layers[0][1] === 200, '가로 가운데');
ok(pos(s.layers[0][0])[0] === 200, '세로 가운데');

// 치우친 상자 — 뒤집기 방향
const off = box(10, 10, 1, 0, 30, 15);
let a = R.slice(off, { printer: P, layer: 0.05, mirror: false }, null), b = R.slice(off, { printer: P, layer: 0.05, mirror: true }, null);
ok(pos(a.layers[0][0])[1] === 750 && pos(a.layers[0][0])[0] === 50, '+Y 는 그림 위쪽 · +X 오른쪽');
ok(pos(b.layers[0][0])[1] === 150 && pos(b.layers[0][0])[0] === 50, '뒤집으면 왼쪽으로');

// 빈 상자(안쪽 면이 뒤집힌 안 상자) — 도넛 단면
const inner = box(10, 10, 3, 1); for (let i = 0; i < inner.length; i += 9) for (const k of [0, 1, 2]) { const t = inner[i + 3 + k]; inner[i + 3 + k] = inner[i + 6 + k]; inner[i + 6 + k] = t; }
const donut = new Float32Array(box(20, 20, 5).length + inner.length); donut.set(box(20, 20, 5)); donut.set(inner, box(20, 20, 5).length);
s = R.slice(donut, { printer: { ...P, px: [1000, 1000], mm: [100, 100] }, layer: 0.05, mirror: false }, null);
ok(near(s.areas[50], 300) && near(s.areas[5], 400), '안쪽 빈 곳은 칠하지 않음');

// 속 비우기 · 구멍
s = R.slice(box(30, 30, 20), { printer: { ...P, px: [1000, 1000], mm: [100, 100] }, layer: 0.1, mirror: false, hollow: true, wall: 2, holes: 2, hole: 3 }, null);
ok(s.holes.length === 2, '구멍 두 개');
ok(s.volume < 30 * 30 * 20 * 0.55 && s.volume > 30 * 30 * 20 * 0.25, '속이 비어 부피가 줄어듦');
ok(near(s.areas[100], 900 - 26.5 * 26.5, 0.25), '가운데 층은 벽만 남음');
ok(s.areas[1] < 900 && s.areas[1] > 870, '바닥에 구멍 두 개만큼 빔');

// 서포트 · 뗏목 — 떠 있는 상자
const flt = C.placed(box(20, 20, 2, 0), 'z1');
s = R.slice(flt, { printer: P, layer: 0.05, mirror: false, support: true, spacing: 4, lift: 5, raft: true, raftHoles: false, tip: 0.4, body: 1 }, C);
ok(s.supports > 10, '서포트 기둥');
ok(near(s.top, 7), '모델이 5mm 뜸');
ok(s.areas[2] >= 576 * 0.98, '뗏목은 모델 + 2mm 네모');
{ const th = R.slice(flt, { printer: P, layer: 0.05, mirror: false, support: true, spacing: 4, lift: 5, raft: true, raftH: 2, tip: 0.4, body: 1, fit: false }, C); ok(th.raftMm[4] === 2 && th.raftHoles > 0, '래프트 두께 설정 · 구멍 ' + th.raftHoles); }
ok(s.areas[60] > 0 && s.areas[60] < 100, '기둥만 있는 층');

// GOO — 층 그림 되읽기
function gooRead(u) {
  let i = 1, out = [], at = 0;
  while (i < u.length - 1) { const b = u[i++], c = b >> 6, ex = (b >> 4) & 3; let n = b & 15; if (ex >= 3) n |= u[i++] << 20; if (ex >= 2) n |= u[i++] << 12; if (ex >= 1) n |= u[i++] << 4; if (c === 3) out.push(at, n); at += n; }
  let sum = 0; for (let k = 1; k < u.length - 1; k++) sum = (sum + u[k]) & 255;
  return { runs: out, total: at, ok: ((~sum) & 255) === u[u.length - 1] };
}
s = R.slice(box(20, 10, 1), { printer: P, layer: 0.05, mirror: true }, null);
let g = gooRead(R.gooLayer(s.layers[3], 500000));
ok(g.ok && g.total === 500000, 'GOO 체크섬 · 전체 화소 수');
ok(g.runs.length === s.layers[3].length && g.runs.every((x, i) => x === s.layers[3][i]), 'GOO 되읽으면 같음');
const empty = gooRead(R.gooLayer(new Int32Array(0), 500000)); ok(empty.total === 500000 && !empty.runs.length, 'GOO 빈 층');

// GOO 파일 모양
const v = (u, p) => new DataView(u.buffer, u.byteOffset);
let f = cat(R.write(s, { printer: P, layer: 0.05, density: 1.1, resinName: 'R' }, q));
const dv = v(f);
ok(String.fromCharCode(...f.slice(0, 4)) === 'V3.0' && f[8] === 0x44, 'GOO 머리');
const hSmall = 12 + 32 + 24 + 24 + 32 + 32 + 32 + 6, afterPrev = hSmall + 116 * 116 * 2 + 2 + 290 * 290 * 2 + 2;
ok(f[hSmall + 116 * 116 * 2] === 0x0D && f[afterPrev - 2] === 0x0D, 'GOO 미리 보기 구분자');
ok(dv.getUint32(afterPrev, false) === 20 && dv.getUint16(afterPrev + 4, false) === 1000 && dv.getUint16(afterPrev + 6, false) === 500, 'GOO 층 수 · 해상도');
ok(near(dv.getFloat32(afterPrev + 10, false), 100) && near(dv.getFloat32(afterPrev + 18, false), 100) && near(dv.getFloat32(afterPrev + 22, false), 0.05), 'GOO 화면 · 층 높이');
ok(dv.getUint32(195470, false) === 195477, 'GOO 머리 크기 = 195477 (공개 표본과 같음)');
const first = dv.getUint32(195470, false);
ok(near(dv.getFloat32(first + 2 + 4 + 4, false), 20) && near(dv.getFloat32(first + 6, false), 0.05), 'GOO 첫 층 = 바닥 노출');
const len = dv.getUint32(first + 66, false), L0 = gooRead(f.slice(first + 70, first + 70 + len));
ok(f[first + 70] === 0x55 && L0.ok && f[first + 70 + len] === 0x0D, 'GOO 첫 층 자료 위치');
ok(String.fromCharCode(...f.slice(-8, -4)) === '\u0007\0\0\0' || f[f.length - 4] === 0x44, 'GOO 꼬리');

// Anycubic — 표 주소 따라 되읽기
function pw0Read(u) { let i = 0, at = 0, out = []; while (i < u.length) { const w = (u[i] << 8) | u[i + 1]; i += 2; const n = w & 0xFFF; if (w >> 12) out.push(at, n); at += n; } return { total: at, runs: out }; }
const AP = { name: 'Anycubic Photon Mono X', px: [1000, 500], mm: [100, 50], z: 100, ext: 'pwmx' };
s = R.slice(box(20, 10, 1), { printer: AP, layer: 0.05, mirror: true }, null);
f = cat(R.write(s, { printer: AP, layer: 0.05, density: 1.1 }, q));
const d2 = new DataView(f.buffer), name = (p) => String.fromCharCode(...f.slice(p, p + 12)).replace(/\0.*/, ''), u32 = (p) => d2.getUint32(p, true);
ok(name(0) === 'ANYCUBIC' && u32(12) === 516 && u32(16) === 8, 'Anycubic 머리 · 버전');
ok(name(u32(20)) === 'HEADER' && u32(u32(20) + 12) === 84, 'HEADER 표');
ok(near(d2.getFloat32(u32(20) + 16, true), 100) && near(d2.getFloat32(u32(20) + 20, true), 0.05) && u32(u32(20) + 16 + 44) === 1000, 'HEADER 값');
ok(name(u32(28)) === 'PREVIEW', 'PREVIEW 표');
ok(u32(u32(32) + 4) === 16 && f[u32(32) + 8] === 255, '색 표');
const ld = u32(36); ok(name(ld) === 'LAYERDEF' && u32(ld + 16) === 20, 'LAYERDEF 표');
ok(name(u32(40)) === 'EXTRA' && name(u32(44)) === 'MACHINE', 'EXTRA · MACHINE 표');
const first2 = ld + 20, ad = u32(first2), ln = u32(first2 + 4), rr = pw0Read(f.slice(ad, ad + ln));
ok(ad === u32(48) && rr.total === 500000, 'PW0 전체 화소 수');
ok(rr.runs.length === s.layers[0].length && rr.runs.every((x, i) => x === s.layers[0][i]), 'PW0 되읽으면 같음');
ok(near(d2.getFloat32(first2 + 16, true), 20) && near(d2.getFloat32(first2 + 32 + 16, true), 20), 'Anycubic 첫 층 노출');
ok(near(d2.getFloat32(first2 + 32 * 5 + 16, true), 2), 'Anycubic 바닥 뒤 노출');
const last = first2 + 19 * 32; ok(u32(last) + u32(last + 4) === f.length, 'Anycubic 끝 = 파일 끝');

// 값 · 시간 · 끝 굵기
ok(q.exposure === 2 && q.bottomLayers === 4, '프로필 값');
ok(R.params({ exposure_s: 2 }, { exp: 3 }).exposure === 3, '직접 넣은 값이 우선');
{ const b = R.params({ lift_mm: 5, lift_speed: 1 }); ok(b.bottomLift === 8 && b.bottomLiftSpeed === 0.5, '바닥 올림 기본값은 더 높이 · 천천히'); ok(R.params({}, { blift: 12, bls: 0.7 }).bottomLift === 12, '바닥 올림 직접 입력'); { const h = R.params({ lift_mm: 5, lift_speed: 1 }, { blift: 20 }); ok(R.printSeconds(h, 5) > R.printSeconds(b, 5), '바닥 층 올림이 시간에 들어감'); } }
// 나무 가지 — 큰 판 밑에 기둥 하나 · 가지가 기둥을 뚫으면 안 됨
{ const qd = (t, a, b, c, d) => t.push(...a, ...b, ...c, ...a, ...c, ...d);
  const bx = (t, x0, x1, y0, y1, z0, z1) => { qd(t, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]); qd(t, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); qd(t, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); qd(t, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]); qd(t, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]); qd(t, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); };
  const m = []; bx(m, -20, 20, -20, 20, 25, 28); bx(m, -3, 3, -3, 3, 0, 25); const tri = Float32Array.from(m);
  const st = C.supports(tri, { spacing: 4, overhangAngle: 45 }), tr = C.supports(tri, { spacing: 4, overhangAngle: 45, tree: true, body: 1 });
  ok(tr.limbs.length > 10 && tr.trunks.length > 0, '가지가 줄기로 모임 ' + tr.limbs.length + '/' + tr.trunks.length);
  ok(tr.trunks.length + tr.count < st.count, '판에 닿는 기둥이 줄어듦 ' + (tr.trunks.length + tr.count) + ' < ' + st.count);
  ok(tr.limbs.length + tr.count <= st.count, '서포트 끝 수는 그대로거나 줄어듦');
  ok(tr.trunks.every((b) => Math.abs(b[0]) > 3 + b[3] / 2 || Math.abs(b[1]) > 3 + b[3] / 2), '줄기가 모델을 안 뚫음');
  ok(tr.limbs.every((l) => { for (let w = 0; w <= 1; w += 0.05) { const x = l[0] + (l[3] - l[0]) * w, y = l[1] + (l[4] - l[1]) * w; if (Math.abs(x) < 3 && Math.abs(y) < 3) return false; } return true; }), '가지가 모델을 안 뚫음');
  ok(tr.limbs.every((l) => Math.hypot(l[0] - l[3], l[1] - l[4]) <= l[2] - 1.5 - l[5] + 0.01), '가지 기울기 45° 이내');
  const m2 = []; bx(m2, -10, 10, -10, 10, 0, 5); bx(m2, -20, 20, -20, 20, 15, 18); const t2 = Float32Array.from(m2), all = C.supports(t2, { spacing: 4 }), only = C.supports(t2, { spacing: 4, plateOnly: true });
  ok(all.onModel > 0 && only.onModel === 0 && only.count === all.count - all.onModel, '판에서만 — 모델 위 기둥 빠짐 ' + only.count + '/' + all.count);
  const m4 = []; bx(m4, 0, 40, 0, 20, 0, 10); const b4 = Float32Array.from(m4), t4 = R.turned(C, b4, 'z1', [90, 0, 0]), d4 = R.sizeOf(t4), lo = Math.min(...t4.filter((v, i) => i % 3 === 2));
  ok(near(d4[0], 40, 0.01) && near(d4[1], 10, 0.01) && near(d4[2], 20, 0.01) && near(lo, 0, 0.01), '회전 뒤 크기 · 바닥 ' + d4.map((v) => v.toFixed(1)));
  { const a = R.sizeOf(R.turned(C, b4, 'z1', [0, 0, 90])); ok(near(a[0], 20, 0.01) && near(a[1], 40, 0.01), 'Z 회전'); const z = R.turned(C, b4, 'z1', [0, 0, 0]), p = C.placed(b4, 'z1'); ok(z.every((v, i) => v === p[i]), '회전 0 은 그대로'); }
  { const r = [20, -35, 110], e = R.eulerOf(R.rotMat(r)); ok(e.every((v, i) => near(v, r[i], 0.11)), '각도 ↔ 행렬 ' + e); const b5 = R.turned(C, b4, 'z1', r), m5 = R.turned(C, b4, 'z1', R.eulerOf(R.mat3(R.axisMat(2, 0), R.rotMat(r)))); ok(b5.every((v, i) => near(v, m5[i], 0.05)), '행렬 회전이 turned 와 같음'); }
  { const m6 = []; bx(m6, -50, 50, -50, 50, 70, 74); const p6 = Float32Array.from(m6), s6 = C.supports(p6, { spacing: 4, overhangAngle: 45 }), t6 = C.supports(p6, { spacing: 4, overhangAngle: 45, tree: true, body: 1 });
    ok(t6.links.length > 0 && t6.trunks.length + t6.count <= 12, '여러 단으로 합쳐 판 기둥 최소화 ' + (t6.trunks.length + t6.count) + ' / ' + s6.count);
    ok(t6.links.every((l) => Math.hypot(l[0] - l[3], l[1] - l[4]) <= l[2] - l[5] + 0.01 && l[6] <= 4), '합치는 가지도 45° 이내'); ok(t6.trunks.every((b) => b[3] <= 4), '줄기 4 mm 이하'); }
  const P2 = R.PRINTERS.find((x) => x.ext);
  const m3 = []; bx(m3, -20, 20, -20, -10, 5, 10); bx(m3, -20, -10, -10, 20, 5, 10); const l3 = R.slice(Float32Array.from(m3), { printer: P2, layer: 0.2, mirror: false, support: false, lift: 0, raft: true, tip: 0.4, body: 1 }, C);
  { const w3 = R.slice(Float32Array.from(m3), { printer: P2, layer: 0.2, mirror: false, support: false, lift: 0, raft: true, raftWedge: true, tip: 0.4, body: 1 }, C);
    ok(w3.areas[0] < w3.areas[2] && w3.areas[2] < w3.areas[4] && near(w3.areas[0], l3.areas[1], 0.02), '래프트 쐐기 — 판 쪽이 좁고 위로 갈수록 넓음 ' + Math.round(w3.areas[0]) + ' → ' + Math.round(w3.areas[4])); }
  ok(l3.areas[1] > 700 + 200 && l3.areas[1] < 44 * 44 * 0.75, '래프트가 ㄱ 모양을 따라감 ' + Math.round(l3.areas[1]) + ' mm²'); const a = R.slice(tri, { printer: P2, layer: 0.2, mirror: false, support: true, spacing: 4, lift: 0, raft: false, tip: 0.4, body: 1 }, C), b = R.slice(tri, { printer: P2, layer: 0.2, mirror: false, support: true, tree: true, spacing: 4, lift: 0, raft: false, tip: 0.4, body: 1 }, C);
  ok(b.limbs.length > 10 && b.volume < a.volume, '나무 서포트 레진이 적음 ' + Math.round(b.volume) + ' < ' + Math.round(a.volume));
}
ok(R.params(null).exposure > 0, '프로필 없어도 값 있음');
ok(near(R.printSeconds(q, 10), 4 * 27 + 6 * 9), '출력 시간');
ok(R.tipFor({ count: 200, tensile: 40, maxAreaMm2: 1500, grams: 47 }) >= 0.4, '47 g 모델은 끝 0.4 이상');
ok(R.tipFor({ count: 83, maxAreaMm2: 1500, grams: 17.5 }) <= 0.4, '17 g 모델 끝이 너무 굵지 않음');
ok(R.tipFor({ count: 60, maxAreaMm2: 300, grams: 2 }) < R.tipFor({ count: 300, maxAreaMm2: 3000, grams: 200 }), '무거우면 굵게');
ok(R.bodyFor(0.5, 40) <= 1.2 && R.bodyFor(0.5, 40) >= 0.9 && R.bodyFor(0.3, 5) >= 0.8 && R.bodyFor(0.6, 300) <= 2, '기둥 굵기');
ok(R.tipFor({ count: 10, tensile: 40, maxAreaMm2: 4000, grams: 100 }) > R.tipFor({ count: 200, tensile: 40, maxAreaMm2: 4000, grams: 100 }), '끝이 적으면 굵게');
ok(R.findPrinter('Elegoo Saturn 3 Ultra').px[0] === 11520 && R.findPrinter('Saturn 3 Ultra').name === 'Elegoo Saturn 3 Ultra', '프린터 찾기');
ok(R.findPrinter('없는 프린터') === null, '없는 프린터');
ok(R.PRINTERS.every((p) => p.px[0] > 0 && p.mm[0] > 0 && p.z > 0 && p.ext), '프린터 표');

console.log('통과 ' + pass + ' · 실패 ' + fail);
process.exitCode = fail ? 1 : 0;
// 0.26.2 불러오기 V 가 버전과 다르면 옛 v 로 영구 캐시된 화면이 남음 (0.24.2 때 탭이 안 보였음)
{ const m = R.supportMesh({ cols: [[0, 0, 10, 0, 0], [5, 0, 10, 2, 1]], limbs: [[3, 3, 12, 0, 0, 6]], links: [[0, 0, 8, 2, 2, 12, 1]], tip: 0.4, body: 1, raftMm: [0, 4, 0, 4, 1], raftRuns: [0, 4, 0, 4, 0, 1] }), edges = new Map();
  const vol = (p) => { let v = 0; for (let i = 0; i + 8 < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6; return v; };
  ok(m.sup.length % 9 === 0 && vol(m.sup) > 0 && near(vol(m.raft), 16, 0.01), '서포트 메시 — 바깥을 보는 닫힌 모양 ' + vol(m.sup).toFixed(1));
  const one = []; R.supportMesh({ cols: [[0, 0, 10, 0, 1]], tip: 0.4, body: 1 }).sup.forEach((v) => one.push(+v.toFixed(4)));
  for (let i = 0; i < one.length; i += 9) for (let e = 0; e < 3; e++) { const a = one.slice(i + e * 3, i + e * 3 + 3).join(), b = one.slice(i + (e + 1) % 3 * 3, i + (e + 1) % 3 * 3 + 3).join(); if (a !== b) edges.set(a + '|' + b, 1); }
  let open = 0; for (const k of edges.keys()) { const [a, b] = k.split('|'); if (!edges.has(b + '|' + a)) open++; }
  ok(open === 0, '서포트 기둥은 틈 없이 닫힘 · 열린 모서리 ' + open);
  const b = R.stlOf([[0, 0, 0, 1, 0, 0, 0, 1, 0], m.raft]), dv = new DataView(b); ok(b.byteLength === 84 + dv.getUint32(80, true) * 50 && dv.getUint32(80, true) === 1 + m.raft.length / 9 && dv.getFloat32(92, true) === 1, 'STL 묶음 — 크기 · 삼각형 수 · 법선'); }
{ const V = [[0, 0, 5], [20, 0, 5], [20, 20, 5], [0, 20, 5], [0, 0, 25], [20, 0, 25], [20, 20, 25], [0, 20, 25]], F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], p = new Float32Array(F.flatMap((t) => t.flatMap((i) => V[i])));
  const a = C.supports(p, { spacing: 3 }), b = C.supports(p, { spacing: 3, extra: [[1.3, 1.7, 5], [15.1, 15.2, 5]] }), c = C.supports(p, { spacing: 3, plateOnly: true, extra: [[1.3, 1.7, 5]] }), d = C.supports(p, { spacing: 3, max: 4, extra: [[1.3, 1.7, 5]] });
  ok(b.count === a.count + 2 && Math.abs(b.cols[(b.count - 1) * 5] - 15.1) < 1e-4, '직접 찍은 서포트 ' + a.count + ' → ' + b.count);
  ok(c.count === a.count + 1 && Math.abs(d.cols[(d.count - 1) * 5] - 1.3) < 1e-4, '직접 찍은 자리는 개수 제한에도 남음');
  const e = C.supports(p, { spacing: 3, plateOnly: true, extra: [[20, 10, 15]] }), e0 = C.supports(p, { spacing: 3, plateOnly: true });
  ok(e.onModel === 0 && e.count === e0.count && e.limbs.length === e0.limbs.length + 1 && e.limbs[e.limbs.length - 1][0] === 20, '「판에서만」 — 옆면에 찍은 자리도 모델 위에 안 세우고 가지로');
  const g = C.supports(p, { spacing: 3, plateOnly: true, extra: [[20, 10, 15]], within: () => false }); ok(g.onModel === 0 && g.missedPin === 1, '찍은 자리가 닿지 못하면 따로 셈'); }
{ const p = new Float32Array([0, 0, 10, 20, 0, 11, 0, 20, 10]), a = C.supports(p, { spacing: 30 }), b = C.supports(p, { spacing: 30, extra: [[5, 5, 10.25]] });
  ok(b.count === a.count + 1, '살짝 위를 보는 면에 찍어도 서포트가 생김 ' + a.count + ' → ' + b.count); }
{ const A = [10, 10, 5], B = [[8, 8, 25], [12, 8, 25], [12, 12, 25], [8, 12, 25]], tri = [];
  for (let i = 0; i < 4; i++) tri.push(...A, ...B[(i + 1) % 4], ...B[i]);
  tri.push(...B[0], ...B[1], ...B[2], ...B[0], ...B[2], ...B[3]);
  const a = C.supports(new Float32Array(tri), { spacing: 3, overhangAngle: 45 });
  ok(a.count >= 1 && Math.abs(a.cols[0] - 10) < 0.01 && Math.abs(a.cols[2] - 5) < 0.01, '아래로 뾰족한 끝은 가팔라도 서포트 ' + a.count);
  const pit = []; for (let i = 0; i < 4; i++) pit.push(...[10, 10, 5], ...B[i].slice(0, 2), 10, ...B[(i + 1) % 4].slice(0, 2), 10);
  ok(C.supports(new Float32Array(pit), { spacing: 3 }).count === 0, '위로 팬 구덩이 바닥은 받치지 않음'); }
{ const spike = (x, y, z) => { const b = [[x - 2, y - 2, z + 20], [x + 2, y - 2, z + 20], [x + 2, y + 2, z + 20], [x - 2, y + 2, z + 20]], t = []; for (let i = 0; i < 4; i++) t.push(x, y, z, ...b[(i + 1) % 4], ...b[i]); t.push(...b[0], ...b[1], ...b[2], ...b[0], ...b[2], ...b[3]); return t; };
  const floor = [0, 0, 1, 60, 0, 1, 0, 60, 1], a = C.supports(new Float32Array([...spike(10, 10, 5), ...floor]), { spacing: 3, plateOnly: true });
  ok(a.onModel === 0 && a.missed >= 1, '「판에서만」 — 판으로 못 내려가면 모델 위에 안 세우고 못 받친 곳으로 셈 ' + a.missed);
  const b0 = C.supports(new Float32Array([...spike(10, 10, 30), 7, 7, 8, 13, 7, 8, 7, 13, 8]), { spacing: 3, plateOnly: true });
  ok(b0.onModel === 0 && b0.limbs.length >= 1 && b0.trunks.length >= 1, '「판에서만」 — 막히면 옆 빈 곳에서 가지로 받침 ' + b0.limbs.length);
  const b1 = C.supports(new Float32Array([...spike(10, 10, 30), 7, 7, 8, 13, 7, 8, 7, 13, 8]), { spacing: 3, plateOnly: true, within: () => false });
  ok(b1.trunks.length === 0 && b1.missed >= 1, '뗏목 밖에는 줄기를 세우지 않음');
  const sl = []; for (let x = 0; x < 30; x += 3) sl.push(x, 0, 10 + x, x, 30, 10 + x, x + 3, 0, 13 + x, x + 3, 0, 13 + x, x, 30, 10 + x, x + 3, 30, 13 + x);
  const th = C.supports(new Float32Array(sl), { spacing: 1, overhangAngle: 60, thin: 2 }), tn = C.supports(new Float32Array(sl), { spacing: 1, overhangAngle: 60, thin: 0 });
  ok(th.count < tn.count && th.count > 0, '기운 면은 겹치는 기둥을 덜어냄 ' + th.count + '/' + tn.count);
  const plate = [0, 0, 10, 0, 40, 10, 40, 0, 10, 40, 0, 10, 0, 40, 10, 40, 40, 10], b = C.supports(new Float32Array([...plate, ...spike(100, 100, 5)]), { spacing: 1, max: 10 }), xs = []; for (let i = 0; i < b.cols.length; i += 5) xs.push(b.cols[i]);
  ok(xs.length > 3 && xs.includes(100), '서포트를 솎아도 뾰족한 끝은 남음 ' + xs.length);
  const up = [0, 0, 20, 0, 4, 20, 10, 2, 22], c = C.supports(new Float32Array(up), { spacing: 30, overhangAngle: 45 }), hz = []; for (let i = 0; i < c.cols.length; i += 5) hz.push(c.cols[i + 2]);
  ok(hz.includes(22), '위로 휜 오버행의 높은 끝도 받침 ' + hz.join()); }
{ const tip = (x) => { const b = [[x - .4, 8, 25], [x + .4, 8, 25], [x + .4, 12, 25], [x - .4, 12, 25]], t = []; for (let i = 0; i < 4; i++) t.push(x, 10, 5, ...b[(i + 1) % 4], ...b[i]); return t; };
  const a = C.supports(new Float32Array([...tip(10), ...tip(11.2)]), { spacing: 3 }), xs = []; for (let i = 0; i < a.cols.length; i += 5) xs.push(+a.cols[i].toFixed(1));
  ok(xs.includes(10) && xs.includes(11.2), '1 mm 옆에 기둥이 있어도 끝마다 제 기둥 ' + xs.join()); }
{ const box = [0, 0, 5, 40, 0, 5, 40, 40, 5, 0, 0, 5, 40, 40, 5, 0, 40, 5], sh = R.raftShape(new Float32Array(box), [2, 3]), area = (l) => l.reduce((t, ln) => { for (let i = 0; i < ln.length; i += 2) t += ln[i + 1] - ln[i]; return t; }, 0), a0 = area(sh.levels[0]), a1 = area(sh.levels[1]);
  const n = R.raftCarve(sh, [[20, 20, 10, 0, 0], [20, 21, 10, 3, 1]]);
  ok(n > 10 && area(sh.levels[0]) < a0 && area(sh.levels[1]) < a1, '래프트에 구멍이 뚫림 ' + n);
  const row = sh.levels[0][Math.floor((20 - sh.y0) / sh.g)], c = (20 - sh.x0) / sh.g; ok(row.some((_, i) => i % 2 === 0 && c >= row[i] && c < row[i + 1]), '기둥 발 자리는 뚫지 않음');
  const edge = sh.levels[0][Math.floor((-1 - sh.y0) / sh.g)]; ok(edge.length === 2, '가장자리는 막혀 있음'); }
{ const cube = (x, z) => { const q = [[x, 0, z], [x + 4, 0, z], [x + 4, 4, z], [x, 4, z], [x, 0, z + 2], [x + 4, 0, z + 2], [x + 4, 4, z + 2], [x, 4, z + 2]], F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; return F.flatMap((t) => t.flatMap((i) => q[i])); };
  const t = C.supports(new Float32Array([...cube(0, 30), ...cube(8, 30), ...cube(16, 30)]), { spacing: 2, tree: true }), plain = C.supports(new Float32Array([...cube(0, 30), ...cube(8, 30), ...cube(16, 30)]), { spacing: 2 });
  ok(t.links.length > 0 && t.cols.length / 5 + t.trunks.length < plain.count, '나무 가지 — 기둥을 모으고 X 로 묶음 · 보강 ' + t.links.length); ok(t.links.every((l) => l[2] > l[5]), 'X 보강도 위쪽 끝이 먼저 — 슬라이스 · 메시 방향'); ok(plain.links.length > 0 && plain.links.every((l) => l[2] > l[5]), '나무 가지를 꺼도 X 보강 ' + plain.links.length); }
{ const slab = (z0, z1) => { const a = 30, q = [[0, 0, z0], [a, 0, z0], [a, a, z0], [0, a, z0], [0, 0, z1], [a, 0, z1], [a, a, z1], [0, a, z1]], F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; return F.flatMap((t) => t.flatMap((v) => q[v])); };
  const body = 1.4, r = body * 0.6, s = C.supports(new Float32Array([...slab(8, 10), ...slab(12.4, 14)]), { spacing: 3, pinLen: 2, body });
  const inGap = s.heads.filter((h) => h[2] > 12 && h[2] < 12.8 && h[3] > 1 && h[3] < 29 && h[4] > 1 && h[4] < 29);   // 판 바깥으로 나간 마디는 틈에 있지 않음
  ok(inGap.length > 0 && inGap.every((h) => h[5] - r >= 10 && h[5] + r <= 12.4), '좁은 틈의 마디 공이 면에 묻히지 않음 ' + inGap.length + '개 · 마디 ' + (inGap[0] && inGap[0][5].toFixed(2))); ok(s.limbs.every((l) => !l[7] || l[7] >= 0.9), '좁은 틈 가지도 0.9 mm 이상'); }
{ const a = [15, 15, 5], q = [[0, 0, 25], [30, 0, 25], [30, 30, 25], [0, 30, 25]], tri = [];   // 아래로 뾰족한 모델 — 첫 접촉이 모델을 버팀
  for (let i = 0; i < 4; i++) { const u = q[i], v = q[(i + 1) % 4]; tri.push(...a, ...v, ...u); }
  tri.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  for (const tree of [true, false]) { const s = C.supports(new Float32Array(tri), { spacing: 3, pinLen: 2, body: 1.4, tree });
    const first = s.heads.filter((h) => h[2] < 5.5), around = s.heads.filter((h) => h[2] < 9);
    ok(first.length > 0 && first.every((h) => h[8] >= 0.7), '맨 아래 첫 접촉은 끝이 굵음 ' + (first[0] && first[0][8]));
    ok(around.length >= 4, '첫 접촉 둘레에 함께 받치는 핀 ' + around.length + '개');
    ok(first.some((h) => s.thick && s.thick[h[6]] >= 2) || s.limbs.some((l) => l[7] >= 2 && l[2] < 8), '첫 접촉 기둥은 굵음');
    ok(s.heads.every((h) => Math.hypot(h[0] - h[3], h[1] - h[4], h[2] - h[5]) - (h[7] || 0.84) >= 0.35), '마디가 면에서 떨어짐'); } }
{ const E0 = [[30, 30, 50, 8, 8, 8], [30, 30, 32, 10, 7, 14], [24, 30, 10, 3.2, 3.2, 12], [36, 30, 10, 3.2, 3.2, 12], [16, 30, 34, 2.5, 2.5, 10], [44, 30, 34, 2.5, 2.5, 10]];   // 조각이 겹친 피규어
  const fig = (k) => { const E = E0.map((e) => e.map((v) => v * k)), low = Math.min(...E.map((e) => e[2] - e[5])), t = []; E.forEach((e) => { e[2] += 5 - low; const P = (i, j) => { const a = Math.PI * i / 24, f = 2 * Math.PI * j / 36; return [e[0] + e[3] * Math.sin(a) * Math.cos(f), e[1] + e[4] * Math.sin(a) * Math.sin(f), e[2] + e[5] * Math.cos(a)]; }; for (let i = 0; i < 24; i++) for (let j = 0; j < 36; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); t.push(...a, ...b, ...c, ...a, ...c, ...d); } }); return { E, t: new Float32Array(t) }; };
  const inE = (E, x, y, z) => E.some((e) => ((x - e[0]) / e[3]) ** 2 + ((y - e[1]) / e[4]) ** 2 + ((z - e[2]) / e[5]) ** 2 < 0.97);
  const hitsRod = (E, a, b, r) => { const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), m = Math.max(2, Math.ceil(L / 0.5)); let n = 0; for (let i = 0; i <= m; i++) { const w = i / m; for (let d = 0; d < 8; d++) if (inE(E, a[0] + (b[0] - a[0]) * w + Math.cos(d * Math.PI / 4) * r, a[1] + (b[1] - a[1]) * w + Math.sin(d * Math.PI / 4) * r, a[2] + (b[2] - a[2]) * w)) { n++; break; } } return n; };
  const hits = (E, s) => { let n = 0, body = s.body || 1; for (let i = 0; i < s.count; i++) { const c = i * 5; n += hitsRod(E, [s.cols[c], s.cols[c + 1], s.cols[c + 2] - 1], [s.cols[c], s.cols[c + 1], s.cols[c + 3]], (s.thick[i] || body) / 2) ? 1 : 0; } s.limbs.forEach((l) => { const r = (l[7] || body) / 2, B = l[6] || 1.5; n += hitsRod(E, [l[0], l[1], l[2] - B], [l[3], l[4], l[5]], r) ? 1 : 0; }); s.links.forEach((l) => { n += hitsRod(E, [l[0], l[1], l[2]], [l[3], l[4], l[5]], l[6] / 2) ? 1 : 0; }); s.trunks.forEach((b) => { n += hitsRod(E, [b[0], b[1], b[2]], [b[0], b[1], 1], b[3] / 2) ? 1 : 0; }); s.heads.forEach((h) => { const L = Math.hypot(h[0] - h[3], h[1] - h[4], h[2] - h[5]), w = (L - 0.5) / L, k = h[7] || body * 0.52; n += hitsRod(E, [h[3], h[4], h[5]], [h[3] + (h[0] - h[3]) * w, h[4] + (h[1] - h[4]) * w, h[5] + (h[2] - h[5]) * w], 0.15) ? 1 : 0; for (let a = 0; a < 8; a++) if (inE(E, h[3] + Math.cos(a * Math.PI / 4) * k, h[4] + Math.sin(a * Math.PI / 4) * k, h[5])) { n++; break; } }); return n; };
  const o = { spacing: 3, pinLen: 2, body: 1, tip: 0.4, tree: true, plateOnly: true, max: 3000, fit: true };
  const a = fig(1), b = fig(3), sa = C.supports(a.t, o), sb = C.supports(b.t, o);
  { const f3 = fig(3), on = C.supports(f3.t, Object.assign({}, o, { spacing: 1.5, max: 8000 })), off = C.supports(f3.t, Object.assign({}, o, { spacing: 1.5, max: 8000, plateOnly: false }));
    ok(off.heads.length >= on.heads.length * 0.95 && off.missed <= on.missed, '판에서만 꺼도 서포트가 줄지 않음 ' + on.heads.length + '/' + on.missed + ' → ' + off.heads.length + '/' + off.missed); ok(hits(f3.E, { ...off, cols: new Float32Array(0), count: 0 }) === 0, '판에서만 꺼도 겹침 없음'); }
  ok(hits(a.E, sa) === 0, '서포트가 겹친 모델을 뚫지 않음 ' + hits(a.E, sa));
  ok(hits(b.E, sb) === 0, '큰 모델도 뚫지 않음 ' + hits(b.E, sb));
  { const r = 20, N = 40, M = 60, t = [], P = (i, j) => { const u = Math.PI * i / N, v = 2 * Math.PI * j / M; return [40 + r * Math.sin(u) * Math.cos(v), 40 + r * Math.sin(u) * Math.sin(v), 30 + r * Math.cos(u)]; }; for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a2 = P(i, j), b2 = P(i + 1, j), c2 = P(i + 1, j + 1), d2 = P(i, j + 1); t.push(...a2, ...b2, ...c2, ...a2, ...c2, ...d2); } const q = C.supports(new Float32Array(t), o), band = q.heads.filter((h) => h[2] > 30 - r * Math.cos(45 * Math.PI / 180) - 0.5 && h[2] < 30 - r * Math.cos(55 * Math.PI / 180) + 0.5); ok(band.length >= 6, '완만히 기운 면도 받침 ' + band.length); }
  const floats = (q) => {   // 판까지 이어지지 않은 부품 수
    const V = []; q.trunks.forEach((b) => V.push([b[0], b[1], b[2]])); for (let i = 0; i < q.count; i++) V.push([q.cols[i * 5], q.cols[i * 5 + 1], q.cols[i * 5 + 2]]);
    const on = (x, y, z) => V.some((v) => Math.hypot(v[0] - x, v[1] - y) < 0.7 && z <= v[2] + 0.6), L = q.links.slice(); let more = true, left = L.length ? L : [];
    while (more) { more = false; left = left.filter((l) => { if (!on(l[3], l[4], l[5])) return true; V.push([l[0], l[1], l[2]]); more = true; return false; }); }
    const X = q.links.filter((l) => l[7]); V.length = 0; q.trunks.forEach((b) => V.push([b[0], b[1], b[2]])); for (let i = 0; i < q.count; i++) V.push([q.cols[i * 5], q.cols[i * 5 + 1], q.cols[i * 5 + 2]]); q.links.forEach((l) => { if (!l[7]) V.push([l[0], l[1], l[2]]); });
    return left.length + q.limbs.filter((l) => !on(l[3], l[4], l[5])).length + X.filter((l) => !on(l[0], l[1], l[2] - 0.6) || !on(l[3], l[4], l[5] - 0.6)).length; };
  ok(floats(sa) === 0 && floats(sb) === 0, '공중에 뜬 부품 없음 ' + floats(sa) + ' / ' + floats(sb));
  { const p = { spacing: sa.load.spacing, pinLen: 2, body: sa.body || 1, tip: 0.4, tree: true, plateOnly: true, max: 3000, overhangAngle: sa.load.angle, grams: sa.load.grams };
    const base = C.supports(a.t, p), h0 = base.heads.find((h) => !h[8] && h[6] >= 0) || base.heads[5], h1 = base.heads.filter((h) => h !== h0 && !h[8]).pop(), key = (h) => [h[9], h[10], h[11]];
    const e1 = C.supports(a.t, Object.assign({}, p, { edit: [{ p: key(h0), gone: 1 }] }));
    ok(e1.heads.length === base.heads.length - 1 && !e1.heads.some((h) => Math.hypot(h[9] - h0[9], h[10] - h0[10], h[11] - h0[11]) < 0.1), '고른 서포트 지우기 ' + base.heads.length + ' → ' + e1.heads.length);
    ok(floats(e1) === 0, '지워도 끊긴 부품 없음');
    const e2 = C.supports(a.t, Object.assign({}, p, { edit: [{ p: key(h1), tip: 0.6, body: 1.6 }] })), h2 = e2.heads.find((h) => Math.hypot(h[9] - h1[9], h[10] - h1[10], h[11] - h1[11]) < 0.1);
    ok(h2 && h2[8] === 0.6, '고른 서포트 끝 굵기'); ok(h2 && ((h2[6] >= 0 && e2.thick[h2[6]] === 1.6) || e2.limbs.some((l) => l[7] === 1.6)), '고른 서포트 기둥 굵기'); }
  ok(sa.load && sa.load.ratio <= 50, '60 mm 받침 충분 ' + (sa.load && sa.load.ratio));
  ok(sb.heads.length >= 250, '크면 핀을 늘림 ' + sb.heads.length);
  ok(sb.heads.filter((h) => h[8]).length > sa.heads.filter((h) => h[8]).length, '크면 첫 접촉도 늘림');
  ok(sb.heads.every((h) => !h[8] || h[8] <= 0.71), '끝은 그대로');
  ok((sb.body || 1) > 1, '크면 기둥도 굵게 ' + sb.body);
  ok(sa.missed <= 3 && sb.missed <= 20, '못 받친 곳 줄임 ' + sa.missed + ' / ' + sb.missed); }
{ const CC = C, box = [], q = (A, B, C, D) => box.push(...A, ...B, ...C, ...A, ...C, ...D);
  // 45° 기운 밑면을 가진 닫힌 쐐기 — 밑면의 바깥 방향은 (0, 0.707, -0.707)
  const A = [0, 0, 20], B = [40, 0, 20], G = [40, 30, 50], D = [0, 30, 50], E = [0, 0, 50], F = [40, 0, 50];
  q(A, D, G, B); q(E, F, G, D); q(A, B, F, E); box.push(...A, ...E, ...D, ...B, ...G, ...F);
  const r = CC.supports(new Float32Array(box), { spacing: 6, overhangAngle: 50, pinLen: 2 });
  let good = 0; r.heads.forEach((h) => { const L = Math.hypot(h[3] - h[0], h[4] - h[1], h[5] - h[2]); if (Math.abs(h[3] - h[0]) < 0.02 && Math.abs((h[4] - h[1]) / L - 0.7071) < 0.03 && Math.abs((h[5] - h[2]) / L + 0.7071) < 0.03) good++; });
  ok(r.heads.length > 5 && good / r.heads.length > 0.8, '핀이 면에 직각 ' + good + '/' + r.heads.length);
  ok(r.cols[2] < r.heads[0][2], '기둥은 마디에서 멈춤');
  const old = CC.supports(new Float32Array(box), { spacing: 6, overhangAngle: 50 }); ok(!old.heads.length, 'pinLen 없으면 예전 그대로');
  const pm = R.supportMesh({ cols: [[0, 0, 8, 0, 0]], heads: [[3, 0, 10, 0, 0, 8, 0]], tip: 0.4, body: 1 }).sup; let hi = -1e9; for (let i = 2; i < pm.length; i += 3) if (pm[i] > hi) hi = pm[i];
  ok(Math.abs(hi - 10) < 0.25, '3D 에도 핀 끝이 면까지 ' + hi);
  const ps = R.slice(new Float32Array(box), { printer: { ...P, px: [1000, 1000], mm: [100, 100] }, layer: 0.5, mirror: false, support: true, spacing: 6, overhang: 50, lift: 3, tip: 0.4, body: 1 }, CC);
  ok(ps.heads.length > 3 && !ps.areas.some((v, i) => i < 30 && v === 0), '슬라이스에 핀이 들어가고 층이 끊기지 않음 ' + ps.heads.length); }
{ const m = R.supportMesh({ limbs: [[0, 0, 10, 4, 0, 8, 0.1, 0.55]], heads: [[0, 0, 11, 0, 0, 10, -1]], tip: 0.4, body: 1 }).sup; let wide = 0; for (let i = 0; i + 2 < m.length; i += 3) if (m[i + 2] < 9.2 && m[i + 2] > 8.2 && Math.abs(m[i + 1]) > wide) wide = Math.abs(m[i + 1]);
  ok(wide < 0.3, '가는 살은 굵기대로 그려짐 ' + wide);
  const lid = (z0, z1) => { const t = [], q = (A, B, D, E) => t.push(...A, ...B, ...D, ...A, ...D, ...E), a = [0, 0, z0], b = [20, 0, z0], c = [20, 20, z0], d = [0, 20, z0], e = [0, 0, z1], f = [20, 0, z1], g = [20, 20, z1], h = [0, 20, z1]; q(a, d, c, b); q(e, f, g, h); q(a, b, f, e); q(b, c, g, f); q(c, d, h, g); q(d, a, e, h); return t; };
  const tip = [], B = [[18.7, 9, 23], [19.9, 9, 23], [19.9, 11, 23], [18.7, 11, 23]]; for (let i = 0; i < 4; i++) tip.push(19.3, 10, 22, ...B[(i + 1) % 4], ...B[i]);
  const CC = C, slit = [...lid(19.5, 20.8), ...lid(23, 25), ...tip], u = CC.supports(new Float32Array(slit), { spacing: 40, plateOnly: true, body: 1, pinLen: 2, extra: [] });
  ok(u.missedTip <= 1, '좁은 틈의 끝도 받침 (겹칠 수밖에 없는 자리는 놓지 않음) ' + u.limbs.length + ' / 못 받침 ' + u.missedTip); }
{ const W = 100, rect = (x0, x1, y0, y1) => { const o = []; for (let y = y0; y < y1; y++) o.push(y * W + x0, x1 - x0); return o; }, L = (...r) => Int32Array.from(r.flat().map((v, i) => v).reduce((a, _, i, l) => (i % 2 ? a : a.concat([[l[i], l[i + 1]]])), []).sort((p, q) => p[0] - q[0]).flat());
  const body = rect(10, 30, 10, 30), isl = rect(60, 66, 60, 66), tiny = rect(80, 81, 80, 81), near = rect(29, 40, 20, 24);
  const a = R.audit([L(body), L(body), L(body, isl), L(body, isl, tiny)], W, 100, new Float64Array(4));
  ok(a.islands.length === 1 && a.islands[0].l === 2 && Math.abs(a.islands[0].x - 63) < 1 && Math.abs(a.islands[0].y - 63) < 1, '떠 있는 조각을 찾음 ' + a.islands.length);
  ok(R.audit([L(body), L(body, near)], W, 100, new Float64Array(2)).islands.length === 0, '옆으로 붙은 조각은 섬이 아님');
  ok(R.audit([L(rect(10, 12, 10, 12)), L(rect(10, 12, 10, 12), rect(10, 50, 11, 12))], W, 100, new Float64Array(2)).islands.length === 0, '겹치는 곳이 있으면 긴 조각도 섬이 아님');
  const j = R.audit([L(body), L(body), L(body), L(body)], W, 100, Float64Array.from([100, 100, 400, 400]), { skip: 0 });
  ok(j.jumps.length === 1 && j.jumps[0] === 2 && j.peak === 2, '갑자기 넓어지는 층 · 가장 넓은 층');
  ok(R.audit([L(body), L(body)], W, 100, Float64Array.from([10, 500]), { skip: 2 }).jumps.length === 0, '뗏목 층은 넓어져도 위험이 아님'); }
{ const q = (t, A, B, D, E) => t.push(...A, ...B, ...D, ...A, ...D, ...E), box = (a, b, c) => { const t = [], p = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]]; q(t, p[0], p[3], p[2], p[1]); q(t, p[4], p[5], p[6], p[7]); q(t, p[0], p[1], p[5], p[4]); q(t, p[1], p[2], p[6], p[5]); q(t, p[2], p[3], p[7], p[6]); q(t, p[3], p[0], p[4], p[7]); return t; };
  // 메시 수리
  const good = box(20, 20, 20), bad = good.slice(); [bad[9], bad[12]] = [bad[12], bad[9]]; [bad[10], bad[13]] = [bad[13], bad[10]]; [bad[11], bad[14]] = [bad[14], bad[11]];   // 한 면 뒤집힘
  const holed = good.slice(0, 9 * 10).concat(good.slice(9 * 11)), dup = good.concat(good.slice(0, 9)).concat([1, 1, 1, 1, 1, 1, 1, 1, 1]), inv = []; for (let i = 0; i < good.length; i += 9) inv.push(...good.slice(i, i + 3), ...good.slice(i + 6, i + 9), ...good.slice(i + 3, i + 6));
  const r1 = C.repair(new Float32Array(bad)), r2 = C.repair(new Float32Array(holed)), r3 = C.repair(new Float32Array(dup)), r4 = C.repair(new Float32Array(inv)), r0 = C.repair(new Float32Array(good));
  const vol = (t) => { let v = 0; for (let i = 0; i < t.length; i += 9) v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6; return v; };
  ok(r0.changed === 0 && r0.t.length === good.length, '멀쩡한 모델은 그대로');
  ok(r1.flipped === 1 && Math.abs(vol(r1.t) - 8000) < 1, '뒤집힌 면 바로잡음 ' + r1.flipped + ' · 부피 ' + vol(r1.t));
  ok(r2.holes === 1 && C.analyze(r2.t).open === 0 && Math.abs(vol(r2.t) - 8000) < 1, '구멍 메움 ' + r2.holes);
  ok(r3.removed === 2 && r3.t.length === good.length, '겹친 면 · 납작한 면 뺌 ' + r3.removed);
  ok(vol(r4.t) > 7999, '안팎이 뒤집힌 모델 바로잡음');
  // 자동 기울임
  const G = { placed: (t) => Float32Array.from(t) }, plate = R.autoTilt(G, new Float32Array(box(40, 40, 3)), 'z', { mm: [160, 100], z: 180 });
  ok(Math.abs(plate.rot[0]) + Math.abs(plate.rot[1]) >= 25, '납작한 판은 눕혀 세움 ' + plate.rot); ok(plate.after < plate.before, '점수가 좋아짐 ' + plate.before + ' → ' + plate.after);
  const low = R.autoTilt(G, new Float32Array(box(150, 90, 3)), 'z', { mm: [160, 100], z: 8 }); ok(low.rot[0] === 0 && low.rot[1] === 0, '프린터에 안 들어가는 각도는 안 고름 ' + low.rot);
  // 속 격자
  const cube = new Float32Array(box(30, 30, 30).map((v, i) => i % 3 === 2 ? v : v - 15)), P = { name: 't', mm: [80, 80], px: [800, 800], z: 100 }, so = { printer: P, layer: 0.5, hollow: true, wall: 2, holes: 0, support: false, raft: false };
  const h0 = R.slice(cube, so, C), h1 = R.slice(cube, Object.assign({}, so, { lattice: 6 }), C);
  ok(h1.volume > h0.volume * 1.05, '속 격자가 레진을 씀 ' + h0.volume.toFixed(0) + ' → ' + h1.volume.toFixed(0)); ok(h1.wallCavity < h0.wallCavity, '빈 곳이 줄어듦'); }
{ const q = (t, A, B, D, E) => t.push(...A, ...B, ...D, ...A, ...D, ...E), box = (t, x0, y0, z0, x1, y1, z1) => { const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; q(t, p[0], p[3], p[2], p[1]); q(t, p[4], p[5], p[6], p[7]); q(t, p[0], p[1], p[5], p[4]); q(t, p[1], p[2], p[6], p[5]); q(t, p[2], p[3], p[7], p[6]); q(t, p[3], p[0], p[4], p[7]); return t; };
  const t = new Float32Array(box(box(box([], -15, -5, 0, -5, 5, 20), -15, -5, 20, 15, 5, 24), 25, -5, 12, 35, 5, 16)), P = { name: 't', mm: [100, 100], px: [1000, 1000], z: 100 }, so = { printer: P, layer: 0.2, lift: 5, support: true, tree: true, spacing: 3, tip: 0.4, body: 1, raft: true, raftH: 1 };
  const base = R.slice(t, so, C), b = base.load, e = base.heads.filter((h) => h[9] > 20).map((h) => ({ p: [h[9], h[10], h[11] - 5], gone: 1 })), eb = { spacing: b.spacing, angle: b.angle, body: b.body, grams: b.grams, auto: [] }, w = { edits: e, ebase: eb };
  const off = R.slice(t, Object.assign({}, so, w), C), on = R.slice(t, Object.assign({}, so, w, { fixIslands: true }), C);
  ok(e.length > 0 && off.audit.islands.length > 0, '서포트를 지운 조각은 떠 있음 ' + off.audit.islands.length);
  ok(off.autoPins.length === 0, '누르기 전에는 서포트를 넣지 않음');
  ok(on.audit.islands.length === 0, '「서포트 추가」를 누르면 떠 있는 곳이 없어짐 ' + on.audit.islands.length + ' · 추가 ' + on.autoPins.length); ok(on.autoPins.length > 0, '넣은 수를 알려 줌'); }
{ const fs0 = require('fs'), p0 = require('path'), root = p0.join(__dirname, '..'), ver = JSON.parse(fs0.readFileSync(p0.join(root, 'plugin.json'), 'utf8')).version;
  for (const f of ['dist/js/plugin.iife.js', 'web/resin/resin.cjs']) { const m = fs0.readFileSync(p0.join(root, f), 'utf8').match(/V = '([0-9.]+)'/); if (!m || m[1] !== ver) { console.error('FAIL V ' + f + ' ' + (m && m[1]) + ' != ' + ver); process.exitCode = 1; } else // 0.26.100 아래가 막힌 떠 있는 곳 — 판에서만 켜도 모델 위에 세워 한꺼번에 받침
{ const parts = [box(40, 30, 5), box(4, 30, 20, 0, -18, 0), box(40, 30, 3, 17)], d = [-6, 2, 10].map((x) => box(4, 4, 7, 10, x, 6)), all = parts.concat(d, [-6, 2, 10].map((x) => box(4, 4, 7, 10, x, -6))), n = all.reduce((a, p) => a + p.length, 0), t2 = new Float32Array(n); let at = 0; for (const p of all) { t2.set(p, at); at += p.length; }
  const so2 = { printer: { name: 'T', px: [2000, 1500], mm: [100, 75], z: 100, ext: 'goo' }, layer: 0.05, lift: 5, support: true, tree: true, plateOnly: true, spacing: 30, tip: 0.3, body: 0.8, raft: true, raftH: 1, mirror: false, fit: true }, a0 = R.slice(t2, so2, C), a1 = R.slice(t2, Object.assign({}, so2, { fixIslands: true }), C), seen = [];
  R.slice(t2, Object.assign({}, so2, { fixIslands: true }), C, (p) => seen.push(p));
  console.log('막힌 곳', a0.audit.islands.length, '→', a1.audit.islands.length, (a1.autoPins || []).length);
  ok(a0.audit.islands.length >= 2, '막힌 곳 시험 모델에 떠 있는 곳이 여럿 ' + a0.audit.islands.length); ok(a1.audit.islands.length === 0, '막힌 곳도 한꺼번에 받침 → ' + a1.audit.islands.length);
  ok(seen.every((p, i) => !i || p >= seen[i - 1] - 1e-9) && seen[seen.length - 1] <= 1, '진행바가 되돌아가지 않음'); }
console.log('ok V ' + f); } }
