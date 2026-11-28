// 데이터 저장소: 클라우드(Supabase) 또는 체험(로컬) 모드
import { decryptJSON, makeVault, openVault, rememberKey, recallKey, forgetKey } from './crypto.js';
import { pack, unpack } from './codec.js';
import * as cache from './cache.js';

const LOCAL_KEY = 'onote-local-v1';
const listeners = new Set();

export const store = {
  mode: 'local', // 'cloud' | 'local'
  sb: null,
  user: null,
  items: new Map(),
  vault: null, // { id, data, key }
  locked: false,
  rawRows: [],
  srv: new Map(), // id → 서버에 저장된 행(압축·암호화 상태) — 기기 캐시와 증분 동기화용
  types: new Map(), // 삭제 대기 중인 항목의 종류
  lastSync: null,
  lastPull: 0,
  quotaHit: false,
  quotaKind: '', // 'user' = 내 한도 초과, 'site' = 사이트 전체 공간 부족
  status: 'saved', // saved | saving | error | offline
  dirty: new Set(),
  deleted: new Set(),
  timer: null,
};

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind = 'data') { listeners.forEach((fn) => { try { fn(kind); } catch (e) { console.error(e); } }); }
function setStatus(s) { store.status = s; emit('status'); }

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16);
}));

// ---------------- 초기화 ----------------
export async function initLocal() {
  store.mode = 'local';
  store.user = { id: 'local', email: '체험 모드' };
  store.items.clear();
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    raw.forEach((it) => store.items.set(it.id, it));
  } catch { /* 무시 */ }
  store.locked = false;
  emit();
}

export async function initCloud(sb, user) {
  store.mode = 'cloud';
  store.sb = sb;
  store.user = user;
  store.items.clear();
  store.dirty.clear();
  store.deleted.clear();
  store.srv.clear();
  // 1) 이 기기에 저장된 사본 먼저 읽기 → 2) 서버에서 바뀐 것만 받기 (처음이면 전체)
  const cached = cache.cacheEnabled() ? await cache.loadRows(user.id) : { rows: [], lastSync: null };
  cached.rows.forEach((r) => store.srv.set(r.id, r));
  store.lastSync = cached.lastSync || null;
  store.lastPurge = cached.lastPurge || null;
  await syncDown(true);
  const vaultRow = [...store.srv.values()].find((r) => r.type === 'vault');
  store.rawRows = [...store.srv.values()].filter((r) => r.type !== 'vault');
  if (vaultRow) {
    store.vault = { id: vaultRow.id, data: vaultRow.data, key: null };
    const key = await recallKey(user.id);
    if (key && (await checkKey(key))) {
      store.vault.key = key;
      await hydrate();
    } else {
      store.locked = true;
    }
  } else {
    store.vault = null;
    await hydrate();
  }
  purgeTombstones();
  emit();
}

const CHUNK = 100;
// 서버 → 기기: lastSync 이후 바뀐 행만 (목록은 가볍게 받고, 내용은 실제로 바뀐 행만 받음)
async function syncDown(initial = false) {
  const sb = store.sb;
  let changedIds = []; let removed = []; let maxTs = store.lastSync;
  if (!store.lastSync) {
    const { data, error } = await sb.from('items').select('id,type,data,created_at,updated_at').eq('deleted', false);
    if (error) throw error;
    store.srv.clear();
    data.forEach((r) => { store.srv.set(r.id, r); if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at; });
    changedIds = data.map((r) => r.id);
  } else {
    // 같은 시각에 커밋된 행을 놓치지 않도록 몇 초 겹쳐서 조회 (겹친 행은 아래에서 걸러짐)
    const since = new Date(new Date(store.lastSync).getTime() - 3000).toISOString();
    const { data, error } = await sb.from('items').select('id,updated_at,deleted').gte('updated_at', since);
    if (error) throw error;
    const need = [];
    data.forEach((r) => {
      if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at;
      const cur = store.srv.get(r.id);
      if (r.deleted) { if (cur) { store.srv.delete(r.id); removed.push(r.id); } return; }
      if (!cur || cur.updated_at !== r.updated_at) need.push(r.id);
    });
    for (let k = 0; k < need.length; k += CHUNK) {
      const { data: rows, error: e2 } = await sb.from('items').select('id,type,data,created_at,updated_at').in('id', need.slice(k, k + CHUNK));
      if (e2) throw e2;
      rows.forEach((r) => store.srv.set(r.id, r));
    }
    changedIds = need;
  }
  // 빈 계정이라 기준 시각이 없으면 처음부터를 기준으로 (다음부터는 목록만 가볍게 비교)
  store.lastSync = maxTs || '1970-01-01T00:00:00.000Z';
  maxTs = store.lastSync;
  if (cache.cacheEnabled()) {
    if (initial && !changedIds.length && !removed.length) await cache.putRows(store.user.id, [], [], { lastSync: maxTs });
    else await cache.putRows(store.user.id, changedIds.map((id) => store.srv.get(id)).filter(Boolean), removed, { lastSync: maxTs });
  }
  return { changedIds, removed };
}

async function checkKey(key) {
  try { return (await decryptJSON(key, store.vault.data.check)) === 'o-note-vault-ok'; } catch { return false; }
}

async function decodeRow(r) {
  const d = await unpack(r.data, store.vault?.key);
  return { id: r.id, type: r.type, data: d || {}, created_at: r.created_at, updated_at: r.updated_at, _srv: r.updated_at };
}

async function hydrate() {
  store.items.clear();
  for (const r of store.rawRows) {
    try { store.items.set(r.id, await decodeRow(r)); } catch (e) { console.warn('decode fail', r.id, e); }
  }
  store.rawRows = [];
  store.locked = false;
}

// 30일 지난 삭제 흔적(tombstone)을 하루 한 번 정리
async function purgeTombstones() {
  const day = new Date().toISOString().slice(0, 10);
  if (store.lastPurge === day) return;
  store.lastPurge = day;
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  try { await store.sb.from('items').delete().eq('deleted', true).lt('updated_at', old); } catch { /* 다음에 */ }
  if (cache.cacheEnabled()) cache.putRows(store.user.id, [], [], { lastPurge: day });
}

export async function unlock(passphrase, remember) {
  const key = await openVault(passphrase, store.vault.data);
  if (!key) return false;
  store.vault.key = key;
  if (remember) await rememberKey(store.user.id, key);
  await hydrate();
  emit();
  return true;
}

// ---------------- 조회 ----------------
export function all(type) {
  // settings(화면 설정)·stat(글자 수 통계)은 기록 목록에 나오지 않는 내부 항목
  const arr = [...store.items.values()].filter((i) => (type ? i.type === type : i.type !== 'settings' && i.type !== 'stat'));
  return arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}
export function get(id) { return store.items.get(id); }
export function inFolder(folderId, type) { return all(type).filter((i) => (i.data.folders || []).includes(folderId)); }

// ---------------- 변경 ----------------
const now = () => new Date().toISOString();

export function create(type, data = {}) {
  const it = { id: uuid(), type, data: { folders: [], tags: [], comments: [], ...data }, created_at: now(), updated_at: now() };
  store.items.set(it.id, it);
  markDirty(it.id);
  emit();
  return it;
}

export function update(id, patch, { silent = false } = {}) {
  const it = store.items.get(id);
  if (!it) return;
  // 실제로 바뀐 게 없으면 저장하지 않음 (불필요한 쓰기·다른 기기 다운로드 방지)
  const before = JSON.stringify(it.data);
  it.data = typeof patch === 'function' ? patch(it.data) || it.data : { ...it.data, ...patch };
  if (JSON.stringify(it.data) === before) return;
  it.updated_at = now();
  markDirty(id);
  if (!silent) emit();
}

export function remove(id) {
  const it = store.items.get(id);
  if (it) store.types.set(id, it.type);
  store.items.delete(id);
  store.dirty.delete(id);
  store.deleted.add(id);
  // 폴더 삭제 시 소속 정보 정리
  store.items.forEach((it) => {
    if ((it.data.folders || []).includes(id)) { it.data.folders = it.data.folders.filter((f) => f !== id); markDirty(it.id); }
  });
  schedule();
  emit();
}

function markDirty(id) { store.dirty.add(id); schedule(); }

function schedule() {
  setStatus('saving');
  clearTimeout(store.timer);
  store.timer = setTimeout(flush, 900);
}

export async function flush() {
  clearTimeout(store.timer);
  if (store.mode === 'local') {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([...store.items.values()]));
      store.dirty.clear(); store.deleted.clear();
      setStatus('saved');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
    return;
  }
  if (!navigator.onLine) { setStatus('offline'); return; }
  if (store.locked) return;
  const ids = [...store.dirty];
  const dels = [...store.deleted];
  try {
    if (ids.length) {
      const rows = [];
      for (const id of ids) {
        const it = store.items.get(id);
        if (!it) continue;
        rows.push({ id, type: it.type, data: await pack(it.data, store.vault?.key), deleted: false });
      }
      ids.forEach((id) => store.dirty.delete(id));
      for (let k = 0; k < rows.length; k += 50) {
        const part = rows.slice(k, k + 50);
        const { data, error } = await store.sb.from('items').upsert(part).select('id,updated_at,created_at');
        if (error) { ids.forEach((id) => { if (store.items.has(id)) store.dirty.add(id); }); throw error; }
        const cached = [];
        data.forEach((r) => {
          const it = store.items.get(r.id); if (it) it._srv = r.updated_at;
          const sent = part.find((x) => x.id === r.id);
          const row = { id: r.id, type: sent.type, data: sent.data, created_at: r.created_at, updated_at: r.updated_at };
          store.srv.set(r.id, row); cached.push(row);
        });
        if (cache.cacheEnabled()) cache.putRows(store.user.id, cached);
      }
      store.quotaHit = false;
    }
    if (dels.length) {
      // 소프트 삭제: 다른 기기가 '지워졌다'는 사실을 가볍게 알 수 있도록 흔적만 남김 (30일 뒤 정리)
      const { error } = await store.sb.from('items').update({ deleted: true, data: {} }).in('id', dels);
      if (error) throw error;
      dels.forEach((id) => { store.deleted.delete(id); store.srv.delete(id); });
      if (cache.cacheEnabled()) cache.putRows(store.user.id, [], dels);
    }
    setStatus(store.dirty.size ? 'saving' : 'saved');
    if (store.dirty.size) schedule();
  } catch (e) {
    console.error(e);
    const msg = `${e.message} ${e.details || ''} ${e.hint || ''}`;
    const quota = /quota_exceeded|site_full/.test(msg);
    if (quota) store.quotaKind = /site_full/.test(msg) ? 'site' : 'user';
    if (quota && !store.quotaHit) { store.quotaHit = true; emit('quota'); }
    setStatus(quota ? 'quota' : 'error');
    clearTimeout(store.timer);
    store.timer = setTimeout(flush, quota ? 60000 : 5000); // 재시도
  }
}

// 다른 기기/브라우저에서 바뀐 내용 가져오기 (바뀐 행만, 너무 자주 묻지 않음)
export async function pull({ force = false } = {}) {
  if (store.mode !== 'cloud' || store.locked || !navigator.onLine) return;
  if (!force && Date.now() - store.lastPull < 30000) return;
  store.lastPull = Date.now();
  let res;
  try { res = await syncDown(); } catch { return; }
  let touched = false;
  for (const id of res.removed) { if (!store.dirty.has(id) && store.items.delete(id)) touched = true; }
  for (const id of res.changedIds) {
    const r = store.srv.get(id);
    if (!r || r.type === 'vault' || store.dirty.has(id)) continue;
    const loc = store.items.get(id);
    if (loc && loc._srv === r.updated_at) continue;
    try { store.items.set(id, await decodeRow(r)); touched = true; } catch { /* 키 불일치 */ }
  }
  if (touched) emit('remote');
}

// ---------------- 보안 금고 ----------------
export async function enableVault(passphrase) {
  if (store.mode !== 'cloud') throw new Error('클라우드 모드에서만 사용할 수 있어요.');
  const { key, vaultData } = await makeVault(passphrase);
  const id = uuid();
  const { error } = await store.sb.from('items').insert({ id, type: 'vault', data: vaultData });
  if (error) throw error;
  store.vault = { id, data: vaultData, key };
  store.items.forEach((_, iid) => store.dirty.add(iid));
  await flush();
  emit();
}

export async function disableVault() {
  if (!store.vault?.key) throw new Error('먼저 금고를 열어주세요.');
  const vid = store.vault.id;
  store.vault = null;
  store.items.forEach((_, iid) => store.dirty.add(iid));
  await flush();
  await store.sb.from('items').update({ deleted: true, data: {} }).eq('id', vid);
  store.srv.delete(vid);
  if (cache.cacheEnabled()) cache.putRows(store.user.id, [], [vid]);
  await forgetKey(store.user.id);
  emit();
}

export async function lockNow() {
  if (store.user) await forgetKey(store.user.id);
}

// ---------------- 백업 ----------------
export function exportAll() {
  return { app: 'O-note', version: 1, exported_at: now(), items: [...all(), ...all('settings')].map(({ id, type, data, created_at, updated_at }) => ({ id, type, data, created_at, updated_at })) };
}

export function importAll(json, { replace = false } = {}) {
  if (!json || !Array.isArray(json.items)) throw new Error('올바른 O-note 백업 파일이 아니에요.');
  const valid = ['folder', 'character', 'world', 'story', 'plot', 'memo', 'idea', 'settings'];
  if (replace) [...store.items.keys()].forEach((id) => { store.items.delete(id); store.deleted.add(id); });
  let n = 0;
  for (const it of json.items) {
    if (!valid.includes(it.type) || typeof it.data !== 'object') continue;
    const id = /^[0-9a-f-]{36}$/i.test(it.id) ? it.id : uuid();
    store.items.set(id, { id, type: it.type, data: it.data, created_at: it.created_at || now(), updated_at: now() });
    store.deleted.delete(id);
    store.dirty.add(id);
    n++;
  }
  schedule();
  emit();
  return n;
}

export function clearLocal() { localStorage.removeItem(LOCAL_KEY); }
export const clearDeviceCache = () => cache.clearAll();

// ---------------- 사용자 설정 (계정에 저장: 내 팔레트, 분류 목록 등) ----------------
export const DEFAULT_CATS = {
  character: ['주인공', '주요 인물', '조연'],
  world: ['지역·장소', '세력·조직', '종족·생물', '용어·개념', '역사·사건', '능력·마법 체계', '아이템', '기타'],
};
export function settings() {
  let s = all('settings')[0];
  if (!s) {
    s = { id: uuid(), type: 'settings', data: { palette: [], cats: JSON.parse(JSON.stringify(DEFAULT_CATS)) }, created_at: now(), updated_at: now() };
    store.items.set(s.id, s);
  }
  s.data.palette = s.data.palette || [];
  s.data.cats = s.data.cats || JSON.parse(JSON.stringify(DEFAULT_CATS));
  return s;
}
export function updateSettings(fn) {
  const s = settings();
  update(s.id, (d) => fn(d) || d, { silent: true });
  return s;
}
