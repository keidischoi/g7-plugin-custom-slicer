/*! custom-slicer — 넘겨받은 ZIP(자른 조각 모두 등) 풀기 · AGPL-3.0-or-later
 *  안의 STL · 3MF · OBJ 를 모두 꺼내 판에 올림 (서버로는 안 감) */
export const MODEL_RE = /\.(stl|3mf|obj|amf|ply)$/i

/** ZIP 안의 모델 파일들 [{name, data: Uint8Array}] — 저장(0) · deflate(8) 만 (ZIP64 · 암호는 못 읽음) */
export function unzipModels(buf) { return unzipAll(buf, MODEL_RE) }

/** ZIP 안에서 이름이 re 에 맞는 파일들 (re 는 파일 이름 — 폴더 빼고) · full: 폴더까지 붙인 이름으로 */
export async function unzipAll(buf, re, full) {
  const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), td = new TextDecoder()
  let e = -1
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break }
  if (e < 0) throw new Error('ZIP 파일이 아니에요')
  const n = dv.getUint16(e + 10, true), out = []
  let p = dv.getUint32(e + 16, true)
  for (let k = 0; k < n; k++) {
    if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true)
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true)
    const name = td.decode(u.subarray(p + 46, p + 46 + nl))
    p += 46 + nl + xl + cl
    const base = name.split('/').pop()
    if (!re.test(base) || /^__MACOSX\//.test(name) || base.startsWith('.')) continue
    if (lo + 30 > u.length || dv.getUint32(lo, true) !== 0x04034b50) continue
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u.subarray(start, start + csize)
    let data = null
    if (method === 0) data = raw.slice()
    else if (method === 8 && typeof DecompressionStream === 'function') {
      data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    }
    if (data) out.push({ name: full ? name : base, data })
  }
  return out
}
