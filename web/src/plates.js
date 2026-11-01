// custom-slicer — 🧩 판 옆 단추 (추가 · 정렬 · 잠금 · 지우기) · AGPL-3.0-or-later
//  뷰어의 판 번호 줄은 오른쪽 아래 그대로 쓰고, 뱀부 스튜디오처럼 판마다 오른쪽 가장자리 옆 바닥에 단추를 눕혀 놓음 (카메라 · 확대를 따라감).
//  판 추가 · 마지막 판 지우기는 뷰어의 숨긴 단추를 누름. 정렬은 뷰어에 없어서(Not implemented) 직접 — 옮긴 뒤 뷰어에 끌기와 같은 알림을 보냄 (freedrag.js)
import { Box3, Vector3 } from 'three'
import { viewOf, plateLook } from './plate.js'
import { packPlate } from './util.js'

const GAP = 5, MARGIN = 3, BTN = 32, PAINT_ORDER = 999
const IC = {
  add: '<path d="M12 5v14M5 12h14"/>',
  arrange: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="4" rx="1"/><rect x="13" y="10" width="7" height="10" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  del: '<path d="M6 6l12 12M18 6 6 18"/>',
}
const ic = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'

export const PLATE_CSS = `
.plate-add,.plate-del{display:none!important}
.slc-pbw{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:20}
.slc-pv .slc-pbw{display:none}
.slc-pb{position:absolute;left:0;top:0;width:32px;height:32px;margin:-16px 0 0 -16px;display:grid;place-items:center;padding:0;border:0;border-radius:0 10px 10px 0;background:var(--slc-pb,#1a1d22);color:var(--slc-pbi,#d7dce3);cursor:pointer;pointer-events:auto;transition:background .12s}
.slc-pb svg{width:19px;height:19px}
.slc-pb:hover{background:var(--_accent,#0ea5e9);color:#fff}
.slc-pb.on{color:var(--_accent,#0ea5e9)}
.slc-pb[hidden]{display:none}
.slc-pb.nope{background:#ef4444}
.slc-pn{position:absolute;left:0;top:0;display:flex;align-items:center;gap:6px;height:18px;transform-origin:0 0;color:var(--_accent,#0ea5e9);font:800 16px/18px system-ui,sans-serif;white-space:nowrap;pointer-events:none}
.slc-pn[hidden]{display:none}
.slc-pn.no{opacity:.45}
.slc-pn button{display:grid;place-items:center;width:18px;height:18px;padding:0;border:0;background:none;color:inherit;cursor:pointer;pointer-events:auto}
.slc-pn svg{width:15px;height:15px}
.slc-pn button{position:relative}
.slc-pn button::after{content:"";position:absolute;inset:-22px -8px}
.slc-pni{position:absolute;width:180px;height:30px;padding:0 8px;border:1px solid var(--_accent,#0ea5e9);border-radius:8px;background:#0f172a;color:#fff;font-size:14px;pointer-events:auto}
.slc-pbmsg{position:absolute;left:50%;top:14px;translate:-50% 0;max-width:80%;padding:7px 12px;border-radius:10px;background:rgba(15,23,42,.9);color:#fff;font-size:13px;pointer-events:none}
`

/** 판 크기 · 자리 — 뷰어가 판마다 만든 테두리 기준 */
function bedOf(b) {
  const m = b.slcPlate || b.border, s = m.userData && m.userData.slcPlate
  let w = s && s.w, d = s && s.d
  if (!w || !d) {
    const g = b.border.geometry; if (!g.boundingBox) g.computeBoundingBox()
    w = g.boundingBox.max.x - g.boundingBox.min.x; d = Math.max(g.boundingBox.max.y - g.boundingBox.min.y, g.boundingBox.max.z - g.boundingBox.min.z)
  }
  return { x: b.border.position.x, z: b.border.position.z, w, d }
}

/** 물체 목록 — 뷰어의 물체 번호와 3D 몸을 자리로 맞춤 (번호는 sceneSnapshot 에만, 몸은 objectsGroup 에만 있음) */
function objects(v, api) {
  const left = v.objectsGroup.children.filter((c) => c.isMesh && c.renderOrder !== PAINT_ORDER && c.visible && !c.userData.isPrimeTower)
  const out = []
  for (const s of api.sceneSnapshot()) {
    const i = left.findIndex((m) => m.position.distanceToSquared(s.pos) < 1e-8 && m.scale.distanceToSquared(s.scale) < 1e-8)
    if (i < 0) continue
    const mesh = left.splice(i, 1)[0]
    out.push({ id: s.id, mesh, plate: api.plateOfObject({ mesh }) })
  }
  return out
}

/** 옮기기 — 뷰어의 되돌리기 · 판 옮김 · 다시 그리기를 끌기와 같은 알림으로. 첫 물체 앞에서만 시작 알림 → Ctrl+Z 한 번에 모두 */
function moveAll(v, api, list) {
  const send = (value) => { try { v.transform.dispatchEvent({ type: 'dragging-changed', value }) } catch (e) {} }
  list.forEach((it, i) => {
    api.selectObject(it.id)
    if (i === 0) send(true)
    it.mesh.position.x += it.dx; it.mesh.position.z += it.dz
    it.mesh.updateMatrixWorld(true)
    send(false)
  })
  api.clearSelection(); if (v.invalidate) v.invalidate()
}

/** 판 모두가 보이게 — 보는 방향은 그대로, 거리만 칸 크기에 맞춤 */
function fitBeds(v, c) {
  if (!v.orbit || !v.plateBeds.length) return
  const d = v.camera.position.clone().sub(v.orbit.target); if (d.lengthSq() < 1) return
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
  for (const b of v.plateBeds) { const s = bedOf(b); x0 = Math.min(x0, s.x - s.w / 2); x1 = Math.max(x1, s.x + s.w / 2); z0 = Math.min(z0, s.z - s.d / 2); z1 = Math.max(z1, s.z + s.d / 2) }
  d.normalize(); v.orbit.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
  v.camera.position.copy(v.orbit.target).addScaledVector(d, Math.max(x1 - x0, z1 - z0) * 1.9 / Math.min(1, c.width / c.height))
  v.orbit.update(); v.invalidate && v.invalidate()
}

export function mountPlates(root, col) {
  if (!col || col.querySelector('.slc-pbw')) return
  const wrap = document.createElement('div'); wrap.className = 'slc-pbw'; col.appendChild(wrap)
  const locks = new Set(), names = new Map(), pool = []
  let tm = 0
  const say = (t) => {
    let m = wrap.querySelector('.slc-pbmsg'); if (!m) { m = document.createElement('div'); m.className = 'slc-pbmsg'; wrap.appendChild(m) }
    m.textContent = t; clearTimeout(tm); tm = setTimeout(() => m.remove(), 4000)
  }
  const nope = (b, t) => { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); if (t) say(t) }
  const api = () => (globalThis.__vpApi ? globalThis.__vpApi() : null)

  const arrange = (i, b) => {
    const v = viewOf(), A = api(); if (!v || !A) return
    if (locks.has(i)) { nope(b, '잠긴 판이에요 — 자물쇠를 풀면 정렬할 수 있어요.'); return }
    const bed = bedOf(v.plateBeds[i]), items = objects(v, A).filter((o) => o.plate === i)
    if (!items.length) { nope(b, '이 판에 물체가 없어요.'); return }
    A.clearSelection()
    for (const it of items) { it.box = new Box3().setFromObject(it.mesh, true); it.w = it.box.max.x - it.box.min.x; it.d = it.box.max.z - it.box.min.z }
    const spots = packPlate(items.map((o) => ({ w: o.w, d: o.d })), bed.w - MARGIN * 2, bed.d - MARGIN * 2, GAP)
    if (!spots) { nope(b, '물체가 판에 다 안 들어가요 — 다른 판으로 옮기거나 크기를 줄여 주세요.'); return }
    moveAll(v, A, items.map((o, k) => ({ id: o.id, mesh: o.mesh, dx: bed.x + spots[k].x - (o.box.min.x + o.box.max.x) / 2, dz: bed.z + spots[k].z - (o.box.min.z + o.box.max.z) / 2 })))
  }

  const remove = async (i, b) => {
    const v = viewOf(), A = api(), n = v ? v.plateBeds.length : 0; if (!A) return
    if (n <= 1) { nope(b, '판이 하나뿐이라 지울 수 없어요.'); return }
    if (locks.has(i)) { nope(b, '잠긴 판이에요 — 자물쇠를 풀면 지울 수 있어요.'); return }
    const all = objects(v, A), mine = all.filter((o) => o.plate === i), later = all.filter((o) => o.plate > i)
    if (mine.length && !confirm('판 ' + (i + 1) + ' 과 물체 ' + mine.length + '개를 지울까요?')) return
    const beds = v.plateBeds.map(bedOf)
    // 뷰어의 지우기 단추는 고른 것 하나만 지움 — 하나씩
    const d = root.querySelector('[data-testid="tool-delete"]')
    for (const o of mine) { A.selectObject(o.id); if (d) d.click(); await new Promise((r) => setTimeout(r, 30)) }
    // 뷰어는 마지막 판만 지움 — 뒤 판의 물체를 한 칸씩 당긴 뒤 마지막 판을 지움
    if (later.length) moveAll(v, A, later.map((o) => ({ id: o.id, mesh: o.mesh, dx: beds[o.plate - 1].x - beds[o.plate].x, dz: beds[o.plate - 1].z - beds[o.plate].z })))
    const next = new Set(); for (const k of locks) next.add(k > i ? k - 1 : k); locks.clear(); next.forEach((k) => locks.add(k))
    const nx = new Map(); for (const [k, t] of names) if (k !== i) nx.set(k > i ? k - 1 : k, t); names.clear(); nx.forEach((t, k) => names.set(k, t))
    const pd = root.querySelector('[data-testid="plate-del"]'); if (pd) pd.click()
  }

  // 0.1.63 판 이름 — 연필을 누르면 그 자리에 입력 칸 · Enter 또는 칸 밖을 누르면 저장 · Esc 취소
  const nameEdit = (i, nb) => {
    const r = nb.getBoundingClientRect(), c = col.getBoundingClientRect(), t = document.createElement('input')
    let done = false
    const end = (ok) => { if (done) return; done = true; if (ok) { const v = t.value.trim(); if (v) names.set(i, v); else names.delete(i) } t.remove() }
    t.className = 'slc-pni'; t.maxLength = 30; t.value = names.get(i) || ''; t.placeholder = '판 이름'
    t.style.left = Math.max(4, Math.min(r.left - c.left, c.width - 190)) + 'px'; t.style.top = Math.max(4, r.top - c.top) + 'px'
    wrap.appendChild(t); t.focus(); t.select()
    t.onblur = () => end(true)
    for (const ev of ['pointerdown', 'mousedown']) t.addEventListener(ev, (e) => e.stopPropagation())
    t.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false) }
  }

  const make = (i) => {
    const B = (k, tip) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'slc-pb'; b.title = tip; b.setAttribute('aria-label', tip); b.innerHTML = ic(k); b.setAttribute('data-pb', k); wrap.appendChild(b); return b }
    const s = [B('add', '판 추가'), B('arrange', '이 판 자동 정렬'), B('lock', '판 잠금 — 잠그면 정렬 · 지우기를 하지 않아요'), B('del', '이 판 지우기')]
    for (const b of s) for (const ev of ['pointerdown', 'mousedown', 'wheel']) b.addEventListener(ev, (e) => e.stopPropagation())
    s[0].onclick = () => { const a = root.querySelector('[data-testid="plate-add"]'); if (!a || a.disabled) { nope(s[0], '판은 9개까지예요.'); return } a.click() }
    s[1].onclick = () => arrange(i, s[1])
    s[2].onclick = () => { if (locks.has(i)) locks.delete(i); else locks.add(i) }
    s[3].onclick = () => remove(i, s[3])
    const nb = document.createElement('div'); nb.className = 'slc-pn'; nb.hidden = true; nb.innerHTML = '<span></span><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg></button>'
    const pen = nb.lastChild; pen.title = '판 이름 고치기'; pen.setAttribute('aria-label', '판 이름 고치기'); wrap.appendChild(nb); s.nb = nb
    for (const ev of ['pointerdown', 'mousedown']) pen.addEventListener(ev, (e) => e.stopPropagation())
    pen.onclick = () => nameEdit(i, nb)
    return s
  }

  // 판 바닥의 단추 자리를 화면으로 — 판과 같은 기울기로 눕힘 (mm 크기라 확대하면 같이 커짐)
  const p = new Vector3(), scr = (v, r, c, x, z) => { p.set(x, 0, z).project(v.camera); return [(p.x + 1) / 2 * r.width + r.left - c.left, (1 - p.y) / 2 * r.height + r.top - c.top, p.z] }
  let frame = 0, refit = 0
  const tick = () => {
    if (!col.isConnected) return
    requestAnimationFrame(tick)
    const v = viewOf(); if (!v || !v.plateBeds || !v.camera || !v.renderer) return
    const r = v.renderer.domElement.getBoundingClientRect(), c = col.getBoundingClientRect(), n = v.plateBeds.length
    v.camera.updateMatrixWorld()
    while (pool.length < n) pool.push(make(pool.length))
    // 0.1.64 처음 열 때 · 0.1.67 빈 판에 모델을 넣을 때 판 전체가 보이게 — 뷰어는 모델로 바짝 다가가서 판 옆 단추가 화면 밖으로 나감
    const cnt = v.objectsGroup ? v.objectsGroup.children.length : 0
    if (!v.__slcFit && frame > 20 && c.width > 200) { v.__slcFit = true; fitBeds(v, c) }
    if (!v.__slcN && cnt > 0) refit = frame + 40   // 지난 작업이 복원돼도 같게
    v.__slcN = cnt
    if (refit && frame >= refit) { refit = 0; fitBeds(v, c) }
    // 단추 색 = 판 몸체 색 (판 종류 · 색을 바꾸면 따라감) — 프레임마다 볼 필요 없어 가끔만
    if (!(frame++ % 30)) {
      const hex = String(plateLook().base)
      if (/^#[0-9a-f]{6}$/i.test(hex) && wrap.__pb !== hex) {
        wrap.__pb = hex; wrap.style.setProperty('--slc-pb', hex)
        const n6 = parseInt(hex.slice(1), 16), lum = (0.299 * (n6 >> 16) + 0.587 * ((n6 >> 8) & 255) + 0.114 * (n6 & 255)) / 255
        wrap.style.setProperty('--slc-pbi', lum > 0.55 ? '#1f2937' : '#d7dce3')
      }
    }
    pool.forEach((s, i) => {
      const b = i < n ? v.plateBeds[i] : null
      if (!b || !b.border) { for (const x of s) x.hidden = true; s.nb.hidden = true; return }
      const bed = bedOf(b), mm = Math.max(14, Math.min(bed.w, bed.d) * 0.09), half = mm / 2
      s.forEach((x, k) => {
        const px = bed.x + bed.w / 2 + half, pz = bed.z - bed.d / 2 + mm * (0.9 + k * 1.15)   // 판 몸체에 틈 없이 붙은 탭
        const o = scr(v, r, c, px, pz), ax = scr(v, r, c, px + half, pz), az = scr(v, r, c, px, pz + half)
        const m = [(ax[0] - o[0]) / (BTN / 2), (ax[1] - o[1]) / (BTN / 2), (az[0] - o[0]) / (BTN / 2), (az[1] - o[1]) / (BTN / 2)]
        const big = Math.hypot(m[0], m[1]) * BTN >= 8 && Math.hypot(m[2], m[3]) * BTN >= 6
        x.hidden = !big || o[2] > 1 || o[0] < 0 || o[1] < 0 || o[0] > c.width || o[1] > c.height
        if (!x.hidden) x.style.transform = 'matrix(' + m.map((t) => t.toFixed(4)).join(',') + ',' + o[0].toFixed(1) + ',' + o[1].toFixed(1) + ')'
      })
      const ns = 0.7, nx = bed.x - bed.w / 2, nz = bed.z - bed.d / 2 - 5 - 18 * ns, n0 = scr(v, r, c, nx, nz), n1 = scr(v, r, c, nx + 16 * ns, nz), n2 = scr(v, r, c, nx, nz + 16 * ns)
      s.nb.hidden = n0[2] > 1 || n0[0] < -150 || n0[1] < -30 || n0[0] > c.width || n0[1] > c.height
      if (!s.nb.hidden) {
        s.nb.style.transform = 'matrix(' + [(n1[0] - n0[0]) / 16, (n1[1] - n0[1]) / 16, (n2[0] - n0[0]) / 16, (n2[1] - n0[1]) / 16].map((t) => t.toFixed(4)).join(',') + ',' + n0[0].toFixed(1) + ',' + n0[1].toFixed(1) + ')'
        const nm = names.get(i) || ''; if (s.nb.firstChild.textContent !== nm) s.nb.firstChild.textContent = nm; s.nb.classList.toggle('no', !nm)
      }
      const lk = locks.has(i), lb = s[2]
      if (lb.classList.contains('on') !== lk) { lb.classList.toggle('on', lk); lb.innerHTML = ic(lk ? 'lock' : 'unlock') }
    })
  }
  tick()
}
