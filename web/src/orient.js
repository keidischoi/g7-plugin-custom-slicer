// custom-slicer — 🔃 물체 방향 (뒤집기 · 눕히기 · 면으로 놓기) · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)에는 돌리기 손잡이만 있고 「위아래 뒤집기」 · 「면을 골라 바닥에 놓기」가 없음. 0.1.19
//  고른 물체를 돌린 뒤 뷰어의 이동 손잡이가 낼 알림(dragging-changed · objectChange · change)을 그대로 보내서
//  되돌리기(Ctrl+Z) · 바닥 붙이기 · 판 옮김 · 칠한 색 다시 그리기는 뷰어가 원래대로 함. 돌린 뒤에도 판 위 가운데 자리는 그대로.
import { Vector3, Quaternion, Box3, Raycaster, Vector2, Matrix3 } from 'three'

const AX = new Vector3(1, 0, 0), DOWN = new Vector3(0, -1, 0)

/** 고른 물체에 rotate(obj) 를 하고 뷰어에 알림 — 고른 것이 없으면 false */
function apply(v, rotate) {
  const tc = v && v.transform, obj = tc && tc.object
  if (!obj || (obj.userData && obj.userData.isPrimeTower)) return false
  const send = (type, value) => tc.dispatchEvent(value === undefined ? { type } : { type, value })
  v.__slcRotOp = true   // freedrag.js 의 잔상 막기가 덧칠을 따라 옮기지 않고 숨기게 (돌리면 위치만으로는 못 따라감)
  try {
    send('dragging-changed', true)   // 뷰어: 되돌리기 저장
    const c0 = new Box3().setFromObject(obj).getCenter(new Vector3())
    rotate(obj)
    obj.updateMatrixWorld(true)
    const c1 = new Box3().setFromObject(obj).getCenter(new Vector3())
    obj.position.x += c0.x - c1.x; obj.position.z += c0.z - c1.z   // 판 위 가운데 자리는 그대로
    obj.updateMatrixWorld(true)
    send('objectChange'); send('change')
    send('dragging-changed', false)   // 뷰어: 바닥에 붙이고 저장
  } finally { v.__slcRotOp = false }
  if (v.invalidate) v.invalidate()
  return true
}

/** 위아래 뒤집기 (앞뒤 축으로 180°) */
export const flip = (v) => apply(v, (o) => o.rotateOnWorldAxis(AX, Math.PI))
/** 앞으로 눕히기 (앞뒤 축으로 90°) */
export const layDown = (v) => apply(v, (o) => o.rotateOnWorldAxis(AX, Math.PI / 2))
/** 이 방향(판 좌표)을 바닥으로 */
export const onFace = (v, normal) => apply(v, (o) => o.quaternion.premultiply(new Quaternion().setFromUnitVectors(normal.clone().normalize(), DOWN)))

const hooked = new WeakSet()
/** 「면으로 놓기」 고르기 — 켠 뒤 물체의 면을 누르면 그 면이 바닥으로. 한 번 놓거나 빈 곳 · Esc 면 끝. onEnd(): 단추 끄기 */
export function faceMode(v, on, onEnd) {
  const el = v && v.renderer && v.renderer.domElement; if (!el) return
  v.__slcFace = on ? { onEnd } : null
  el.style.cursor = on ? 'crosshair' : ''
  if (hooked.has(el)) return
  hooked.add(el)
  const ray = new Raycaster(), ndc = new Vector2()
  const end = () => { const f = v.__slcFace; v.__slcFace = null; el.style.cursor = ''; if (f && f.onEnd) f.onEnd() }
  // 뷰어가 누른 물체를 고른 다음(같은 칸 · 나중에 붙임)에 돌아 — 고른 물체의 면을 찾음
  el.addEventListener('pointerdown', (e) => {
    if (!v.__slcFace || e.button !== 0) return
    const tc = v.transform, obj = tc && tc.object
    if (!obj || tc.axis) { end(); return }   // 빈 곳을 누름
    const r = el.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, v.camera)
    const bodies = obj.isMesh ? [obj] : obj.children.filter((c) => c.isMesh)
    const hit = ray.intersectObjects(bodies, false)[0]
    if (!hit || !hit.face) { end(); return }
    const n = hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld))
    onFace(v, n)
    v.orbit.enabled = false   // 이번 누르기로 판이 돌지 않게 — 떼면 다시
    const back = () => { v.orbit.enabled = true; window.removeEventListener('pointerup', back, true) }
    window.addEventListener('pointerup', back, true)
    end()
  })
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && v.__slcFace) end() })
}
