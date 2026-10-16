// custom-slicer — 📐 3MF 자리 지키기 · 판 안으로 · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 파일에서 물체를 하나씩 올릴 때마다 물체의 원래 자리를 버리고(가운데로 옮기고 바닥에 붙임)
//  옆으로 한 줄씩 늘어놓아서, 여러 물체가 맞물린 3MF 가 부품마다 흩어지고 판 밖까지 줄지어 나갔음.
//  0.1.43 파일을 읽을 때 물체마다 원래 자리(가운데 X · Y, 바닥 높이)를 기억했다가(build.mjs 갈고리), 같은 파일의 물체들을
//  원래 모양대로 다시 맞추고 묶음째 지금 판의 빈자리에 놓음. 물체 하나가 판 밖에 놓였을 때도 판 안 빈자리로.
//  프로젝트 3MF(Bambu · Orca)가 판 자리를 가지고 있으면 뷰어가 그 자리로 놓으므로 건드리지 않음.
import { Box3, Vector3 } from 'three'
import { viewOf } from './plate.js'

/** 파일의 삼각형 좌표(모델 좌표, mm · Z 가 위) → 원래 자리 { cx, cy, z0, w, d, h } */
export function originOf(tris) {
  if (!tris || tris.length < 9) return null
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2]
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z0, w: x1 - x0, d: y1 - y0, h: z1 - z0, x0, x1, y0, y1 }
}
globalThis.__slcOrg = originOf

/** 지금 판 (고른 판 · 없으면 첫 판) → { x, z, w, d } (3D 좌표: x 오른쪽 · z 앞) */
function plateOf(v) {
  const beds = (v && v.plateBeds) || []
  const pick = beds.find((b) => b.slcPlate && b.slcPlate.userData.slcPlate && b.slcPlate.userData.slcPlate.selected) || beds.find((b) => b.slcPlate && b.slcPlate.userData.slcPlate)
  if (!pick) return null
  const m = pick.slcPlate, u = m.userData.slcPlate
  return { x: m.position.x, z: m.position.z, w: u.w, d: u.d }
}

/** 판 안에서 footprint(w × d)가 다른 물체와 안 겹치는 가운데 자리 — 가운데부터 바깥으로 10mm 씩 찾음. 못 찾으면 판 가운데 */
function freeSpot(plate, w, d, others) {
  const gap = 4, hw = w / 2, hd = d / 2
  const ok = (x, z) => x - hw >= plate.x - plate.w / 2 + 2 && x + hw <= plate.x + plate.w / 2 - 2 && z - hd >= plate.z - plate.d / 2 + 2 && z + hd <= plate.z + plate.d / 2 - 2 &&
    others.every((b) => x + hw + gap <= b.min.x || x - hw - gap >= b.max.x || z + hd + gap <= b.min.z || z - hd - gap >= b.max.z)
  if (ok(plate.x, plate.z)) return { x: plate.x, z: plate.z }
  const R = Math.max(plate.w, plate.d)
  for (let r = 10; r <= R; r += 10) {
    for (let a = 0; a < 360; a += Math.max(8, 360 / (r / 5))) {
      const x = plate.x + r * Math.cos(a * Math.PI / 180), z = plate.z + r * Math.sin(a * Math.PI / 180)
      if (ok(x, z)) return { x, z }
    }
  }
  return { x: plate.x, z: plate.z }
}

/** 뷰어 불러오기 갈고리 — added: [{ id, objectid, org }], v: { api, objects(뷰어 물체 목록), project, view } */
export function placeAdded(added, v) {
  try {
    const view = (v && v.view) || viewOf(), objs = (v && v.objects) || []
    const plate = plateOf(view); if (!plate || !added || !added.length) return
    if (v.project && Array.isArray(v.project.plates) && v.project.plates.length) return   // 프로젝트가 판 자리를 가짐 — 뷰어가 놓음
    const mine = added.map((a) => ({ a, o: objs.find((x) => x.id === a.id) })).filter((x) => x.o && x.o.mesh)
    if (!mine.length) return
    const ids = new Set(mine.map((x) => x.a.id))
    const others = objs.filter((x) => !ids.has(x.id) && x.mesh && x.visible !== false).map((x) => new Box3().setFromObject(x.mesh))
    const box = new Box3(), tmp = new Box3()
    if (mine.length > 1 && mine.every((x) => x.a.org)) {
      // 여러 물체 — 원래 모양대로: 모델 좌표 X → 3D x, 모델 Y → 3D -z, 모델 Z → 3D y (바닥 = 가장 낮은 물체의 바닥)
      let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity, gz0 = Infinity
      for (const { a } of mine) { const g = a.org; gx0 = Math.min(gx0, g.x0); gx1 = Math.max(gx1, g.x1); gy0 = Math.min(gy0, g.y0); gy1 = Math.max(gy1, g.y1); gz0 = Math.min(gz0, g.z0) }
      const spot = freeSpot(plate, gx1 - gx0, gy1 - gy0, others), gcx = (gx0 + gx1) / 2, gcy = (gy0 + gy1) / 2
      for (const { a, o } of mine) {
        const g = a.org
        o.mesh.position.set(spot.x + (g.cx - gcx), Math.max(0, g.z0 - gz0), spot.z - (g.cy - gcy))
        o.mesh.updateMatrixWorld(true)
      }
    } else {
      // 하나씩 — 판 밖(또는 판에 걸침)이면 판 안 빈자리로
      const pb = new Box3(new Vector3(plate.x - plate.w / 2, -1, plate.z - plate.d / 2), new Vector3(plate.x + plate.w / 2, 1e6, plate.z + plate.d / 2))
      for (const { o } of mine) {
        box.setFromObject(o.mesh)
        if (pb.containsBox(box)) { others.push(box.clone()); continue }
        const size = box.getSize(new Vector3()), c = box.getCenter(new Vector3())
        const spot = freeSpot(plate, size.x, size.z, others)
        o.mesh.position.x += spot.x - c.x; o.mesh.position.z += spot.z - c.z
        o.mesh.updateMatrixWorld(true)
        others.push(tmp.setFromObject(o.mesh).clone())
      }
    }
    if (view && view.invalidate) view.invalidate()
  } catch (e) { /* 자리만 못 맞춤 — 물체는 그대로 */ }
}

globalThis.__slcPlaceHook = placeAdded
