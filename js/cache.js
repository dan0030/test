// 기기 캐시(IndexedDB): 서버 행을 '저장된 형태 그대로'(압축·암호화 상태) 보관
// → 다시 접속할 때 전체를 내려받지 않고 바뀐 것만 받아 전송량을 크게 줄임
// 이 기기에서 끄기: 설정 → '이 기기에 사본 저장' / 로그아웃하면 지워짐
const DB = 'onote-cache-v1';
const OFF_KEY = 'onote-cache-off';

// '로그인 상태 유지'를 끈 브라우저(공용 PC)에는 기기 사본도 남기지 않음
export const cacheEnabled = () => { try { return localStorage.getItem(OFF_KEY) !== '1' && localStorage.getItem('onote-remember') !== '0'; } catch { return false; } };
export function setCacheEnabled(on) { try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* noop */ } }

let dbp = null;
function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('rows'); r.result.createObjectStore('meta'); r.result.createObjectStore('img'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export async function loadRows(uid) {
  try {
    const db = await open();
    const tx = db.transaction(['rows', 'meta']);
    const range = IDBKeyRange.bound(`${uid}:`, `${uid}:￿`);
    const rows = await req(tx.objectStore('rows').getAll(range));
    const meta = (await req(tx.objectStore('meta').get(uid))) || {};
    return { rows, lastSync: meta.lastSync || null, lastPurge: meta.lastPurge || null };
  } catch { return { rows: [], lastSync: null }; }
}

export async function putRows(uid, rows, delIds = [], meta = null) {
  try {
    const db = await open();
    const tx = db.transaction(['rows', 'meta'], 'readwrite');
    const st = tx.objectStore('rows');
    rows.forEach((r) => st.put(r, `${uid}:${r.id}`));
    delIds.forEach((id) => st.delete(`${uid}:${id}`));
    if (meta) {
      const m = tx.objectStore('meta');
      const cur = (await req(m.get(uid))) || {};
      m.put({ ...cur, ...meta }, uid);
    }
    await done(tx);
  } catch { /* 캐시는 실패해도 동작에 지장 없음 */ }
}

// 이미지 캐시 (서버에 저장된 그대로의 바이트)
export async function getImg(key) {
  try { const db = await open(); return (await req(db.transaction('img').objectStore('img').get(key))) || null; } catch { return null; }
}
export async function putImg(key, blob) {
  try { const db = await open(); const tx = db.transaction('img', 'readwrite'); tx.objectStore('img').put(blob, key); await done(tx); } catch { /* noop */ }
}
export async function delImgs(keys) {
  try { const db = await open(); const tx = db.transaction('img', 'readwrite'); keys.forEach((k) => tx.objectStore('img').delete(k)); await done(tx); } catch { /* noop */ }
}

// 이 기기의 사본 전부 지우기 (로그아웃·탈퇴·끄기)
export async function clearAll() {
  try {
    const db = await open();
    const tx = db.transaction(['rows', 'meta', 'img'], 'readwrite');
    ['rows', 'meta', 'img'].forEach((s) => tx.objectStore(s).clear());
    await done(tx);
  } catch { /* noop */ }
}
