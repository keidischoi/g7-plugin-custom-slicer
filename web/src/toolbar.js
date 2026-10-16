// custom-slicer — 🧰 보기 도구 (출력 검사기 3D 미리 보기와 같은 세로 도구) · 3dsSlicer 이름표 · AGPL-3.0-or-later
//  뷰어의 3D 칸(.viewport-col, 그림자 DOM) 오른쪽 위에 붙임: 비스듬히 · 위 · 앞 · 옆 · 모델에 맞추기 · 판 전체 /
//  천천히 돌리기 · 바닥판 보이기 / 바닥판 바꾸기(종류 · 색) · 사진 저장 · 전체 화면 · 접기
import { PLATES, PLATE_COLORS, lookPref, setLookPref, refreshPlates, viewOf } from './plate.js'
import { attachDrag, applyArrows } from './freedrag.js'
import { flip, layDown, faceMode } from './orient.js'
import { mountLayers } from './layers.js'

const ICONS = {
  cube: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>',
  top: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  front: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 11h16"/>',
  side: '<path d="M5 6l9-3v18l-9-3z"/><path d="M14 3l5 3v12l-5 3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  plate: '<path d="M2 15 12 20l10-5-10-5z"/><path d="M2 15v1.5L12 21.5l10-5V15"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  layers: '<path d="M12 3 21 8l-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  sliders: '<path d="M5 3v18M12 3v18M19 3v18"/><circle cx="5" cy="8" r="2.3"/><circle cx="12" cy="15" r="2.3"/><circle cx="19" cy="10" r="2.3"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  tools: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  flipv: '<path d="M12 3v18"/><path d="M5 8 2.5 12 5 16M19 8l2.5 4L19 16"/><path d="M7 6h3M7 18h3M14 6h3M14 18h3"/>',
  layd: '<path d="M3 20h18"/><rect x="5" y="12" width="14" height="5" rx="1.2"/><path d="M9 9a5 5 0 0 1 8-2l1.5 1.5M18.5 5v3.5H15"/>',
  face: '<path d="M3 20h18"/><path d="M7 20 12 7l5 13"/><path d="M12 3v2M7.5 15h9"/>',
  hide: '<path d="M9 18l6-6-6-6"/>',
}
const ic = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || '') + '</svg>'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 그림자 DOM 안 모양 — 출력 검사기 .pck-vg 와 같은 말씨 (밝게 · 어둡게는 --_light-* 변수로 따라감) */
export const TOOL_CSS = `
.slc-vt{position:absolute;top:58px;right:10px;z-index:15;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none}
.slc-vt>*{pointer-events:auto}
/* 0.1.26 겹치지 않게 — 높이가 모자라면 아래 판 고르기(1 · +)까지 내려가지 않고 왼쪽에 한 줄 더 (툴팁이 잘리지 않게 스크롤 대신 줄 바꿈) */
.slc-vt{max-height:calc(100% - 150px);flex-wrap:wrap-reverse;align-content:flex-end;column-gap:6px}
.slc-vt>.slc-vtg{order:-1}
/* 0.1.30 줄 바꿈(wrap-reverse)이면 가로 방향이 뒤집혀 flex-end 가 왼쪽이 됨 → 도구 묶음이 칸 왼쪽에 붙어 벽에서 40px 떨어져 보였음.
 *  flex-start(뒤집혀서 오른쪽)로 맞춤 · 벽과의 간격은 예전처럼 10px · 둥근 모서리 */
.slc-vt{align-items:flex-start}
.slc-vg{display:flex;flex-direction:column;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--_light-surface) 90%,transparent);border:1px solid var(--_light-divider);box-shadow:0 1px 2px rgba(15,23,42,.06),0 4px 14px rgba(15,23,42,.08);backdrop-filter:blur(6px)}
.slc-vg button,.slc-vtg{position:relative;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:9px;background:none;color:var(--_light-text);cursor:pointer;transition:background .15s,color .15s}
.slc-vg button.nope{color:#ef4444;animation:slc-nope .35s}
@keyframes slc-nope{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.slc-vg button:hover,.slc-vtg:hover{background:var(--_accent-soft);color:var(--_accent-ink)}
.slc-vg button.on{background:var(--_accent);color:var(--_on-accent)}
.slc-vg svg,.slc-vtg svg{width:18px;height:18px}
.slc-vg button:hover::after{content:attr(data-tip);position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);padding:4px 8px;border-radius:7px;background:#0f172a;color:#fff;font-size:11.5px;font-weight:600;white-space:nowrap;pointer-events:none}
.slc-vtg{width:auto;height:30px;padding:0 10px;gap:6px;display:inline-flex;border-radius:10px;background:color-mix(in srgb,var(--_light-surface) 90%,transparent);border:1px solid var(--_light-divider);font:700 12px system-ui,sans-serif}
.slc-vt.min .slc-vg,.slc-vt.min .slc-pm{display:none}
.slc-pm{width:230px;padding:10px;border-radius:14px;background:var(--_light-surface);border:1px solid var(--_light-divider);box-shadow:0 10px 30px rgba(15,23,42,.18);font:12.5px system-ui,sans-serif;color:var(--_light-text)}
.slc-pm[hidden]{display:none}
.slc-pm small{display:block;margin:2px 0 6px;font-weight:800;color:var(--_light-text-muted)}
.slc-pm .k{display:block;width:100%;text-align:left;padding:6px 9px;margin:0 0 3px;border:1px solid var(--_light-divider);border-radius:9px;background:var(--_light-subtle);color:inherit;font:inherit;cursor:pointer}
.slc-pm .k.on{border-color:var(--_accent);background:var(--_accent-soft);color:var(--_accent-ink);font-weight:700}
.slc-pcol{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}
.slc-pcol button{width:22px;height:22px;border-radius:7px;border:1px solid rgba(0,0,0,.18);background:var(--c);cursor:pointer;font:700 10px system-ui;color:var(--_light-text-muted);padding:0}
.slc-pcol button.on{outline:2px solid var(--_accent);outline-offset:1px}
/* 상단 이름표 — ThreeSlicer 글자 대신 3dsSlicer 사각 박스 (엔진 출처 · AGPL 고지는 화면 아래 안내에) */
.tb-logo{display:inline-flex !important;align-items:center;gap:6px;padding:5px 11px !important;border-radius:10px;background:linear-gradient(135deg,#0ea5e9,#6366f1);box-shadow:0 3px 10px rgba(14,165,233,.35);color:#fff !important;text-decoration:none !important;pointer-events:none;font-size:0 !important;line-height:1}
.tb-logo>*{display:none !important}
.tb-logo::before{content:"🔪";font-size:13px}
.tb-logo::after{content:"3dsSlicer";font:800 13.5px/1 system-ui,sans-serif;letter-spacing:-.01em;color:#fff}
`

let rot = 0
function camOf() { const v = viewOf(); return v && v.camera && v.orbit ? v : null }
function look(dir) {
  const v = camOf(); if (!v) return
  const t = v.orbit.target, dist = Math.max(80, v.camera.position.distanceTo(t)), n = Math.hypot(dir[0], dir[1], dir[2]) || 1
  v.camera.position.set(t.x + dir[0] / n * dist, t.y + dir[1] / n * dist, t.z + dir[2] / n * dist)
  v.camera.up && v.camera.up.set(0, 1, 0)
  v.orbit.update(); v.invalidate && v.invalidate()
}
/** 맞추기 — model: 판에 올린 모델들 · plate: 판 전체 */
function fit(what) {
  const v = camOf(); if (!v) return
  let x0 = Infinity, x1 = -Infinity, y1 = 0, z0 = Infinity, z1 = -Infinity
  const add = (a, b, c, d, h) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, d); y1 = Math.max(y1, h || 0) }
  const THREE = ((v.plateBeds || []).map((b) => b.slcPlate && b.slcPlate.userData.slcPlate).find(Boolean) || {}).THREE
  if (what === 'model' && THREE && v.objectsGroup) {   // 뷰어가 모델을 모아 두는 무리 — 가장 정확
    const bb = new THREE.Box3().setFromObject(v.objectsGroup)
    if (!bb.isEmpty()) add(bb.min.x, bb.max.x, bb.min.z, bb.max.z, bb.max.y)
  } else if (what === 'model') {
    const beds = new Set(); for (const b of v.plateBeds || []) for (const k of ['gridThin', 'gridBold', 'border', 'label', 'slcPlate']) if (b[k]) beds.add(b[k])
    v.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || beds.has(o) || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position || o.geometry.attributes.position.count < 30) return
      for (let p = o.parent; p; p = p.parent) if (p.type === 'TransformControls' || p.isTransformControls) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
      if (bb.max.y - bb.min.y > 2000) return
      add(bb.min.x, bb.max.x, bb.min.z, bb.max.z, bb.max.y)
    })
  }
  if (!isFinite(x0)) for (const b of v.plateBeds || []) { const m = b.slcPlate || b.border; if (!m) continue; const s = m.userData.slcPlate; const w = s ? s.w : 256, d = s ? s.d : 256; add(m.position.x - w / 2, m.position.x + w / 2, m.position.z - d / 2, m.position.z + d / 2, 0) }
  if (!isFinite(x0)) return
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, size = Math.max(x1 - x0, z1 - z0, y1, 20)
  const dir = v.camera.position.clone().sub(v.orbit.target); if (dir.lengthSq() < 1) dir.set(0, 1, 1); dir.normalize()
  v.orbit.target.set(cx, y1 / 2, cz)
  v.camera.position.set(cx, y1 / 2, cz).addScaledVector(dir, what === 'model' ? size * 2.4 + 40 : size * 1.35)
  v.orbit.update(); v.invalidate && v.invalidate()
}
function spin(on) {
  cancelAnimationFrame(rot); rot = 0
  if (!on) return
  const step = () => {
    const v = camOf(); if (!v) return
    const t = v.orbit.target, p = v.camera.position, a = 0.004, dx = p.x - t.x, dz = p.z - t.z
    p.x = t.x + dx * Math.cos(a) - dz * Math.sin(a); p.z = t.z + dx * Math.sin(a) + dz * Math.cos(a)
    v.orbit.update(); v.invalidate && v.invalidate()
    rot = requestAnimationFrame(step)
  }
  rot = requestAnimationFrame(step)
}

/**
 * 도구를 붙임 (이미 있으면 그대로) — host: 슬라이서 자리(.slc-stage) · ctx: {shot(), full()}
 * 그림자 뿌리 안 .viewport-col 에 붙임 (나중에 뷰어가 다시 그려도 다시 붙음 — app.js 가 가끔 부름)
 */
export function mountToolbar(host, ctx) {
  let root = null
  const walk = (n) => { if (!n || root) return; if (n.shadowRoot && n.shadowRoot.querySelector('.viewport-col')) { root = n.shadowRoot; return } if (n.shadowRoot) walk(n.shadowRoot); if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => { if (c.shadowRoot && !root) walk(c) }) }
  walk(host)
  if (!root) return false
  try { attachDrag(viewOf()) } catch (e) {}   // 0.1.15 ✋ 물체 몸을 잡고 끌어 옮기기 (뷰어마다 한 번)
  if (!root.querySelector('style[data-slc-tool]')) { const st = document.createElement('style'); st.setAttribute('data-slc-tool', '1'); st.textContent = TOOL_CSS; root.appendChild(st) }
  const col = root.querySelector('.viewport-col')
  try { mountLayers(root, col) } catch (e) {}   // 0.1.22 미리 보기 층 · 노즐 슬라이더
  if (!col || col.querySelector('.slc-vt')) return true
  const pref = lookPref()
  let mini = false; try { mini = localStorage.getItem('slc-vt-min') === '1' } catch (e) {}
  const B = (id, icon, tip, on) => '<button type="button" data-v="' + id + '" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"' + (on ? ' class="on"' : '') + '>' + ic(icon) + '</button>'
  const tb = document.createElement('div'); tb.className = 'slc-vt' + (mini ? ' min' : '')
  const pm = () => '<div class="slc-pm" hidden><small>판 종류</small>' + ['auto'].concat(Object.keys(PLATES)).map((k) => '<button type="button" class="k' + (lookPref().kind === k ? ' on' : '') + '" data-plate="' + k + '">' + (k === 'auto' ? '자동 (프린터 · 판 설정에 맞춤)' : esc(PLATES[k].name)) + '</button>').join('') +
    '<small>판 색</small><div class="slc-pcol">' + PLATE_COLORS.map((c) => '<button type="button" data-pcolor="' + c[0] + '" title="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '"' + ((lookPref().color || '') === c[0] ? ' class="on"' : '') + ' style="--c:' + (c[0] || 'transparent') + '">' + (c[0] ? '' : 'A') + '</button>').join('') + '</div></div>'
  tb.innerHTML = '<button type="button" class="slc-vtg" data-vt-toggle>' + ic(mini ? 'tools' : 'hide') + '<span>' + (mini ? '도구' : '숨기기') + '</span></button>' +
    '<div class="slc-vg">' + B('iso', 'cube', '비스듬히') + B('top', 'top', '위에서') + B('front', 'front', '앞에서') + B('side', 'side', '옆에서') + B('fit', 'fit', '모델에 맞추기') + B('plate', 'plate', '판 전체 보기') + '</div>' +
    '<div class="slc-vg">' + B('drag', 'move', '물체를 잡고 끌어 옮기기 (켜면 이동 화살표 숨김) · 켜기 · 끄기', pref.drag !== false) + B('auto', 'rotate', '천천히 돌리기') + B('plateshow', 'layers', '바닥판 보이기 · 숨기기', pref.show !== false) + B('platepick', 'sliders', '바닥판 바꾸기 (종류 · 색)') + '</div>' +
    '<div class="slc-vg">' + B('flip', 'flipv', '위아래 뒤집기 (고른 물체)') + B('lay', 'layd', '앞으로 눕히기 90° (고른 물체)') + B('face', 'face', '면으로 놓기 — 누른 뒤 고른 물체의 바닥이 될 면을 클릭') + '</div>' +
    '<div class="slc-vg">' + B('shot', 'camera', '사진 저장 (PNG)') + B('full', 'expand', '전체 화면') + '</div>' + pm()
  col.appendChild(tb)
  // 판에서 마우스 · 키를 누르면 뷰어로 가지 않게 (도구를 누르다 판이 돌지 않게)
  for (const ev of ['pointerdown', 'mousedown', 'wheel']) tb.addEventListener(ev, (e) => e.stopPropagation())
  // 0.1.13 키는 Enter · 스페이스(단추 누르기)만 막음 — 예전엔 모든 키를 막아, 도구 단추를 누른 뒤 Delete 를 눌러도 물체가 안 지워졌음
  tb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() })
  tb.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return
    try { b.blur() } catch (er) {}   // 0.1.13 누른 뒤 손을 놓음 — 다음 키(Delete · 화살표)가 판으로 가게
    const v = b.getAttribute('data-v'), menu = tb.querySelector('.slc-pm')
    if (b.hasAttribute('data-vt-toggle')) { const m = !tb.classList.contains('min'); tb.classList.toggle('min', m); try { localStorage.setItem('slc-vt-min', m ? '1' : '0') } catch (er) {} b.innerHTML = ic(m ? 'tools' : 'hide') + '<span>' + (m ? '도구' : '숨기기') + '</span>'; return }
    if (b.hasAttribute('data-plate')) { setLookPref({ kind: b.getAttribute('data-plate') }); refreshPlates(); menu.outerHTML = pm(); tb.querySelector('.slc-pm').hidden = false; return }
    if (b.hasAttribute('data-pcolor')) { setLookPref({ color: b.getAttribute('data-pcolor') }); refreshPlates(); menu.outerHTML = pm(); tb.querySelector('.slc-pm').hidden = false; return }
    if (v === 'iso') look([0.75, 0.85, 1])
    else if (v === 'top') look([0, 1, 0.0015])
    else if (v === 'front') look([0, 0.32, 1])
    else if (v === 'side') look([1, 0.32, 0])
    else if (v === 'fit') fit('model')
    else if (v === 'plate') fit('plate')
    else if (v === 'drag') { const on = !b.classList.contains('on'); b.classList.toggle('on', on); setLookPref({ drag: on }); applyArrows(viewOf()) }
    else if (v === 'flip' || v === 'lay') { if (!(v === 'flip' ? flip : layDown)(viewOf())) nope(b) }
    else if (v === 'face') {
      const vw = viewOf(), on = !b.classList.contains('on')
      if (on && !(vw && vw.transform && vw.transform.object)) { nope(b); return }
      b.classList.toggle('on', on); faceMode(vw, on, () => b.classList.remove('on'))
    }
    else if (v === 'auto') { const on = !b.classList.contains('on'); b.classList.toggle('on', on); spin(on) }
    else if (v === 'plateshow') { const on = !b.classList.contains('on'); b.classList.toggle('on', on); setLookPref({ show: on }); refreshPlates() }
    else if (v === 'platepick') { menu.hidden = !menu.hidden }
    else if (v === 'shot') ctx && ctx.shot && ctx.shot()
    else if (v === 'full') ctx && ctx.full && ctx.full()
  })
  return true
}
/** 고른 물체가 없을 때 — 단추를 잠깐 빨갛게 · 흔듦 */
function nope(b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 700) }
export function stopSpin() { spin(false) }
