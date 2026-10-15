// custom-slicer — 판 임시 저장 (새로고침해도 모델이 남게) · AGPL-3.0-or-later
//  이 브라우저의 IndexedDB 에만 (서버로 안 감) · 자리마다 따로: page(전용 화면) · tab(출력 검사기 탭) · big(큰 창)
//  모델 파일만 — 판에서 옮기거나 돌린 것은 다시 열면 처음 상태 · 7일 지나면 버림
const DB = 'slc-plate', ST = 'plates', MAX_AGE = 7 * 864e5

function open() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
}
async function tx(mode, fn) {
  const db = await open()
  try {
    return await new Promise((ok, no) => {
      const t = db.transaction(ST, mode), st = t.objectStore(ST)
      let out
      Promise.resolve(fn(st)).then((v) => { out = v })
      t.oncomplete = () => ok(out)
      t.onerror = () => no(t.error)
      t.onabort = () => no(t.error)
    })
  } finally { db.close() }
}

/** 판의 모델 파일들 저장 (File 은 그대로 넣을 수 있음) */
export async function savePlate(slot, files) {
  try {
    const list = (files || []).filter(Boolean).map((f) => ({ name: f.name, type: f.type || '', blob: f }))
    await tx('readwrite', (st) => { if (list.length) st.put({ at: Date.now(), list }, slot); else st.delete(slot) })
  } catch (e) { /* 개인 창 · 저장 공간 막힘 — 임시 저장만 안 됨 */ }
}
/** 저장해 둔 모델 → File[] (없거나 오래되면 []) */
export async function loadPlate(slot) {
  try {
    const db = await open()
    const v = await new Promise((ok) => {
      try { const g = db.transaction(ST, 'readonly').objectStore(ST).get(slot); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null) } catch (e) { ok(null) }
    })
    db.close()
    if (!v || !Array.isArray(v.list) || Date.now() - (v.at || 0) > MAX_AGE) return []
    return v.list.map((x) => (x.blob instanceof File ? x.blob : new File([x.blob], x.name || 'model.stl', { type: x.type || '' })))
  } catch (e) { return [] }
}
export function clearPlate(slot) { return savePlate(slot, []) }
