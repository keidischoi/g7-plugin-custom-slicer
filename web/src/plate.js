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
export const DEFAULT_PLATE_COLOR = '#1c1f24'   // 0.1.27 판 기본색은 검정 계통 (판 무늬 · 제조사 글자는 그대로)
export const PLATE_COLORS = [['', '기본 (검정)'], ['#b8925a', '금색 PEI'], ['#1f2328', '검정'], ['#6b7280', '회색'], ['#eef2f7', '흰색'], ['#1e3a8a', '남색'], ['#2563eb', '파랑'], ['#047857', '초록'],
  ['#0d9488', '민트'], ['#b91c1c', '빨강'], ['#ea580c', '주황'], ['#ca8a04', '노랑'], ['#6d28d9', '보라'], ['#db2777', '핑크'], ['#7c2d12', '갈색'], ['#cbd5e1', '은색']]

const LS = 'slc-plate-look'
/** 회원이 고른 판 (이 브라우저에만) — {kind: 'auto'|PLATES 키, color: '' | '#rrggbb', show: true} */
export function lookPref() { try { return Object.assign({ kind: 'auto', color: '', show: true, drag: true }, JSON.parse(localStorage.getItem(LS) || '{}')) } catch (e) { return { kind: 'auto', color: '', show: true, drag: true } } }
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
  const color = /^#[0-9a-f]{6}$/i.test(pref.color) ? pref.color : DEFAULT_PLATE_COLOR
  {
    const light = lum(color) > 0.6
    look = { ...look, base: color, edge: shade(color, -22), ink: light ? 'rgba(15,23,42,.2)' : 'rgba(255,255,255,.16)', label: light ? 'rgba(15,23,42,.4)' : 'rgba(255,255,255,.45)' }
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
  if (st.brand) { g.save(); g.fillStyle = L.label; g.font = '800 ' + Math.round(Math.min(cw / 12, 7.5 * px)) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.9; g.textBaseline = 'alphabetic'; g.fillText(spaced(st.brand), cw / 2, chh - 16 - Math.max(10, Math.round(9 * px)) - Math.round(5 * px)); g.restore() }   // 0.1.26 아래 눈금 숫자(100 · 150) 줄 위로 — 예전엔 같은 줄에 겹쳤음
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
  tex.repeat.set(1 / w, 1 / d); tex.offset.set(0.5, 0.5)   // 0.1.33 판 모양(둥근 네모)의 mm 좌표 → 그림 0~1
  return tex
}
function roundRect(THREE, w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2)
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s
}
/** 0.1.33 판에 두께 — 출력 검사기 3D 미리 보기와 같은 판: 1.6mm 판(옆면은 판 가장자리 색) + 아래 8mm 프린터 몸 받침 + 앞쪽 색 띠.
 *  윗면은 뷰어가 지울 때 geometry · material 을 버리므로 단일 메시로 두고, 두께 · 받침 · 띠는 그 자식 (판과 같이 보이고 숨음) */
function plateBody(THREE, top, w, d) {
  const st = plateStyle(STATE.printer, STATE.bedType), look = st.look
  const none = new THREE.MeshBasicMaterial({ visible: false })
  const sheet = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(THREE, w, d, 5), { depth: 1.6, bevelEnabled: false, curveSegments: 6 }),
    [none, new THREE.MeshStandardMaterial({ color: look.edge, roughness: 0.6, metalness: 0.3 })])
  sheet.position.z = -1.6; top.add(sheet)
  const bed = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(THREE, w + 24, d + 24, 10), { depth: 8, bevelEnabled: false, curveSegments: 6 }),
    new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.75, metalness: 0.2 }))
  bed.position.z = -9.8; top.add(bed)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: st.accent, emissive: st.accent, emissiveIntensity: 0.35 }))
  stripe.position.set(0, -d / 2 - 12.4, -5.5); top.add(stripe)
  top.userData.slcBody = { sheet, stripe }
}
/** 0.1.46 🌗 아주 어두운 필라멘트 물체 — 빛을 세게 해도 검은 색(반사 2~3%)은 검게만 보여 모양이 안 보였음 →
 *  화면에서만 물체 색을 조금 밝힘(가장 어두워도 #5a5a5a 쯤 회색). 자르기 · 보내기 · 필라멘트 색은 그대로. 뷰어가 색을 다시 정하면 다음 그리기에 다시 밝힘
 *  c: THREE.Color (선형 값) — 밝혔으면 true */
export const DARK_MIN = 0.1
export function liftColor(c, min = DARK_MIN) {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  if (!(l < min)) return false
  const add = min - l
  c.r += add; c.g += add; c.b += add
  return true
}
/** 장면의 물체 · 칠한 색 재질만 (뷰어 물체 재질: roughness 0.6 · metalness 0.05 — 판 · 노즐 · 미리 보기 선은 건드리지 않음) */
function liftScene(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial || m.roughness !== 0.6 || m.metalness !== 0.05 || !m.color) continue
      const ud = m.userData
      if (ud.slcLift && m.color.equals(ud.slcLift)) continue
      ud.slcLift = liftColor(m.color) ? m.color.clone() : null
    }
  })
}
/** build.mjs 가 뷰어의 판 만들기 함수에서 부름 — (THREE, 뷰어 상태, {x, z, w, d}) → 판 그림 메시 (뷰어가 판을 지울 때 같이 지움) */
globalThis.__slcPlateHook = (THREE, view, p) => {
  try {
    STATE.views.add(view)
    // 0.1.37 바닥 밑에서 볼 때는 판을 숨김 — 그리기마다 카메라가 판(높이 0)보다 아래인지 봄 (판 위로 오면 다시 보임)
    if (view.scene && !view.scene.__slcBelow) {
      view.scene.__slcBelow = true
      const prev = view.scene.onBeforeRender
      // 0.1.45 💡 카메라 조명 — 장면의 빛은 위쪽 고정이라 검은 필라멘트 물체를 옆 · 아래에서 보면 거의 검게만 보였음 → 카메라에서 바라보는 곳으로 비추는 빛 하나
      let head = null
      try { head = new THREE.DirectionalLight(0xffffff, 0.85); head.name = 'slc-headlight'; view.scene.add(head); view.scene.add(head.target) } catch (e) {}
      let liftAt = 0
      view.scene.onBeforeRender = function (rd, sc, cam) {
        try { if (head && cam) { head.position.copy(cam.position); if (view.orbit && view.orbit.target) head.target.position.copy(view.orbit.target); head.target.updateMatrixWorld() } } catch (e) {}
        try { if (globalThis.__slcPartsTick) globalThis.__slcPartsTick(THREE) } catch (e) {}   // 0.1.47 합친 물체의 부품 색 (merge3mf.js)
        try { const t = performance.now(); if (t - liftAt > 250) { liftAt = t; liftScene(view.scene) } } catch (e) {}
        try {
          const below = !!cam && cam.position.y < -0.5, on = STATE.show !== false && !below
          for (const b of view.plateBeds || []) if (b.slcPlate && b.slcPlate.visible !== on) b.slcPlate.visible = on
        } catch (e) {}
        if (typeof prev === 'function') return prev.apply(this, arguments)
      }
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(THREE, p.w, p.d, 5), 6), new THREE.MeshStandardMaterial({ map: texOf(THREE, p.w, p.d), roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
    try { plateBody(THREE, m, p.w, p.d) } catch (e) {}
    m.rotation.x = -Math.PI / 2
    m.position.set(p.x, -0.05, p.z)
    m.renderOrder = -10
    m.userData.slcPlate = { w: p.w, d: p.d, THREE, selected: !!p.selected }   // 0.1.43 selected: 3MF 물체를 놓을 판
    m.visible = (STATE.show = lookPref().show !== false)
    return m
  } catch (e) { return null }
}
/** 깔린 판 그림을 지금 프린터 · 고른 판으로 다시 그림 · 보이기/숨기기 (숨기면 뷰어의 격자 선이 다시 보임) */
export function refreshPlates() {
  const show = (STATE.show = lookPref().show !== false)
  for (const view of STATE.views) {
    for (const b of view.plateBeds || []) {
      const m = b.slcPlate; if (!m || !m.userData.slcPlate) continue
      const { w, d, THREE } = m.userData.slcPlate
      const old = m.material.map; m.material.map = texOf(THREE, w, d); m.material.needsUpdate = true; if (old) old.dispose()
      const bd = m.userData.slcBody   // 0.1.33 판 옆면 · 앞 띠 색도 지금 판으로
      if (bd) { const st = plateStyle(STATE.printer, STATE.bedType); bd.sheet.material[1].color.set(st.look.edge); bd.stripe.material.color.set(st.accent); bd.stripe.material.emissive.set(st.accent) }
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
