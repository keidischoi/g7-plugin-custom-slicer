// custom-slicer — 🧱 바닥판 · 🧰 보기 도구 (출력 검사기와 같은 모양) · AGPL-3.0-or-later
//  바닥판 그림은 같은 저작자의 출력 검사기(custom-print_check, MIT) plateCanvas 를 옮겨 온 것 — 제조사 · 판 종류(Textured PEI · Smooth PEI · Cool Plate …) ·
//  10mm 격자 · 50mm 굵은 줄 · 가장자리 눈금 · 제조사 글자
//  뷰어(three-slicer)는 판을 선(격자)으로만 그림 → build.mjs 가 판을 만드는 함수에 globalThis.__slcPlateHook 을 넣고, 여기서 그 아래에 판 그림을 깖

export const PLATES = {
  textured: { name: 'Textured PEI', base: '#b8925a', edge: '#7a5a2e', tex: 'dots', ink: 'rgba(40,25,5,.22)', label: 'rgba(40,25,5,.35)' },
  smooth: { name: 'Smooth PEI', base: '#2a2a2c', edge: '#141416', tex: 'satin', ink: 'rgba(212,175,95,.28)', label: 'rgba(212,175,95,.55)' },
  cool: { name: 'Cool Plate', base: '#1b1d22', edge: '#0d0e11', tex: 'smooth', ink: 'rgba(255,255,255,.14)', label: 'rgba(255,255,255,.35)' },
  pei: { name: 'PEI 판', base: '#30343b', edge: '#1a1d22', tex: 'dots', ink: 'rgba(255,255,255,.13)', label: 'rgba(255,255,255,.35)' },
  glass: { name: '유리 판', base: '#cfe4ea', edge: '#8fb3bf', tex: 'glass', ink: 'rgba(15,60,80,.18)', label: 'rgba(15,60,80,.35)' },
  metal: { name: '알루미늄 빌드 판', base: '#c3c8ce', edge: '#8a9198', tex: 'brushed', ink: 'rgba(30,40,50,.18)', label: 'rgba(30,40,50,.35)' },
  simple: { name: '격자만', base: '#eef2f7', edge: '#cbd5e1', tex: 'smooth', ink: 'rgba(15,23,42,.14)', label: 'rgba(15,23,42,.3)' },
}
const BRANDS = [
  [/bambu/i, { plate: 'textured', brand: 'BAMBU LAB', accent: '#00ae42' }],
  [/prusa/i, { plate: 'smooth', brand: 'ORIGINAL PRUSA', accent: '#fa6831' }],
  [/creality/i, { plate: 'pei', brand: 'CREALITY', accent: '#14b8a6' }],
  [/elegoo/i, { plate: 'pei', brand: 'ELEGOO', accent: '#3b82f6' }],
  [/anycubic/i, { plate: 'pei', brand: 'ANYCUBIC', accent: '#38bdf8' }],
  [/flashforge/i, { plate: 'pei', brand: 'FLASHFORGE', accent: '#f97316' }],
  [/qidi/i, { plate: 'pei', brand: 'QIDI TECH', accent: '#2563eb' }],
  [/voron/i, { plate: 'pei', brand: 'VORON', accent: '#dc2626' }],
  [/sovol|artillery|kingroon|two ?trees|tronxy/i, { plate: 'pei', accent: '#0ea5e9' }],
  [/ultimaker|makerbot|raise ?3d|snapmaker|sindoh/i, { plate: 'glass', accent: '#0ea5e9' }],
]
export const PLATE_COLORS = [['', '자동'], ['#b8925a', '금색 PEI'], ['#1f2328', '검정'], ['#6b7280', '회색'], ['#eef2f7', '흰색'], ['#1e3a8a', '남색'], ['#2563eb', '파랑'], ['#047857', '초록'],
  ['#0d9488', '민트'], ['#b91c1c', '빨강'], ['#ea580c', '주황'], ['#ca8a04', '노랑'], ['#6d28d9', '보라'], ['#db2777', '핑크'], ['#7c2d12', '갈색'], ['#cbd5e1', '은색']]

const LS = 'slc-plate-look'
/** 회원이 고른 판 (이 브라우저에만) — {kind: 'auto'|PLATES 키, color: '' | '#rrggbb', show: true} */
export function lookPref() { try { return Object.assign({ kind: 'auto', color: '', show: true }, JSON.parse(localStorage.getItem(LS) || '{}')) } catch (e) { return { kind: 'auto', color: '', show: true } } }
export function setLookPref(p) { try { localStorage.setItem(LS, JSON.stringify(Object.assign(lookPref(), p))) } catch (e) {} }

function lum(hex) { const n = parseInt(String(hex).slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
function shade(hex, pct) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * pct / 100))); return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')' }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const spaced = (s) => String(s).split('').join(String.fromCharCode(8202))

/** 프린터 이름 · 슬라이서의 판 종류(curr_bed_type) · 회원이 고른 판 → 판 모양 */
export function plateStyle(printer, bedType) {
  let base = { plate: 'pei', brand: '', accent: '#0ea5e9' }
  for (const [re, v] of BRANDS) if (re.test(printer || '')) { base = { ...base, ...v }; break }
  if (!base.brand) base.brand = String(printer || '').split(' ')[0].toUpperCase()
  const bt = String(bedType || '')
  if (/textured/i.test(bt)) base.plate = 'textured'
  else if (/cool|supertack/i.test(bt)) base.plate = 'cool'
  else if (/engineering|high temp|smooth/i.test(bt)) base.plate = 'smooth'
  const pref = lookPref()
  if (pref.kind !== 'auto' && PLATES[pref.kind]) base.plate = pref.kind
  let look = PLATES[base.plate] || PLATES.pei
  if (/^#[0-9a-f]{6}$/i.test(pref.color)) {
    const light = lum(pref.color) > 0.6
    look = { ...look, base: pref.color, edge: shade(pref.color, -22), ink: light ? 'rgba(15,23,42,.2)' : 'rgba(255,255,255,.16)', label: light ? 'rgba(15,23,42,.4)' : 'rgba(255,255,255,.45)' }
  }
  return { ...base, look }
}

/** 판 그림 (캔버스) — 질감 · 10mm 격자 · 50mm 굵은 줄 · 가장자리 눈금 · 제조사 글자 (출력 검사기와 같음) */
export function plateCanvas(st, W, D) {
  const L = st.look, px = 1024 / Math.max(W, D), cw = Math.max(2, Math.round(W * px)), chh = Math.max(2, Math.round(D * px))
  const c = document.createElement('canvas'); c.width = cw; c.height = chh; const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, cw, chh); grd.addColorStop(0, shade(L.base, 12)); grd.addColorStop(1, shade(L.base, -10))
  g.fillStyle = grd; g.fillRect(0, 0, cw, chh)
  const rnd = mulberry(7)
  let i, mm
  if (L.tex === 'dots') { for (i = 0; i < cw * chh / 90; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,' + (0.05 + rnd() * 0.1) + ')' : 'rgba(0,0,0,' + (0.06 + rnd() * 0.12) + ')'; g.beginPath(); g.arc(rnd() * cw, rnd() * chh, 0.6 + rnd() * 1.4, 0, 6.3); g.fill() } }
  if (L.tex === 'satin') { for (i = 0; i < cw * chh / 40; i++) { g.fillStyle = 'rgba(255,255,255,' + rnd() * 0.035 + ')'; g.fillRect(rnd() * cw, rnd() * chh, 1, 1) } }
  if (L.tex === 'brushed') { for (i = 0; i < chh; i += 1) { g.fillStyle = 'rgba(' + (rnd() > 0.5 ? '255,255,255' : '0,0,0') + ',' + rnd() * 0.07 + ')'; g.fillRect(0, i, cw, 1) } }
  if (L.tex === 'glass') { const gg = g.createLinearGradient(0, 0, cw, chh); gg.addColorStop(0.2, 'rgba(255,255,255,0)'); gg.addColorStop(0.35, 'rgba(255,255,255,.35)'); gg.addColorStop(0.45, 'rgba(255,255,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, cw, chh) }
  g.strokeStyle = L.ink
  for (mm = 0; mm <= Math.max(W, D) / 2; mm += 10) {
    for (const s of [1, -1]) {
      g.lineWidth = mm % 50 === 0 ? 2 : 1; g.globalAlpha = mm % 50 === 0 ? 1 : 0.55
      const x = cw / 2 + s * mm * px, y = chh / 2 + s * mm * px
      if (x >= 0 && x <= cw) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, chh); g.stroke() }
      if (y >= 0 && y <= chh) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke() }
    }
  }
  g.globalAlpha = 1
  g.fillStyle = L.label; g.font = '600 ' + Math.max(10, Math.round(9 * px)) + 'px system-ui,sans-serif'
  for (mm = 0; mm <= W; mm += 10) { const tx = mm * px, big = mm % 50 === 0; g.fillRect(tx - 0.75, chh - (big ? 14 : 7), 1.5, big ? 14 : 7); if (big && mm > 0 && mm < W) g.fillText(String(mm), tx + 3, chh - 16) }
  for (mm = 0; mm <= D; mm += 10) { const ty = chh - mm * px, big = mm % 50 === 0; g.fillRect(0, ty - 0.75, big ? 14 : 7, 1.5); if (big && mm > 0 && mm < D) g.fillText(String(mm), 16, ty + 4) }
  if (st.brand) { g.save(); g.fillStyle = L.label; g.font = '800 ' + Math.round(Math.min(cw / 12, 7.5 * px)) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.9; g.fillText(spaced(st.brand), cw / 2, chh - 26); g.restore() }
  g.save(); g.fillStyle = L.label; g.font = '600 ' + Math.round(Math.min(cw / 30, 4.5 * px)) + 'px system-ui,sans-serif'; g.textAlign = 'right'; g.fillText(L.name + ' · ' + Math.round(W) + '×' + Math.round(D) + ' mm', cw - 10, 22); g.restore()
  g.strokeStyle = st.accent; g.lineWidth = 2; g.globalAlpha = 0.7; g.beginPath(); g.arc(cw / 2, chh / 2, 6, 0, 6.3); g.stroke(); g.globalAlpha = 1
  return c
}

/* ───────── 뷰어에 판을 깖 ───────── */
const STATE = { printer: '', bedType: '', views: new Set() }
/** 앱이 지금 프린터 · 판 종류를 알려 줌 → 깔린 판을 다시 그림 */
export function plateInfo(printer, bedType) {
  if (printer === STATE.printer && bedType === STATE.bedType) return
  STATE.printer = printer || ''; STATE.bedType = bedType || ''
  refreshPlates()
}
function texOf(THREE, w, d) {
  const tex = new THREE.CanvasTexture(plateCanvas(plateStyle(STATE.printer, STATE.bedType), w, d))
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
/** build.mjs 가 뷰어의 판 만들기 함수에서 부름 — (THREE, 뷰어 상태, {x, z, w, d}) → 판 그림 메시 (뷰어가 판을 지울 때 같이 지움) */
globalThis.__slcPlateHook = (THREE, view, p) => {
  try {
    STATE.views.add(view)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshBasicMaterial({ map: texOf(THREE, p.w, p.d), depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
    m.rotation.x = -Math.PI / 2
    m.position.set(p.x, -0.05, p.z)
    m.renderOrder = -10
    m.userData.slcPlate = { w: p.w, d: p.d, THREE }
    m.visible = lookPref().show !== false
    return m
  } catch (e) { return null }
}
/** 깔린 판 그림을 지금 프린터 · 고른 판으로 다시 그림 · 보이기/숨기기 (숨기면 뷰어의 격자 선이 다시 보임) */
export function refreshPlates() {
  const show = lookPref().show !== false
  for (const view of STATE.views) {
    for (const b of view.plateBeds || []) {
      const m = b.slcPlate; if (!m || !m.userData.slcPlate) continue
      const { w, d, THREE } = m.userData.slcPlate
      const old = m.material.map; m.material.map = texOf(THREE, w, d); m.material.needsUpdate = true; if (old) old.dispose()
      m.visible = show
      if (b.gridThin) b.gridThin.visible = !show
      if (b.gridBold) b.gridBold.visible = !show
    }
    try { view.invalidate && view.invalidate() } catch (e) {}
  }
}
/** 지금 화면의 뷰어 상태 (보기 도구가 카메라를 움직일 때) */
export function viewOf() { let v = null; for (const x of STATE.views) v = x; return v }

// 진단용 — 콘솔에서 지금 뷰어 상태를 볼 때 (globalThis.__slcView())
globalThis.__slcView = viewOf

/** 0.1.6 사이트 테마가 바뀌면 3D 판 바탕 · 격자 · 판 테두리 색을 바로 바꿈 (뷰어는 열 때 한 번만 정해서) — build.mjs 의 SCENE 과 같은 값 */
const SCENE_LIVE = { light: { bg: '#eef4fa', minor: '#d6e0ea', major: '#aebfd0', border: '#7f93a8' }, dark: { bg: '#0f172a', minor: '#1e293b', major: '#334155', border: '#64748b' } }
export function sceneTheme(dark) {
  const c = SCENE_LIVE[dark ? 'dark' : 'light']
  for (const view of STATE.views) {
    try {
      if (view.scene && view.scene.background && view.scene.background.set) view.scene.background.set(c.bg)
      if (view.renderer && view.renderer.setClearColor) view.renderer.setClearColor(c.bg)   // 뷰어는 바탕을 지우기 색으로 칠함
      for (const b of view.plateBeds || []) {
        if (b.gridThin && b.gridThin.material) b.gridThin.material.color.set(c.minor)
        if (b.gridBold && b.gridBold.material) b.gridBold.material.color.set(c.major)
        if (b.border && b.border.material && b.border.material.linewidth !== 2) b.border.material.color.set(c.border)
      }
      view.invalidate && view.invalidate()
    } catch (e) {}
  }
}
