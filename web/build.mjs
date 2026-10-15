// custom-slicer — 화면 · 엔진 묶기: npm run build → dist/web/
//  app.js (화면: React + three-slicer 뷰어 · 설정 칸) · slicer.worker.js (엔진) · 뷰어의 worker 4개 (3MF 읽기 · 레진)
//  worker 이름은 뷰어 · 엔진 코드의 new URL('./<이름>.worker.js', import.meta.url) 과 같아야 함 — 모두 dist/web 한 곳에
//  공통 조각은 c-<해시>.js 로 나눠 길게 캐시 (AssetController)
import { build } from 'esbuild'
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'dist/web'), vw = join(root, 'node_modules/three-slicer-viewer/dist')
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
await build({
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
