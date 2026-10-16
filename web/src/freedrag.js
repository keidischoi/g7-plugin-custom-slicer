// custom-slicer — ✋ 물체 끌어 옮기기 · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 화살표(이동 손잡이)를 잡아야만 옮겨짐. 0.1.15 고른 물체의 몸을 잡고 끌면 판 위(바닥과 나란히)를 자유롭게 옮김.
//  뷰어의 이동 손잡이(TransformControls)가 끌 때 내는 것과 같은 알림(dragging-changed · objectChange · change)을 보내서
//  되돌리기 · 판 옮김 · 바닥 붙이기 · 오버행 다시 그리기는 뷰어가 원래대로 함. 🧰 도구의 ✋ 단추로 끔 (lookPref().drag)
import { Raycaster, Vector2, Vector3, Plane } from 'three'
import { lookPref } from './plate.js'

const done = new WeakSet()

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
  v.transform.addEventListener('change', () => applyArrows(v))   // 뷰어가 이동 · 돌리기 · 크기를 바꿀 때마다
  const ray = new Raycaster(), ndc = new Vector2(), plane = new Plane(), hit = new Vector3()
  let arm = null   // { obj, x, y, start, pos0, on, cursor }
  const aim = (e) => {
    const r = el.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, v.camera)
  }
  const shown = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true }
  const send = (type, value) => { try { v.transform.dispatchEvent(value === undefined ? { type } : { type, value }) } catch (er) {} }

  // 뷰어의 pointerdown(물체 고르기) 다음에 돌아야 해서 같은 칸에 나중에 붙임 — 누른 물체가 이미 골라져 이동 손잡이가 붙어 있음
  el.addEventListener('pointerdown', (e) => {
    arm = null
    if (lookPref().drag === false || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
    const tc = v.transform, obj = tc.object
    if (!obj || tc.dragging || tc.axis || tc.mode !== 'translate' || !v.orbit.enabled) return   // 손잡이를 잡음 · 크기 · 돌리기 · 칠하기 중
    if (v.toolpathGroup && v.toolpathGroup.visible) return   // 미리 보기(슬라이스 결과) 화면
    aim(e)
    // 0.1.17 고른 물체(여럿이면 묶음 안 물체)의 몸에만 광선 — 칠한 덧칠 · 다른 물체까지 보면 큰 모델에서 누를 때마다 100ms 넘게 걸림
    const bodies = (obj.isMesh ? [obj] : obj.children.filter((c) => c.isMesh)).filter(shown)
    const first = ray.intersectObjects(bodies, false)[0]
    if (!first) return   // 고른 물체의 몸이 아님 (빈 곳 · 다른 물체)
    plane.set(new Vector3(0, 1, 0), -first.point.y)
    arm = { obj, x: e.clientX, y: e.clientY, start: first.point.clone(), pos0: obj.getWorldPosition(new Vector3()), on: false, cursor: el.style.cursor }
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
