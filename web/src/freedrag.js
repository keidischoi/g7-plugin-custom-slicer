// custom-slicer — ✋ 물체 끌어 옮기기 · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 화살표(이동 손잡이)를 잡아야만 옮겨짐. 0.1.15 고른 물체의 몸을 잡고 끌면 판 위(바닥과 나란히)를 자유롭게 옮김.
//  뷰어의 이동 손잡이(TransformControls)가 끌 때 내는 것과 같은 알림(dragging-changed · objectChange · change)을 보내서
//  되돌리기 · 판 옮김 · 바닥 붙이기 · 오버행 다시 그리기는 뷰어가 원래대로 함. 🧰 도구의 ✋ 단추로 끔 (lookPref().drag)
import { Raycaster, Vector2, Vector3, Plane, Box3 } from 'three'
import { lookPref } from './plate.js'

const done = new WeakSet()
const PAINT_ORDER = 999   // 뷰어가 칠한 색 덧칠 메시에 주는 renderOrder

/** 0.1.18 옮기는 동안 잔상 — 칠한 색 덧칠은 물체의 자식이 아니라 판 전체 좌표로 따로 있어서, 끄는 동안 제자리에 남고
 *  놓은 뒤 뷰어가 새로 만들 때까지(큰 모델은 몇 초) 옛 자리에 색이 남았음. 끄기 시작할 때 고른 물체 안에만 있는 덧칠은
 *  같이 옮기고, 다른 물체와 섞인 덧칠은 끄는 동안 숨김. 놓으면 뷰어가 새 덧칠로 바꿈 (안 바꾸면 10초 뒤 다시 보임) */
function ghostFix(v) {
  const tc = v.transform
  let run = null   // { obj, p0, follow: [{ m, w0 }], hidden: [m] }
  const box = new Box3(), ob = new Box3(), tmp = new Vector3()
  const overlays = (sel) => v.objectsGroup.children.filter((c) => c.isMesh && c.renderOrder === PAINT_ORDER && c.visible && !sel.has(c))
  const front = (type, fn) => { tc.addEventListener(type, fn); const L = tc._listeners && tc._listeners[type]; if (L && L[L.length - 1] === fn) { L.pop(); L.unshift(fn) } }
  front('dragging-changed', (e) => {   // 0.1.19 뷰어 처리보다 먼저 — 뷰어가 덧칠을 다시 만들지 정하기 전에 __slcFollowPaint 를 맞춤
    const obj = tc.object
    if (e.value) {
      globalThis.__slcFollowPaint = false
      if (!obj) return
      const sel = new Set(); obj.traverse((n) => sel.add(n))
      box.setFromObject(obj).expandByScalar(0.5)
      run = { obj, p0: obj.getWorldPosition(new Vector3()), follow: [], hidden: [] }
      for (const m of overlays(sel)) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
        ob.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)
        if (!ob.intersectsBox(box)) continue   // 다른 물체의 색 — 그대로
        if (tc.mode === 'translate' && !v.__slcRotOp && box.containsBox(ob)) run.follow.push({ m, w0: m.getWorldPosition(new Vector3()) })
        else { m.visible = false; run.hidden.push(m) }
      }
      globalThis.__slcFollowPaint = run.follow.length > 0 && !run.hidden.length   // 덧칠을 다 따라 옮길 수 있으면 뷰어의 다시 만들기를 건너뜀
      return
    }
    globalThis.__slcFollowPaint = false
    if (!run) return
    const r = run; run = null
    setTimeout(() => {   // 뷰어가 덧칠을 새로 만들면 옛 것은 판에서 빠짐 — 남아 있으면(안 바뀜) 되돌림
      for (const m of r.hidden) if (m.parent) m.visible = true
      for (const f of r.follow) if (f.m.parent) { f.m.position.copy(f.m.parent.worldToLocal(f.w0.clone())); f.m.updateMatrixWorld(true) }
      if (v.invalidate) v.invalidate()
    }, 10000)
  })
  // 0.1.19 칠한 물체를 지워도(Delete) 덧칠이 판에 남던 것 — 물체가 빠지면, 어떤 물체와도 겹치지 않는 덧칠은 숨김
  const g = v.objectsGroup, rm = g.remove.bind(g)
  let tm = 0
  g.remove = (...a) => {
    const r = rm(...a)
    clearTimeout(tm); tm = setTimeout(() => {
      const bodies = g.children.filter((c) => c.isMesh && c.renderOrder !== PAINT_ORDER && c.visible).map((c) => new Box3().setFromObject(c).expandByScalar(0.5))
      for (const m of g.children) {
        if (!m.isMesh || m.renderOrder !== PAINT_ORDER || !m.visible) continue
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
        ob.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)
        if (!bodies.some((b) => b.intersectsBox(ob))) m.visible = false
      }
      if (v.invalidate) v.invalidate()
    }, 0)
    return r
  }
  // 0.1.19 칠한 물체를 고르면 표시 — 뷰어는 물체 몸을 빛나게(emissive) 하는데, 칠한 물체는 덧칠이 몸을 덮어 고른 줄 몰랐음
  //  (네모 상자도 숨겼으므로) → 고른 물체와 겹치는 덧칠도 같은 색으로 살짝 빛나게
  let hiKey = ''
  setInterval(() => {
    const obj = tc.object, ov = g.children.filter((c) => c.isMesh && c.renderOrder === PAINT_ORDER && c.material && c.material.emissive)
    const key = (obj ? obj.uuid : '') + '|' + ov.map((m) => m.uuid).join(',')
    if (key === hiKey) return
    hiKey = key
    const sel = obj ? new Box3().setFromObject(obj).expandByScalar(0.5) : null
    for (const m of ov) {
      let on = false
      if (sel) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); ob.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); on = sel.containsBox(ob) }
      m.material.emissive.set(on ? 0x1d6b96 : 0x000000)
    }
    if (v.invalidate) v.invalidate()
  }, 250)
  tc.addEventListener('objectChange', () => {
    if (!run || !run.follow.length) return
    const d = run.obj.getWorldPosition(tmp).sub(run.p0)
    for (const f of run.follow) { const w = f.w0.clone().add(d); f.m.position.copy(f.m.parent ? f.m.parent.worldToLocal(w) : w); f.m.updateMatrixWorld(true) }
  })
}

/** 0.1.17 끌어 옮기기가 켜져 있으면 이동 화살표(손잡이)를 숨김 — 끌어서 옮기니 필요 없음. 끄면 다시 보임 (축 하나로만 옮길 때).
 *  돌리기 · 크기 손잡이는 그대로. 숨긴 손잡이는 잡히지도 않음 (TransformControls 는 보이는 손잡이만 잡음) */
export function applyArrows(v) {
  const tc = v && v.transform; if (!tc) return
  const hide = lookPref().drag !== false && tc.mode === 'translate'
  if (tc.showX !== !hide) tc.showX = !hide
  if (tc.showZ !== !hide) tc.showZ = !hide
  if (v.invalidate) v.invalidate()
}

/** v: 뷰어 3D 상태 ({ camera, renderer, orbit, transform, objectsGroup, toolpathGroup, invalidate }) — 한 번만 붙음 */
export function attachDrag(v) {
  const el = v && v.renderer && v.renderer.domElement
  if (!el || !v.transform || !v.orbit || !v.camera || !v.objectsGroup || done.has(el)) return
  done.add(el)
  applyArrows(v)
  ghostFix(v)   // 0.1.18 화살표로 옮길 때도 같이
  v.transform.addEventListener('change', () => applyArrows(v))   // 뷰어가 이동 · 돌리기 · 크기를 바꿀 때마다
  const ray = new Raycaster(), ndc = new Vector2(), plane = new Plane(), hit = new Vector3()
  let arm = null   // { obj, x, y, start, pos0, on, cursor }
  const aim = (e) => {
    const r = el.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, v.camera)
  }
  const send = (type, value) => { try { v.transform.dispatchEvent(value === undefined ? { type } : { type, value }) } catch (er) {} }

  // 뷰어의 pointerdown(물체 고르기) 다음에 돌아야 해서 같은 칸에 나중에 붙임 — 누른 물체가 이미 골라져 이동 손잡이가 붙어 있음
  el.addEventListener('pointerdown', (e) => {
    arm = null
    if (lookPref().drag === false || v.__slcFace || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
    const tc = v.transform, obj = tc.object
    if (!obj || tc.dragging || tc.axis || tc.mode !== 'translate' || !v.orbit.enabled) return   // 손잡이를 잡음 · 크기 · 돌리기 · 칠하기 중
    if (v.toolpathGroup && v.toolpathGroup.visible) return   // 미리 보기(슬라이스 결과) 화면
    // 0.1.19 광선을 다시 쏘지 않음 — 바로 앞의 뷰어 pointerdown 이 누른 곳의 물체를 골랐고(빈 곳이면 고름을 풀어 obj 가 없음),
    //  큰 모델은 광선 한 번에 40~50ms. 끄는 높이는 물체 가운데 높이의 수평면
    aim(e)
    const mid = new Box3().setFromObject(obj).getCenter(new Vector3()), start = new Vector3()
    plane.set(new Vector3(0, 1, 0), -mid.y)
    if (!ray.ray.intersectPlane(plane, start)) return
    arm = { obj, x: e.clientX, y: e.clientY, start, pos0: obj.getWorldPosition(new Vector3()), on: false, cursor: el.style.cursor }
    v.orbit.enabled = false   // 판이 돌지 않게 — 끌지 않고 떼면 다시 켬
    try { el.setPointerCapture(e.pointerId) } catch (er) {}
  })
  el.addEventListener('pointermove', (e) => {
    if (!arm) return
    if (!arm.on) {
      if (Math.hypot(e.clientX - arm.x, e.clientY - arm.y) < 4) return   // 그냥 누르기(고르기)는 옮기지 않음
      arm.on = true
      send('dragging-changed', true)   // 뷰어: 되돌리기 저장 · 판 돌리기 끔
      el.style.cursor = 'grabbing'
    }
    aim(e)
    if (!ray.ray.intersectPlane(plane, hit)) return
    const w = arm.pos0.clone().add(new Vector3(hit.x - arm.start.x, 0, hit.z - arm.start.z)), o = arm.obj
    o.position.copy(o.parent ? o.parent.worldToLocal(w) : w)
    o.updateMatrixWorld(true)
    send('objectChange'); send('change')
    if (v.invalidate) v.invalidate()
  })
  const up = () => {
    if (!arm) return
    const a = arm; arm = null
    if (a.on) { el.style.cursor = a.cursor; send('dragging-changed', false) }   // 뷰어: 바닥 붙이기 · 판 옮김 · 저장
    else v.orbit.enabled = true
    if (v.invalidate) v.invalidate()
  }
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('lostpointercapture', up)
}
