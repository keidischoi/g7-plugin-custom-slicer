// 슬라이서 계산 검사 — node tests/web.test.mjs
//  .gcode.3mf (zip · md5 · 프린터 라운지가 찾는 plate_1.gcode) · 머리말 · 엔진으로 큐브 슬라이스 (A1 · 한 색 / 두 색)
import { createHash } from 'node:crypto'
import { crc32 as zcrc } from 'node:zlib'
import { buildGcode3mf, bambuHeader, md5hex, crc32 } from '../web/src/gcode3mf.js'
import { unzipModels } from '../web/src/handoff.js'
import { maxZ, toolsOf, matchPreset, estimateSeconds, sizeOf } from '../web/src/util.js'
import { bump } from '../web/src/stepper.js'
import { wrapKo } from '../web/i18n/wrap.mjs'
import EN from '../web/i18n/en.js'
import { deflateRawSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

/** 원본 파일 읽기 — git 이 줄바꿈을 CRLF 로 바꿔 받아도 검사 결과가 같게 (CR 을 뺌) */
const readSrc = (u) => readFileSync(u, 'utf8').split(String.fromCharCode(13)).join('')
let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m) }

// md5 · crc32 — node 와 같은 값
for (const s of ['', 'a', 'abc', 'x'.repeat(1000), '한글 G1 X10 Y20\n'.repeat(500)]) {
  const u = new TextEncoder().encode(s)
  ok(md5hex(u) === createHash('md5').update(u).digest('hex').toUpperCase() && (!zcrc || crc32(u) === zcrc(u)), 'md5 · crc32 = node (' + s.length + '자)')
}

// .gcode.3mf 구조
const gcode = bambuHeader({ seconds: 3725, layers: 50, maxZ: 10, tools: [{ mm: 1000, g: 2.98, density: 1.24 }] }) + 'G28\nG1 X10 Y10 F3000\n'
const blob = buildGcode3mf({ gcode, thumb: new Uint8Array([137, 80, 78, 71]), seconds: 3725, weight: 2.98, tools: [{ type: 'PLA', color: '#FF0000', mm: 1000, g: 2.98 }], settings: { a: 1 } })
const z = Buffer.from(await blob.arrayBuffer())
let e = z.length - 22; while (e > 0 && z.readUInt32LE(e) !== 0x06054b50) e--
const files = {}
let p = z.readUInt32LE(e + 16)
for (let i = 0; i < z.readUInt16LE(e + 10); i++) {
  const nl = z.readUInt16LE(p + 28), off = z.readUInt32LE(p + 42), sz = z.readUInt32LE(p + 20), name = z.slice(p + 46, p + 46 + nl).toString()
  files[name] = z.slice(off + 30 + z.readUInt16LE(off + 26) + z.readUInt16LE(off + 28), off + 30 + z.readUInt16LE(off + 26) + z.readUInt16LE(off + 28) + sz)
  p += 46 + nl + z.readUInt16LE(p + 30) + z.readUInt16LE(p + 32)
}
ok(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/plate_1.gcode', 'Metadata/plate_1.gcode.md5', 'Metadata/plate_1.png', 'Metadata/model_settings.config', 'Metadata/slice_info.config', 'Metadata/project_settings.config'].every((k) => files[k]), '.gcode.3mf 안의 파일 (Bambu 꼴)')
ok(files['Metadata/plate_1.gcode'].toString() === gcode && files['Metadata/plate_1.gcode.md5'].toString() === createHash('md5').update(gcode).digest('hex').toUpperCase(), 'plate_1.gcode 그대로 · md5 맞음')
ok(/^Metadata\/plate_(\d+)\.gcode$/.test('Metadata/plate_1.gcode') && files['Metadata/slice_info.config'].toString().includes('used_g="2.98"') && files['Metadata/slice_info.config'].toString().includes('prediction" value="3725"'), 'slice_info: 예상 시간 · 쓴 양 (프린터 라운지 · Bambu 가 읽는 자리)')
ok(gcode.startsWith('; HEADER_BLOCK_START') && gcode.includes('; model printing time: 1h 2m 5s') && gcode.includes('; total layer number: 50') && gcode.includes('; HEADER_BLOCK_END'), 'Bambu 머리말 (시간 · 층)')

// 엔진으로 슬라이스 (node 에서도 같은 엔진)
const { createSlicer } = await import('three-slicer')
const ST = await import('three-slicer/settings')
const cube = (x0, w, h) => { const v = [[0, 0, 0], [w, 0, 0], [w, w, 0], [0, w, 0], [0, 0, h], [w, 0, h], [w, w, h], [0, w, h]].map((q) => [q[0] + x0, q[1] - w / 2, q[2]]); return [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]].map((t) => t.map((i) => v[i])) }
const stl = (tris) => { const b = Buffer.alloc(84 + tris.length * 50); b.writeUInt32LE(tris.length, 80); tris.forEach((t, i) => t.forEach((q, k) => q.forEach((c, j) => b.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + j * 4)))); return b }
const procs = await ST.processPresets(), fils = await ST.filamentPresets(), name = 'Bambu Lab A1 0.4 nozzle'
let s = { ...ST.printerSettings(name) }
s = ST.applyPreset(s, procs.settingsFor(ST.printersByVendor.BBL[name][3]), procs.keys)
s = ST.applyPreset(s, fils.settingsFor('Bambu PLA Basic @BBL A1'), fils.keys)
s.sparse_infill_density = '15%'
const base = { ...ST.deriveKernelParams(s), gcode_stats_block: true, gcode_config_block: true, gcode_role_tags: true }
const sl = await createSlicer()
const r1 = sl.slice(stl(cube(-10, 20, 10)), base)
ok(!r1.error && r1.stats.layers === 50 && r1.gcode.includes('machine_start_gcode') && /M620/.test(r1.gcode) && r1.stats.time_estimate > 60, 'A1 한 색 큐브: 50층 · A1 시작 G-code · 예상 시간')
const r2 = sl.slice(stl([...cube(-25, 10, 6), ...cube(5, 10, 6)]), { ...base, extruder_count: 2, mm_group_split: 12, mm_group_splits: [12], mm_group_tools: [0, 1], wipe_tower_real: true })
ok(!r2.error && Array.isArray(r2.stats.filament_mm_by_tool) && r2.stats.filament_mm_by_tool.length === 2 && /\nT1\b/.test(r2.gcode) && (r2.gcode.match(/M620 S\d/g) || []).length > 2, 'A1 두 색 (물체마다 압출기): T1 · AMS 바꿈 · 압출기마다 쓴 양')
ok(!(r2.stats.time_estimate > 0), '두 색이면 엔진이 예상 시간을 비움 → 화면이 G-code 로 어림 (estimateSeconds)')
sl.dispose()

// 0.1.6 ⬆️ 지금 설정 → 프로필 .zip(프린터 · 품질 · 필라멘트) → 이 슬라이서의 프로필 읽기로 다시 → 같은 값
{
  const { profileZip, readProfile, applyProfile, profileGuess } = await import('../web/src/profiles.js')
  const src = { ...s, printer_settings_id: name, print_settings_id: ST.printersByVendor.BBL[name][3], filament_settings_id: ['Bambu PLA Basic @BBL A1'], layer_height: 0.16, sparse_infill_density: '23%' }
  const zip = profileZip(src, 'A1 · PLA 시험')
  const back = applyProfile({}, await readProfile(await zip.arrayBuffer(), 'zip'))
  const g = profileGuess(src, { brand: 'Bambu Lab', model: 'A1', name: '내 A1' })
  ok(zip.name === 'A1 · PLA 시험.zip' && zip.size > 1000 && Number(back.layer_height) === 0.16 && String(back.sparse_infill_density).replace('%', '') === '23' && back.printable_height !== undefined && back.printer_settings_id === name,
    '0.1.6 프로필 올리기 파일: 프린터 · 품질 · 필라멘트 .json 묶음 → 다시 읽으면 같은 층 높이 · 채우기 · 프린터 (' + Math.round(zip.size / 1024) + 'KB)')
  ok(g.printer_name === 'Bambu Lab A1' && g.layer_height === 0.16 && /A1 · .*0.16mm/.test(g.title), '0.1.6 올리기 칸 처음 값 (제목 · 프린터 · 층 높이)')
  const appS = readSrc(new URL('../web/src/app.js', import.meta.url)), polS = readSrc(new URL('../web/src/polish.js', import.meta.url)), plS = readSrc(new URL('../web/src/plate.js', import.meta.url)), cssS = readSrc(new URL('../web/src/app.css', import.meta.url))
  ok(appS.includes('window.__spfPrefill = { ...g, slicer: \'orca\', file,') && appS.includes("navTo('/slicer-profiles/new')") && !appS.includes('UploadDialog') && !appS.includes('uploadProfile') && appS.includes("'⬆️ 프로필 쓰러 가기'"),
    '0.1.6 바로 올리지 않고 「프로필 올리기」 작성 폼으로 파일 · 칸 · 판 사진을 넘김 (프로필 창 · 보낸 뒤 물어봄)')
  ok(appS.includes("wrap.current.setAttribute('data-slc-theme', dark ? 'dark' : 'light')") && cssS.includes('.slc[data-slc-theme=dark] {') && !cssS.includes('[data-theme=dark] .slc') && plS.includes('view.renderer.setClearColor(c.bg)')
    && polS.includes("Array.from(r.children).find((el) => el.tagName === 'STYLE' && el.getAttribute('data-slc-rule') === id)") && !polS.includes(":scope > style"), '0.1.6 테마 한 곳에서 (data-slc-theme) · 바꾸면 3D 바탕 · 격자도 바로 · 어두운 칸이 남던 것 (그림자 뿌리 :scope)')
  ok(polS.includes('.empty-hint .eh-icon{display:none !important}') && appS.includes('const [hasCloud, setHasCloud]'), '0.1.6 판 가운데 📦 그림 뺌 · ☁️ 웹저장소가 늦게 와도 단추')
  ok(appS.includes("b.className = 'slc-ehcloud'") && appS.includes("hint.querySelector('.eh-btn')") && appS.includes("pick.insertAdjacentElement('afterend', b)") && appS.indexOf('openRef.current = cloudOpen') > appS.indexOf('const cloudOpen = async') && polS.includes('.empty-hint .slc-ehcloud{'),
    '0.1.7 판 가운데 「Choose file」 아래 「☁️ 내 저장소에서」 (웹저장소가 켜져 있을 때)')
  ok(appS.includes("b.innerHTML = (ready.google && icons.google) || icons.cloud") && polS.includes('.empty-hint .slc-ehcloud svg{width:22px;height:22px}') && polS.includes('content:"내 저장소에서 가져오기"'), '0.1.9 그 단추는 아이콘만 (사이트의 내 저장소 그림 · 마우스를 올리면 설명)')
  ok(appS.includes("const name = typeof ev === 'string' ? ev : ev && ev.type, v = typeof ev === 'string' ? v2 : ev && ev.value") && appS.includes("if (name === 'objects' && Array.isArray(v)) setObjCount(v.length)"),
    '0.1.8 뷰어 알림은 {type, value} — 모델 수 · 오류 자동 고침 · 판 비우기가 실제로 들음')
  ok(appS.includes("if (!objCount) { setErr('판에 모델이 없어요") && appS.includes('disabled: !canUpload') && appS.includes('canUpload: objCount > 0'), '0.1.8 판에 모델이 없으면 프로필 쓰기를 막음')
  ok(appS.includes('function SpfFormPop({ onClose, onDone })') && appS.includes('window.G7SlicerProfiles.form(box.current, pre || {}, { done:') && appS.includes("setSpfPop(true); return"), '0.1.8 프로필 작성 폼을 슬라이서 위 팝업으로 (작업이 그대로 · 예전 판은 작성 화면으로)')
}
// 넘겨받은 ZIP (자른 조각 모두 등) — 저장 · deflate 둘 다, 모델만 (README · __MACOSX 빼고)
{
  const ents = [['a.stl', 'solid a\nendsolid a\n', 0], ['b/조각2.STL', 'solid b\n'.repeat(200), 8], ['readme.txt', 'x', 0], ['__MACOSX/._a.stl', 'm', 0], ['c.3mf', 'PK-fake', 8]]
  const parts = [], cen = []; let off = 0
  for (const [n, txt, m] of ents) {
    const name = Buffer.from(n), raw = Buffer.from(txt), data = m ? deflateRawSync(raw) : raw
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(m, 8); lh.writeUInt32LE(zcrc(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(m, 10); ch.writeUInt32LE(zcrc(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42)
    parts.push(lh, name, data); cen.push(ch, name); off += 30 + name.length + data.length
  }
  const cd = Buffer.concat(cen), eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(ents.length, 8); eo.writeUInt16LE(ents.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16)
  const list = await unzipModels(Buffer.concat([...parts, cd, eo]))
  ok(list.map((x) => x.name).join('|') === 'a.stl|조각2.STL|c.3mf' && new TextDecoder().decode(list[1].data) === 'solid b\n'.repeat(200) && new TextDecoder().decode(list[0].data).startsWith('solid a'), 'ZIP 풀기: 저장 · deflate · 모델만 (' + list.length + '개)')
  let bad = ''; try { await unzipModels(new Uint8Array(100)) } catch (e) { bad = e.message }
  ok(bad === 'ZIP 파일이 아니에요', 'ZIP 이 아니면 알림')
}
// 계산 도구 (util.js) — 높이 · 색마다 무게 · 내 프린터 → 엔진 프린터
{
  ok(maxZ(['G1 Z0.2 F600', 'G1 X1 E1', 'G1 Z5', 'G1 X2 E2', 'G0 Z30', 'G1 X3 Y3', ''].join('\n')) === 5, '가장 높은 Z = 출력한 층 (빈 이동은 빼고)')
  const t = toolsOf({ filament_mm_by_tool: [1000, 500] }, { filament_diameter: [1.75, 1.75], filament_density: [1.24, 1.32], filament_colour: ['#ff0000', '#00ff00ff'], filament_type: ['PLA', 'PETG'] })
  ok(t.length === 2 && Math.abs(t[0].g - 2.98) < 0.01 && Math.abs(t[1].g - 1.59) < 0.01 && t[1].color === '#00FF00' && t[1].type === 'PETG', '색마다 무게 (길이 × 단면 × 밀도) · 색 · 재료')
  const t1 = toolsOf({ filament_mm: 100 }, {})
  ok(t1.length === 1 && t1[0].type === 'PLA' && t1[0].color === '#C9CED6', '한 색 · 설정이 비어도 기본값')
  ok(matchPreset(ST.printersByVendor, { brand: 'Bambu Lab', model: 'A1' }, ST.printerTechByVendor)?.[1] === 'Bambu Lab A1 0.4 nozzle' && matchPreset(ST.printersByVendor, { brand: 'Bambu Lab', model: 'A1 mini' }, ST.printerTechByVendor)?.[1] === 'Bambu Lab A1 mini 0.4 nozzle' && matchPreset(ST.printersByVendor, { brand: 'X', model: 'nothing-like-this' }) === null, '내 프린터 → 엔진 프린터 (0.4 노즐 먼저 · 없으면 null)')
  ok(Math.abs(estimateSeconds(['G1 X0 Y0 F6000', 'G1 X100 F6000', 'G4 S5', 'M620 S1A', ''].join(String.fromCharCode(10)), 50) - (1 + 5 + 50)) < 0.01, '시간 어림: 이동 + 기다림 + 색 바꿈')
}
// 불러오기 (plugin.iife.js) · 화면 (app.js)
{
  const ld = readSrc(new URL('../resources/js/slicer.js', import.meta.url)), app = readSrc(new URL('../web/src/app.js', import.meta.url))
  ok(ld === readSrc(new URL('../dist/js/plugin.iife.js', import.meta.url)) && ld.includes("[data-wsl-send]:not([data-wsl-sent])") && ld.includes("src.setAttribute('data-wsl-sent', '1')") && ld.includes("a.setAttribute('data-cls-taken', '1')") && !ld.includes('window.open('),
    '받기 단추 옆 「🔪 슬라이스 · 보내기」 — 웹 슬라이서 단추 자리를 먼저 차지 (하나만) · 내려받기 대신 넘김')
  ok(ld.includes('window.G7Slicer = {') && ld.includes('mount: function (el, opts)') && ld.includes('popup: popup') && app.includes('window.__slcApp = { version: V, mount, unmount, tick'), 'window.G7Slicer.mount · popup (출력 검사기 탭이 씀)')
  ok(app.includes('const SEND_ADMIN_ONLY = true') && app.includes("'/printers/' + p.id + '/send-file'") && app.includes("fd.append('bed_clear', '1')") && app.includes('checked: bed'), '보내기: 프린터 라운지 send-file · 베드 확인 · 관리자 시험')
  ok(app.includes('h(Viewport, {') && app.includes('h(SettingsPanel, { settings, setSettings, embedded: true })') && app.includes('onSliced') && app.includes('shortcuts: true') && app.includes('stopImmediatePropagation()') && app.includes("window.addEventListener('keydown', gate, true)"), '화면: 뷰어 + 설정 칸 · 결과 받기 · 0.1.13 탭 안에서는 슬라이서를 마지막으로 눌렀을 때만 단축키 (Delete 로 지우기)')
  {   // 0.1.19
    const bm = readSrc(new URL('../web/build.mjs', import.meta.url)), fd = readSrc(new URL('../web/src/freedrag.js', import.meta.url)), or = readSrc(new URL('../web/src/orient.js', import.meta.url)), tb = readSrc(new URL('../web/src/toolbar.js', import.meta.url)), pc = readSrc(new URL('../web/src/polish.js', import.meta.url)), ap = readSrc(new URL('../web/src/app.js', import.meta.url))
    ok(bm.includes('c.current?.size && !globalThis.__slcFollowPaint ? pe().then(') && fd.includes('globalThis.__slcFollowPaint = run.follow.length > 0 && !run.hidden.length') && fd.includes('L.unshift(fn)') && !fd.includes('ray.intersectObjects(bodies'), '0.1.19 옮길 때 뷰어의 덧칠 다시 만들기 건너뜀 · 광선 한 번')
    ok(or.includes('export const flip') && or.includes('export const layDown') && or.includes('export function faceMode') && or.includes('setFromUnitVectors') && tb.includes("B('flip', 'flipv'") && tb.includes("B('face', 'face'"), '0.1.19 뒤집기 · 눕히기 · 면으로 놓기')
    ok(fd.includes('g.remove = (...a) =>') && fd.includes('if (!bodies.some((b) => b.intersectsBox(ob))) m.visible = false') && fd.includes('0x1d6b96') && readSrc(new URL('../web/build.mjs', import.meta.url)).includes('a.visible = !!b && !!x;'), '0.1.19 지운 물체의 덧칠 숨김 · 고른 칠한 물체 강조 · 네모 상자는 크기 바꾸기만')
    ok(pc.includes('.slice-warn.side-warn{display:block') && pc.includes('.side-bottom{display:grid') && ap.includes("d.style.setProperty('--dl'"), '0.1.19 경고 상자 · 슬라이스 띠 · 완료 띠 자리')
  }
  {   // 0.1.18 잔상
    const fd = readSrc(new URL('../web/src/freedrag.js', import.meta.url))
    ok(fd.includes('function ghostFix(v)') && fd.includes('ghostFix(v)   //') && fd.includes("tc.mode === 'translate' && !v.__slcRotOp && box.containsBox(ob)") && fd.includes("tc.addEventListener('objectChange'"), '0.1.18 옮길 때 칠한 색 덧칠이 같이 움직임 · 섞인 것은 숨김')
  }
  {   // 0.1.17 hover 광선 줄이기
    const bm = readSrc(new URL('../web/build.mjs', import.meta.url))
    ok(readSrc(new URL('../web/src/freedrag.js', import.meta.url)).includes("const hide = lookPref().drag !== false && tc.mode === 'translate'") && readSrc(new URL('../web/src/toolbar.js', import.meta.url)).includes('applyArrows(viewOf())'), '0.1.17 끌어 옮기기가 켜지면 이동 화살표 숨김 · 끄면 보임')
    ok(bm.includes('if (h.buttons) return;') && bm.includes('__hv.cost > 12 ? __hv.tm = setTimeout(__hf, 90) : __hf();'), '0.1.17 누른 채 움직이면 hover 검사 건너뜀 · 큰 모델은 멈췄을 때만')
  }
  {   // 0.1.16 칠한 색 불투명
    const bm = readSrc(new URL('../web/build.mjs', import.meta.url))
    ok(bm.includes('const __slcPaintMat = (e, t = null) => new R.MeshStandardMaterial({') && bm.includes('flatShading: !0') && bm.includes('(le === "color" ? __slcPaintMat : ga)(z,') && bm.includes('(ae ? __slcPaintMat : ga)(J,'),
      '0.1.16 칠한 색은 불투명 · 물체와 같은 빛 (서포트 칠하기는 반투명 그대로)')
  }
  {   // 0.1.15 ✋ 끌어 옮기기
    const fd = readSrc(new URL('../web/src/freedrag.js', import.meta.url)), tb = readSrc(new URL('../web/src/toolbar.js', import.meta.url)), pl = readSrc(new URL('../web/src/plate.js', import.meta.url))
    ok(fd.includes("send('dragging-changed', true)") && fd.includes("send('dragging-changed', false)") && fd.includes("tc.mode !== 'translate'") && fd.includes('tc.axis') && fd.includes('< 4) return') && fd.includes('lookPref().drag === false')
      && tb.includes('attachDrag(viewOf())') && tb.includes("B('drag', 'move'") && pl.includes('drag: true'),
      '0.1.15 물체를 잡고 끌어 옮기기 — 뷰어 손잡이와 같은 알림 · 고르기(4px)는 그대로 · 손잡이 · 크기 · 돌리기 중엔 안 끼어듦 · ✋ 단추로 끔')
  }
  {
    const { modelColors, planSlots, hex6 } = await import('../web/src/colors3mf.js'), bm = readSrc(new URL('../web/build.mjs', import.meta.url))
    const xml = '<model><resources><m:colorgroup id="2"><m:color color="#191919FF"/><m:color color="#F00"/></m:colorgroup><basematerials id="5"><base name="a" displaycolor="#00FF00"/></basematerials>'
      + '<object id="1" pid="2" pindex="0"><mesh/></object><object id="3"><mesh><triangles><triangle v1="0" v2="1" v3="2" pid="2" p1="1"/></triangles></mesh></object>'
      + '<object id="4" pid="5"><mesh/></object><object id="7"><mesh/></object><object id="8"><components><component objectid="1"/></components></object></resources></model>'
    const mc = modelColors(xml)
    ok(mc['1'] === '#191919' && mc['3'] === '#ff0000' && mc['4'] === '#00ff00' && !mc['7'] && mc['8'] === '#191919' && hex6('#abc') === '#aabbcc',
      '0.1.14 3MF 표준 색 읽기 — colorgroup · basematerials · 삼각형 pid/p1 · 부품 · 색 없는 물체는 비움')
    const a = planSlots(['#c9ced6', '#ffffff'], ['#191919'], true, 16), b = planSlots(['#c9ced6', '#191919'], ['#191919'], false, 16), c = planSlots(['#c9ced6'], ['#ff0000'], false, 16), d = planSlots(['#1'], ['#ff0000'], false, 1)
    ok(a.colors.join() === '#191919,#ffffff' && a.slot['#191919'] === 1 && b.colors.length === 2 && b.slot['#191919'] === 2 && c.colors.join() === '#c9ced6,#ff0000' && c.slot['#ff0000'] === 2 && !d.slot['#ff0000'],
      '0.1.14 필라멘트 칸 — 빈 판은 1번부터 · 같은 색은 그 칸 · 더할 때는 뒤에 붙임 · 한도면 그대로')
    ok(bm.includes('globalThis.__slcColorHook && await globalThis.__slcColorHook(ne, Ye,'), '0.1.14 뷰어 불러오기에 색 갈고리')
    {   // ZIP64 (Fusion 360) — 중앙 목록 위치 · 크기 · 자리가 0xffffffff 이고 ZIP64 덧붙임에 진짜 값
      const { read3mfColors } = await import('../web/src/colors3mf.js')
      const name = Buffer.from('3D/3dmodel.model'), data = Buffer.from(xml), parts = [], u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b }, u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b }, u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b }
      parts.push(u32(0x04034b50), u16(45), u16(0), u16(0), u32(0), u32(0), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data)
      const cdOff = Buffer.concat(parts).length, ex = Buffer.concat([u16(1), u16(24), u64(data.length), u64(data.length), u64(0)])
      const cd = Buffer.concat([u32(0x02014b50), u16(45), u16(45), u16(0), u16(0), u32(0), u32(0), u32(0xffffffff), u32(0xffffffff), u16(name.length), u16(ex.length), u16(0), u16(0), u16(0), u32(0), u32(0xffffffff), name, ex])
      const z64 = cdOff + cd.length
      const tail = Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(1), u64(1), u64(cd.length), u64(cdOff), u32(0x07064b50), u32(0), u64(z64), u32(1), u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(0)])
      const zip = Buffer.concat([...parts, cd, tail]), got = await read3mfColors({ name: 'a.3mf', arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length) })
      ok(got['1'] === '#191919' && got['4'] === '#00ff00', '0.1.14 ZIP64 3MF (Fusion 360) 도 색을 읽음')
    }
  }
  {
    const { look } = await import('../web/src/i18n.js'), tb = readSrc(new URL('../web/src/toolbar.js', import.meta.url))
    ok(look({}, '⚠ 499,902 triangles — slicing may take a while') === '⚠ 삼각형 499,902개 — 모델이 커서 슬라이스가 오래 걸릴 수 있어요'
      && look({}, "ℹ Imported this project's 494 settings and 8 filaments and 1 plates. Not supported by this slicer, so left out: per-layer custom G-code, per-object setting overrides.") === 'ℹ 이 프로젝트의 설정 494개 · 필라멘트 8개 · 판 1개을(를) 가져왔어요. 이 슬라이서가 지원하지 않아 뺀 것: 층마다 넣는 사용자 G-code · 물체마다 다른 설정.'
      && look({}, "Imported this project's 3 settings.") === '이 프로젝트의 설정 3개을(를) 가져왔어요.',
      '0.1.13 알림 한국어 — 큰 모델 경고 · 프로젝트에서 가져온 것 / 뺀 것')
    ok(!tb.includes("'wheel', 'keydown']") && tb.includes("if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()") && tb.includes('b.blur()'), '0.1.13 도구 단추를 누른 뒤에도 Delete · 화살표가 판으로 감')
  }
  ok(app.includes('github.com/keidischoi/g7-plugin-custom-slicer') && app.includes('AGPL-3.0'), '화면에 소스 링크 · AGPL')
  const qk = readSrc(new URL('../web/src/quick.js', import.meta.url)), css = readSrc(new URL('../web/src/app.css', import.meta.url))
  ok(ld.includes("b.textContent = __T('🖨️ 프린터로 보내기')") && ld.includes('quick.js?v=') && ld.includes('Q.open(el, {') && qk.includes('window.__slcQuick = { version: V, open }') && qk.includes("data-more=\"pck\"") && qk.includes("data-more=\"page\"") && qk.includes("navTo(where === 'pck' ? '/print-check/slice' : '/print-slicer')"),
    '받기 단추 → 예전과 같은 작은 팝업 · 「↗ 자세히」 두 곳 (출력 검사기 탭 · 전용 슬라이서)')
  ok(ld.includes("var SIZES = ['m', 'l', 'full']") && ld.includes('requestFullscreen') && app.includes("className: 'slc-sizes'") && css.includes('.slc-pop--m') && css.includes('.slc-pop--full'), '큰 슬라이서 창 크기 단추 (보통 · 크게 · 전체 화면)')
  ok(ld.includes('takeCarry: function ()') && qk.includes('window.__slcCarry = {') && app.includes('window.G7Slicer.takeCarry()'), '「↗ 자세히」로 파일 · 프린터를 들고 감 (한 번만 꺼냄)')
  ok(app.includes('cloudSave') && app.includes('ProfileDialog') && app.includes('polish(stage.current'), '웹저장소 저장 표시 · 🎛️ 슬라이서 프로필 · 뷰어 다듬기')
  ok(ld.includes("window.dispatchEvent(new Event('g7slicer:ready'))"), '0.1.1 불러오기가 끝나면 g7slicer:ready (먼저 그려진 출력 검사기가 탭을 보임)')
  {
    const bm = readSrc(new URL('../web/build.mjs', import.meta.url)), pl = readSrc(new URL('../web/src/polish.js', import.meta.url))
    const { readdirSync } = await import('node:fs'), dist = new URL('../dist/web/', import.meta.url)
    const built = readdirSync(dist).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dist), 'utf8')).join('\n')
    ok(bm.includes("sceneBackground: ['#161a1e', '#eef4fa', '#0f172a']") && built.includes('"#eef4fa"') && !built.includes('sceneBackground:"#161a1e"') && css.includes('--vp-dark-base:#f8fafc'), '0.1.2 밝은 판 — 장면 색은 묶을 때 바꿈 · 도구 띠 · 도구줄도 밝게')
    ok(pl.includes('*::-webkit-scrollbar{display:none') && css.includes('.slc ::-webkit-scrollbar'), '0.1.2 스크롤바 안 보임 (휠로는 그대로)')
    ok(pl.includes('export const FLOW_CSS') && pl.includes('.viewport-col,.left-rail{position:sticky !important;top:calc(var(--slc-top,12px) + 44px)') && pl.includes('.sidebar-scroll{overflow:visible !important')
      && pl.includes('.side-bottom{position:sticky;bottom:0') && app.includes('polish(stage.current, { flow: !popup') && app.includes("wrap.current.style.setProperty('--slc-top'") && css.includes('overflow:clip'),
      '0.1.3 페이지 흐름: 3D 화면은 헤더 밑에 붙어 멈춤 · 오른쪽 칸은 페이지와 같이 스크롤 · 슬라이스 띠는 화면 아래')
    ok(app.includes('export const GCODE_ERR') && app.includes('setSettings((x) => fixGcode(x, key))') && app.includes('sliceRequest: sliceReq') && app.includes('fixes.current.length < 8'), '0.1.3 프로젝트 3MF 사용자 G-code 오류 → 그 칸만 프린터 기본으로 바꾸고 다시 슬라이스')
    ok(app.includes("C.pick({ accept: '.stl,.3mf,.obj,.amf,.ply,.zip', multiple: true })") && app.includes("x.accept || ''") && app.includes('C.save(blob, name') && app.includes('C.offer(file, filename)') && !app.includes("'data-cls-save'"), '0.1.3 ☁️ 웹저장소: 열기(뷰어의 파일 칸으로 더함) · 결과 저장 · 뷰어 안 저장에 「에도 저장」')
    ok(app.includes("p2.delete('printer')") && app.includes('setWide(true)'), '0.1.3 🎛️ 프로필: 이 프린터 것이 없으면 모든 프린터 목록')
    ok(app.includes("h('footer', { className: 'slc-foot' },\n      h('p', null, '설정 이름은 한국어") && css.includes('.slc-foot p + p'), '0.1.3 아래 안내 두 줄')
    ok(app.includes("className: 'slc-dock'") && app.includes("'📤 프린터로 보내기'") && css.includes('.slc-dock { position:sticky; bottom:12px;'), '0.1.4 슬라이스 결과 띠 (화면 아래에 붙음 · 📤 프린터로 보내기 · 받기 · ☁️)')
    const sto = readSrc(new URL('../web/src/store.js', import.meta.url))
    ok(sto.includes("const DB = 'slc-plate'") && sto.includes('MAX_AGE = 7 * 864e5') && app.includes("const slot = compact ? 'tab' : popup ? 'big' : 'page'") && app.includes('await loadPlate(slot)') && app.includes("addEventListener('drop', onDrop, true)") && app.includes('clearPlate(slot)'),
      '0.1.4 판 임시 저장 — 새로고침해도 모델이 남음 (자리마다 · 끌어 놓기 · Open · ☁️ 도 · 판을 비우면 지움)')
    ok(pl.includes('export function setRule(host, id, css)') && app.includes('select[data-testid="printer-model"]') && app.includes('lounge.list.length ?'), '0.1.4 프린터 칸 「Model」 줄 뺌 (위 내 프린터 칩이 고름 · 라운지 프린터가 없으면 그대로)')
    ok(app.includes('const fixedBar = (el) =>') && app.includes('document.elementFromPoint(x, y)') && app.includes('else if (y > b + 12) break'), '0.1.4 헤더가 두 줄이어도 맨 아랫줄 밑에 3D 뷰어가 붙음 (위에서부터 재기)')
    ok(bm.includes('document.documentElement.classList.contains("dark")') && built.includes('"#0f172a":"#eef4fa"') && pl.includes('export const DARK_CSS') && app.includes("setRule(stage.current, 'dark'") && css.includes('.slc[data-slc-theme=dark] {') && pl.includes('.sc-mini{'), '0.1.4 사이트 테마를 따름 — 3D 판(열 때) · 카드 · 입력칸 · 도구 띠(바로)')
    const plt = readSrc(new URL('../web/src/plate.js', import.meta.url)), tool = readSrc(new URL('../web/src/toolbar.js', import.meta.url))
    ok(bm.includes('globalThis.__slcPlateHook ? globalThis.__slcPlateHook(e, t,') && bm.includes('f.slaEdge, f.slcPlate]') && built.includes('__slcPlateHook') && plt.includes('export function plateCanvas(st, W, D)') && plt.includes("textured: { name: 'Textured PEI'") && app.includes('plateInfo(String(settings.printer_settings_id'),
      '0.1.5 🧱 바닥판 — 출력 검사기와 같은 판 그림 (제조사 · 판 종류 · 격자 · 눈금 · 글자) · 뷰어가 판을 지울 때 같이')
    ok(tool.includes("B('iso', 'cube', '비스듬히')") && tool.includes("B('platepick', 'sliders'") && tool.includes("B('shot', 'camera'") && tool.includes('v.objectsGroup') && app.includes('mountToolbar(stage.current, ctx)'), '0.1.5 🧰 보기 도구 (방향 · 맞추기 · 돌리기 · 판 보이기 · 판 바꾸기 · 사진 · 전체 화면)')
    ok(tool.includes('.tb-logo>*{display:none !important}') && tool.includes('content:"3dsSlicer"') && app.includes('© three-slicer · OrcaSlicer 기여자 · 보증 없음'), '0.1.5 상단 이름표 3dsSlicer · 저작권 · 보증 없음 고지 (AGPL)')
    const MP = (p) => (matchPreset(ST.printersByVendor, p, ST.printerTechByVendor) || [])[1]
    ok(MP({ brand: 'Bambu', model: 'A1 Combo' }) === 'Bambu Lab A1 0.4 nozzle' && MP({ brand: 'BambuLab', model: 'P1S (AMS)' }) === 'Bambu Lab P1S 0.4 nozzle' && MP({ brand: 'Bambu Lab', model: 'X1C' }) === 'Bambu Lab X1 Carbon 0.4 nozzle' && MP({ brand: 'Bambu Lab', model: 'A1 mini' }) === 'Bambu Lab A1 mini 0.4 nozzle' && MP({ brand: 'Prusa Research', model: 'MK4' }) === 'Prusa MK4 0.4 nozzle' && !MP({ brand: 'Elegoo', model: 'Neptune 9' }) && MP({ brand: 'Creality', model: 'K1' }) === 'Creality K1 (0.4 nozzle)' && MP({ brand: 'Creality', model: 'K1 Max' }) === 'Creality K1 Max (0.4 nozzle)' && MP({ name: 'K1' }) === 'Creality K1 (0.4 nozzle)' && MP({ brand: 'TwoTrees', model: 'SK1' }) === 'TwoTrees SK1 0.4 nozzle',
      '0.1.10 프린터 이름이 조금 달라도 맞춤 (Bambu · Combo · (AMS) · X1C · 상표 줄임) · 없는 프린터는 null · 0.1.12 낱말 단위 (K1 ≠ SK1) · 괄호 노즐 이름')
    ok(String(sizeOf({ size: '256×256×256 mm' })) === '256,256,256' && String(sizeOf({ build: [300, 310, 400] })) === '300,310,400' && sizeOf({}) === null && app.includes('export function fitPrinter(s, p)') && app.includes('}, [printerKey])') && app.includes('function setPrinter(el, printer)') && readSrc(new URL('../resources/js/slicer.js', import.meta.url)).includes('setPrinter: function (el, p)'),
      '0.1.10 프린터를 바꾸면 오른쪽 설정이 바로 따라감 (G7Slicer.setPrinter) · 없는 프린터는 판 크기만')
    { const el = { value: '0.42', getAttribute: () => null, dispatchEvent () {} }, ip = globalThis.HTMLInputElement; globalThis.HTMLInputElement = class { set value (v) { this.__v = v } }; Object.defineProperty(globalThis.HTMLInputElement.prototype, 'value', { set (v) { el.value = v }, configurable: true }); globalThis.Event = globalThis.Event || class { constructor (t) { this.type = t } }
      bump(el, 1); const a1 = el.value; el.value = '10%'; bump(el, -1); const a2 = el.value; el.value = '0'; bump(el, -1); const a3 = el.value; el.value = '35'; bump(el, 1, true); const a4 = el.value; el.value = 'abc'; bump(el, 1); const a5 = el.value; globalThis.HTMLInputElement = ip
      ok(a1 === '0.43' && a2 === '9%' && a3 === '0' && a4 === '45' && a5 === 'abc' && readSrc(new URL('../web/src/polish.js', import.meta.url)).includes('steppers(root)'), '0.1.10 숫자 칸 ▲▼ (소수 자리 · % · 0 아래 안 감 · Shift 10배 · 글은 그대로)') }
    { const KO = JSON.parse(readSrc(new URL('../web/i18n/ko.json', import.meta.url))), i18 = readSrc(new URL('../web/src/i18n.js', import.meta.url)), pol = readSrc(new URL('../web/src/polish.js', import.meta.url))
      ok(KO['Layer height'] === '레이어 높이' && KO['Line width'] === '선 너비' && Object.keys(KO).length > 1000 && i18.includes("localStorage.getItem('g7_locale')") && i18.includes('.lbl[data-en]::after') && pol.includes('if (opts.ko) loadKo()') && app.includes("ko: siteLang() === 'ko'"),
        '0.1.11 한국어 사이트 — 설정 이름 한국어 + 아래 영어 (OrcaSlicer 한국어 번역 · g7_locale)') }
    { const miss = []; for (const f of ['app.js', 'quick.js', 'toolbar.js', 'plate.js', 'profiles.js']) wrapKo(readSrc(new URL('../web/src/' + f, import.meta.url))).found.forEach((x) => { if (/[가-힣]/.test(x) && EN[x] == null) miss.push(f + ': ' + x.slice(0, 40)) })
      const w = wrapKo("const a = '판', b = { '키': 1 }, c = /'한'/.test(x) // '주석'\nconst d = `${x}한`"), ldr = readSrc(new URL('../resources/js/slicer.js', import.meta.url)), bm = readSrc(new URL('../web/build.mjs', import.meta.url))
      if (miss.length) console.log('    영어 없음:', miss)
      ok(!miss.length && w.found.length === 1 && w.code.includes("__T('판')") && w.code.includes("{ '키': 1 }") && w.code.includes("/'한'/") && ldr.includes('function __T(s)') && ldr.includes('label = __T(c.menu_label') && bm.includes('plugins: [scenePlugin, langPlugin]'),
        '0.1.11 영어 사이트 — 화면 한글 문자열 모두 영어가 있음 (빌드가 __T 로 감쌈 · 키 · 정규식 · 주석 · 식 들어간 템플릿은 그대로) · 불러오기 · 메뉴도') }
    ok(app.includes('export const PARAM_ERR') && app.includes("g[1] !== 'settings'") && app.includes('key = badKey(msg)'), '0.1.5 설정값 오류(Invalid value provided for parameter …)도 그 칸만 고치고 다시 슬라이스')
  }

}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' : 'OK ') + (pass + fail))
process.exit(fail ? 1 : 0)
