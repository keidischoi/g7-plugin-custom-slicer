// custom-slicer — 🔩 미리 보기 노즐 모양 · AGPL-3.0-or-later
//  뷰어(three-slicer-viewer)는 노즐 자리를 주황 원뿔 하나로 그렸음. 0.1.23 실제 핫엔드처럼 — 황동 노즐 끝 · 육각 너트 ·
//  알루미늄 히터 블록 · 방열 목. build.mjs 가 뷰어의 노즐 만들기(Jo)에 globalThis.__slcNozzle 갈고리를 넣음.
//  모양은 뷰어 것과 같은 크기 틀(높이 1 · 끝이 원점 · 몸은 +Z 위)이라 화면 크기 맞춤 · 위치는 뷰어가 그대로 함.
//  늘 위에 보이게(벽 뒤에서도) depthTest 를 끄므로, 먼 것부터 그리게 renderOrder 를 차례로 줌.

/** R: three · opacity: 1 (지금 자리) / 0.28 (이 움직임의 끝 자리, 흐리게) → Mesh (자식으로 나머지 부품) */
function makeNozzle(R, opacity) {
  // 0.1.25 노즐은 하나만 — 뷰어는 이 움직임의 끝 자리에 흐린 노즐을 하나 더 그렸는데, 노즐이 둘로 보여 헷갈림 → 안 보이는 빈 것으로
  if (opacity < 1) return new R.Mesh(new R.BufferGeometry(), new R.MeshBasicMaterial({ visible: false }))
  const ghost = false
  const mat = (color, metal, rough) => new R.MeshStandardMaterial({ color, metalness: metal, roughness: rough, transparent: ghost, opacity, depthTest: false, depthWrite: false })
  const brass = mat(0xe8b84a, 0.3, 0.38), brassDark = mat(0xd4a23a, 0.3, 0.42), alu = mat(0xd5dae1, 0.25, 0.45), steel = mat(0x9aa3ad, 0.35, 0.4), hot = mat(0xef4444, 0.1, 0.5)   // 금속감은 낮게 — 뷰어에 주변 반사(환경 맵)가 없어 금속이 어둡게 보임
  // 원기둥은 Y 축 → Z 축(위)으로 눕힘
  const cyl = (rTop, rBot, h, seg, z0, m) => { const g = new R.CylinderGeometry(rTop, rBot, h, seg).rotateX(Math.PI / 2).translate(0, 0, z0 + h / 2); return new R.Mesh(g, m) }
  const tip = cyl(0.17, 0.035, 0.2, 24, 0, brass)                 // 노즐 끝 (원뿔)
  const tipNeck = cyl(0.17, 0.17, 0.05, 24, 0.2, brass)
  const nut = cyl(0.27, 0.27, 0.14, 6, 0.25, brassDark)           // 육각 너트
  const thread = cyl(0.13, 0.13, 0.06, 20, 0.39, brass)
  const block = new R.Mesh(new R.BoxGeometry(0.78, 0.5, 0.34).translate(0.14, 0, 0.45 + 0.17), alu)   // 히터 블록
  const heater = new R.Mesh(new R.CylinderGeometry(0.07, 0.07, 0.62, 16).translate(0.32, 0, 0.62), hot)   // 히터 카트리지 (블록을 가로지름)
  const brk = cyl(0.085, 0.085, 0.26, 16, 0.79, steel)             // 방열 목 (히트브레이크)
  const fins = []
  for (let i = 0; i < 3; i++) fins.push(cyl(0.2, 0.2, 0.035, 24, 0.88 + i * 0.07, alu))   // 방열판 날개 몇 장
  const root = tip
  const parts = [block, heater, brk, ...fins, thread, nut, tipNeck]
  parts.forEach((p, i) => { p.renderOrder = 10 + i; p.frustumCulled = false; root.add(p) })
  root.renderOrder = 10 + parts.length   // 노즐 끝을 맨 마지막(맨 앞)에
  return root
}

globalThis.__slcNozzle = makeNozzle
