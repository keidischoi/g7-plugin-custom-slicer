// custom-slicer — 화면 · 엔진 묶기: npm run build → dist/web/
//  app.js (화면: React + three-slicer 뷰어 · 설정 칸) · slicer.worker.js (엔진) · 뷰어의 worker 4개 (3MF 읽기 · 레진)
//  worker 이름은 뷰어 · 엔진 코드의 new URL('./<이름>.worker.js', import.meta.url) 과 같아야 함 — 모두 dist/web 한 곳에
//  공통 조각은 c-<해시>.js 로 나눠 길게 캐시 (AssetController)
import { build } from 'esbuild'
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wrapKo } from './i18n/wrap.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'dist/web'), vw = join(root, 'node_modules/three-slicer-viewer/dist')
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })

/** 3D 판 색 — 뷰어는 장면 색(THEME)을 코드에 고정해 둬서 CSS 로 못 바꿈 → 묶을 때 바꿈
 *  0.1.4 사이트 테마를 따름: 뷰어를 처음 불러올 때 <html class="dark"> 이면 어두운 남색, 아니면 밝은 하늘색 (테마를 바꾸면 다음에 열 때부터)
 *  [원래 값, 밝게, 어둡게] */
export const SCENE = {
  accent: ['#00ae42', '#0ea5e9', '#38bdf8'],            // 고른 물체 · 고른 판 · 크기 손잡이
  accentHover: ['#1f5c34', '#0b3a55', '#0c4a6e'],       // 마우스가 올라간 물체의 빛
  sceneBackground: ['#161a1e', '#eef4fa', '#0f172a'],
  lightGround: ['#2a2f36', '#9aa9ba', '#2a2f36'],
  gridMinor: ['#232a31', '#d6e0ea', '#1e293b'],
  gridMajor: ['#39434d', '#aebfd0', '#334155'],
  plateBorder: ['#4a5560', '#7f93a8', '#64748b'],
  plateLabel: ['#5a6570', '#64748b', '#64748b'],
  travel: ['#5a6270', '#94a3b8', '#5a6270'],
}
const scenePlugin = {
  name: 'slc-scene',
  setup(b) {
    b.onLoad({ filter: /three-slicer-viewer[\\/]dist[\\/]theme-[^\\/]+\.js$/ }, (args) => {
      let s = 'const __slcDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");\n' + readFileSync(args.path, 'utf8')
      for (const [k, [from, light, dark]] of Object.entries(SCENE)) {
        const re = new RegExp('(' + k + ':\\s*)"' + from + '"')
        if (!re.test(s)) throw new Error('뷰어 장면 색을 못 찾음: ' + k + ' — three-slicer 판이 바뀌었으면 SCENE 을 맞춰 주세요')
        s = s.replace(re, '$1(__slcDark ? "' + dark + '" : "' + light + '")')
      }
      return { contents: s, loader: 'js' }
    })
    // 0.1.5 🧱 바닥판 — 뷰어가 판(격자 선 · 테두리 · 이름표)을 만드는 함수에 갈고리 하나: 출력 검사기와 같은 판 그림(web/src/plate.js)을 그 아래에 깖
    //  뷰어가 판을 지울 때 같이 지우게 지우기 목록에도 slcPlate 를 더함 — 못 찾으면(three-slicer 판이 바뀜) 빌드를 멈춤
    // 0.1.39 🧱 브림 끄기가 안 먹던 것 — 엔진 설정 변환(settings_core)이 brim_width 만 보고 brim_type(「브림 없음」)을 안 봄 →
    //  brim_type 이 no_brim 이면 엔진에 brim_width 0 을 넘김. 못 찾으면(three-slicer 판이 바뀜) 빌드를 멈춤
    b.onLoad({ filter: /three-slicer-viewer[\\/]src[\\/]settings[\\/]settings_core\.js$/ }, (args) => {
      let s = readFileSync(args.path, 'utf8')
      const from = "    brim_width: num('brim_width'),"
      if (s.split(from).length !== 2) throw new Error('엔진 설정의 brim_width 자리를 못 찾음 — three-slicer 판이 바뀌었으면 build.mjs 를 맞춰 주세요')
      // 0.1.40 「자동 브림」(auto_brim · 기본값)도 0 — OrcaSlicer 는 키가 크고 바닥이 좁을 때만 자동으로 브림을 다는데 이 엔진에는 그 판단이 없어
      //  브림 너비가 있으면 늘 브림을 만들었음 (켠 적 없는데 회색 띠). 브림이 필요하면 「바깥만」 등 종류를 직접 고르면 그 너비로 만듦
      // 0.1.41 브림 종류(바깥만 · 안팎 · 귀 …)를 골라도 기본 프로필의 브림 너비가 0 이라 아무것도 안 생겼음 → 너비가 0 이면 OrcaSlicer 흔한 값 5mm
      s = s.replace(from, () => "    brim_width: ['no_brim', 'auto_brim', ''].includes(String(S('brim_type') ?? 'auto_brim').toLowerCase()) ? 0 : (num('brim_width') > 0 ? num('brim_width') : 5),")
      return { contents: s, loader: 'js' }
    })
    b.onLoad({ filter: /three-slicer-viewer[\\/]dist[\\/]index\.js$/ }, (args) => {
      let s = readFileSync(args.path, 'utf8')
      const PAIRS = [
        ['[f.gridThin, f.gridBold, f.border, f.label, f.slaFill, f.slaEdge]', '[f.gridThin, f.gridBold, f.border, f.label, f.slaFill, f.slaEdge, f.slcPlate]'],
        ['t.scene.add(E), t.plateBeds.push({ gridThin: _, gridBold: N, border: x, label: E });',
          't.scene.add(E); const __slcP = globalThis.__slcPlateHook ? globalThis.__slcPlateHook(e, t, { index: f, x: m, z: b, w: g, d: y, selected: F }) : null; __slcP && (t.scene.add(__slcP), _.visible = !__slcP.visible, N.visible = !__slcP.visible); t.plateBeds.push({ gridThin: _, gridBold: N, border: x, label: E, slcPlate: __slcP || void 0 });'],
        // 0.1.14 🎨 3MF 표준 색(colorgroup · basematerials) — 파일마다 물체를 올린 뒤 web/src/colors3mf.js 가 색을 읽어 필라멘트 칸 · 물체에 붙임
        // 0.1.43 📐 3MF 자리 — 물체마다 파일의 원래 자리(가운데 · 바닥 높이)를 기억(org)하고, 올린 뒤 원래 모양대로 판 빈자리에 (web/src/place3mf.js)
        // 0.1.44 🧩 여러 물체 3MF — 올리기 전에 하나로 합칠지 물음 (web/src/merge3mf.js)
        ['const Ye = [];\n        for (const Ke of De) {', 'const Ye = [];\n        for (const Ke of (globalThis.__slcMerge ? await globalThis.__slcMerge(ne, De) : De)) {'],
        ['wt && Ke.objectid && Ye.push({ objectid: Ke.objectid, id: wt.id, paint: Ke.paint, bbox: Ke.bbox });',
          'wt && Ke.objectid && Ye.push({ objectid: Ke.objectid, id: wt.id, paint: Ke.paint, bbox: Ke.bbox, org: globalThis.__slcOrg ? globalThis.__slcOrg(Ke.modelPos) : null });'],
        ['De[0]?.project && we(De[0].project, Ye), ht.info(',
          'De[0]?.project && we(De[0].project, Ye), globalThis.__slcColorHook && await globalThis.__slcColorHook(ne, Ye, { api: t.current, colorsRef: e.extruderColorsRef, replaceAll: p, project: De[0]?.project, objects: n.current, max: Gt }), globalThis.__slcPlaceHook && globalThis.__slcPlaceHook(Ye, { objects: n.current, project: De[0]?.project }), ht.info('],
        // 0.1.16 🎨 칠한 색(material paint) — 뷰어는 칠한 곳을 55% 비치는 덧칠로 그려 밑의 1번 필라멘트 색과 섞여 흐릿했음 →
        //  색 칠하기만 물체와 같은 빛을 받는 불투명 재질로 (서포트 칠하기 · 칠하는 중 서포트 표시는 그대로 반투명)
        ['}), ba = 999, Sd = 4e3;',
          '}), ba = 999, Sd = 4e3; const __slcPaintMat = (e, t = null) => new R.MeshStandardMaterial({ color: e, roughness: 0.6, metalness: 0.05, flatShading: !0, side: R.DoubleSide, polygonOffset: !0, polygonOffsetFactor: ha, polygonOffsetUnits: ha, clippingPlanes: t });'],
        ['const z = ta(ae, le === "color", p?.current), fe = new R.Mesh(j, ga(z, r.current?.paintClipPlanes?.() ?? null));',
          'const z = ta(ae, le === "color", p?.current), fe = new R.Mesh(j, (le === "color" ? __slcPaintMat : ga)(z, r.current?.paintClipPlanes?.() ?? null));'],
        ['const C = new R.Mesh(W, ga(J, r.current?.paintClipPlanes?.() ?? null));',
          'const C = new R.Mesh(W, (ae ? __slcPaintMat : ga)(J, r.current?.paintClipPlanes?.() ?? null));'],
        // 0.1.17 🐢 뷰어가 뚝뚝 끊기던 것 — 마우스가 움직일 때마다 물체 위 강조(hover)를 찾으려고 모든 삼각형에 광선을 쏨
        //  (50만 삼각형 피규어 ≈ 60ms → 판을 돌리는 동안 초당 15장). 누른 채 움직이면(판 돌리기 · 끌기) 건너뛰고,
        //  한 번에 12ms 넘게 걸리는 큰 모델은 마우스가 90ms 멈췄을 때만 찾음
        [`      if (ke(h) || re.dragging || re.axis) return;
      Ue(h);
      const M = Xe();
      M !== fe && (fe = M, Fe(), U(), w(qe()));`,
          `      if (ke(h) || re.dragging || re.axis) return;
      if (h.buttons) return;
      Ue(h);
      const __hv = V.current.__slcHov || (V.current.__slcHov = { cost: 0, tm: 0 }), __hf = () => { const __t = performance.now(), M = Xe(); __hv.cost = performance.now() - __t; M !== fe && (fe = M, Fe(), U(), w(qe())); };
      clearTimeout(__hv.tm);
      __hv.cost > 12 ? __hv.tm = setTimeout(__hf, 90) : __hf();`],
        // 0.1.19 🐢 끌기 시작 때 뷰어가 칠한 색을 물체에 붙은 모양으로 새로 만듦(큰 모델 0.8초 → 끄는 중 멈칫). freedrag.js 가
        //  덧칠을 직접 따라 옮길 수 있을 때(옮기기 · 그 물체만의 덧칠)는 globalThis.__slcFollowPaint 를 켜서 건너뜀
        // 0.1.19 고른 물체를 감싸는 네모 입체 상자는 크기 바꾸기(모서리 손잡이)일 때만 — 고르기 · 옮기기 · 돌리기에는 안 보임 (선택은 물체 색 강조로 보임)
        // 0.1.20 물체를 고르거나 마우스를 올려도 색이 안 바뀌게 — 뷰어는 고른 것 · 올린 것을 하늘색으로 빛나게(emissive) 했음 (원래 색을 보며 고르기)
        ['h.material.emissive ? h.material.emissive.set(M ? at.accent : h === fe ? at.accentHover : 0) :', 'h.material.emissive ? h.material.emissive.set(0) :'],
        // 0.1.23 🔩 미리 보기 노즐 — 주황 원뿔 대신 실제 핫엔드 모양 (web/src/nozzle.js)
        ['  }), r = new R.Mesh(t, n);\n  return r.renderOrder = 10, r.frustumCulled = !1, r.visible = !1, r;', '  }), r = globalThis.__slcNozzle ? globalThis.__slcNozzle(R, e) : new R.Mesh(t, n);\n  return r.renderOrder = r.renderOrder || 10, r.frustumCulled = !1, r.visible = !1, r;'],
        ['b = S || null, a.visible = !!b;', 'b = S || null, a.visible = !!b && !!x;'],
        ['return _.current = !0, c.current?.size ? pe().then(', 'return _.current = !0, c.current?.size && !globalThis.__slcFollowPaint ? pe().then('],
        // 0.1.46 🧩 합친 3MF 의 부품을 자를 때 — 칠하기만으로 넘기면 엔진이 맞물린 부품을 잃음(동전 글자 F · 안쪽 고리) →
        //  물체 기록에 부품 범위(slcParts)를 싣고, 판 → STL 만들기에서 부품마다 그 필라멘트 묶음으로 (web/src/merge3mf.js slicePartsOf)
        //  0.1.47 면 차례는 그대로(칠하기 엔진이 물체 차례대로 면 번호를 셈) — 묶음 차례가 [2,1,2,1] 이어도 됨 · 첫 묶음이 2번 이상이면 첫 나눔 자리를 mm_group_split 으로
        ['paint: ye.paint, matrixWorld: ye.mesh.matrixWorld })', 'paint: ye.paint, parts: ye.slcParts, matrixWorld: ye.mesh.matrixWorld })'],
        ['d = new Set(l.map((P) => P.extruder || 1))', 'd = new Set(l.flatMap((P) => P.parts ? P.parts.map((r) => r.ext || 1) : [P.extruder || 1]))'],
        [`    const Q = P.extruder || 1;
    if (w.push(\`\${P.id}:\${Q}:\${P.localPos.length / 9}\`), P.paint) for (const pe of ["color", "supports"])
      for (const [$e, ze] of P.paint[pe] ?? [])
        v[pe].facets.push(m + $e), v[pe].hex.push(ze);
    y.length === 0 ? y.push(Q - 1) : Q - 1 !== y[y.length - 1] && (g.push(m), y.push(Q - 1)), Q >= 2 && b === 0 && (b = m);
    const H = P.matrixWorld, he = P.localPos;`,
          `    const Q = P.extruder || 1, __sp = globalThis.__slcParts ? globalThis.__slcParts(P) : null;
    if (__sp) {
      w.push(\`\${P.id}:\${Q}:\${P.localPos.length / 9}:\${__sp.sig}\`);
      for (const pe of ["color", "supports"]) for (const [$e, ze] of __sp.paint[pe]) v[pe].facets.push(m + $e), v[pe].hex.push(ze);
      for (const __r of __sp.runs) { const __q = __r.ext; y.length === 0 ? y.push(__q - 1) : __q - 1 !== y[y.length - 1] && (g.push(m + __r.at), y.push(__q - 1)), __q >= 2 && b === 0 && m + __r.at > 0 && (b = m + __r.at); }
      b === 0 && g.length && (b = g[0]);
    } else {
    if (w.push(\`\${P.id}:\${Q}:\${P.localPos.length / 9}\`), P.paint) for (const pe of ["color", "supports"])
      for (const [$e, ze] of P.paint[pe] ?? [])
        v[pe].facets.push(m + $e), v[pe].hex.push(ze);
    y.length === 0 ? y.push(Q - 1) : Q - 1 !== y[y.length - 1] && (g.push(m), y.push(Q - 1)), Q >= 2 && b === 0 && (b = m);
    }
    const H = P.matrixWorld, he = __sp ? __sp.pos : P.localPos;`],
      ]
      for (const [from, to] of PAIRS) {
        if (s.split(from).length !== 2) throw new Error('뷰어 판 만들기 자리를 못 찾음 — three-slicer 판이 바뀌었으면 build.mjs 의 PAIRS 를 맞춰 주세요: ' + from.slice(0, 60))
        s = s.replace(from, () => to)
      }
      return { contents: s, loader: 'js' }
    })
  },
}
/** 0.1.11 사이트 언어 — 이 플러그인 화면 코드의 한글 문자열을 __T('…') 로 감쌈 (영어 사이트면 web/i18n/en.js) */
const T_PATH = join(root, 'web/i18n/t.js').split('\\').join('/')
const langPlugin = {
  name: 'slc-lang',
  setup(b) {
    b.onLoad({ filter: /web[\\/]src[\\/](app|quick|toolbar|plate|profiles|layers|results|merge3mf)\.js$/ }, (args) => {
      const r = wrapKo(readFileSync(args.path, 'utf8'))
      return { contents: 'import { __T } from ' + JSON.stringify(T_PATH) + ';\n' + r.code, loader: 'js', resolveDir: dirname(args.path) }
    })
  },
}
await build({
  plugins: [scenePlugin, langPlugin],
  entryPoints: {
    app: join(root, 'web/src/app.js'),
    quick: join(root, 'web/src/quick.js'),   // 🖨️ 빠른 보내기 팝업 (React · 뷰어 없이 가볍게)
    'slicer.worker': join(root, 'node_modules/three-slicer/engine/src/slicer.worker.js'),
    'parse_3mf.worker': join(vw, 'parse_3mf.worker.js'),
    'sl1_encode.worker': join(vw, 'sl1_encode.worker.js'),
    'sla_reconstruct.worker': join(vw, 'sla_reconstruct.worker.js'),
    'sla_slice.worker': join(vw, 'sla_slice.worker.js'),
  },
  bundle: true, splitting: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'eof', platform: 'browser',
  external: ['node:*'],          // 엔진의 node 전용 갈래 (브라우저에서는 안 탐)
  ignoreAnnotations: true,       // three-slicer 는 sideEffects:false — worker 진입점(import 만 함)이 빠지지 않게
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: out, entryNames: '[name]', chunkNames: 'c-[hash]', loader: { '.json': 'json', '.wasm': 'file' }, assetNames: 'c-[hash]',
  logLevel: 'warning', charset: 'utf8',
})
cpSync(join(root, 'web/src/app.css'), join(out, 'app.css'))
cpSync(join(root, 'node_modules/three-slicer/LICENSE.txt'), join(out, 'three-slicer-LICENSE.txt'))
cpSync(join(root, 'node_modules/three-slicer/THIRD-PARTY-NOTICES.md'), join(out, 'three-slicer-NOTICES.txt'))
const files = readdirSync(out).map((f) => [f, statSync(join(out, f)).size])
writeFileSync(join(out, 'files.txt'), files.map(([f, s]) => f + '\t' + s).join('\n') + '\n')
console.log(files.map(([f, s]) => f.padEnd(28) + (s / 1048576).toFixed(2) + ' MB').join('\n'))
