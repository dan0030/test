// 데이터 저장소: 클라우드(Supabase) 또는 체험(로컬) 모드
import { encryptJSON, decryptJSON, makeVault, openVault, rememberKey, recallKey, forgetKey } from './crypto.js';

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
  const { data, error } = await sb.from('items').select('id,type,data,created_at,updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  const vaultRow = data.find((r) => r.type === 'vault');
  store.rawRows = data.filter((r) => r.type !== 'vault');
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
  emit();
}

async function checkKey(key) {
  try { return (await decryptJSON(key, store.vault.data.check)) === 'o-note-vault-ok'; } catch { return false; }
}

async function decodeRow(r) {
  let d = r.data;
  if (d && d.__enc) {
    if (!store.vault?.key) throw new Error('locked');
    d = await decryptJSON(store.vault.key, d);
  }
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
  const arr = [...store.items.values()].filter((i) => (type ? i.type === type : i.type !== 'settings'));
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
  it.data = typeof patch === 'function' ? patch(it.data) || it.data : { ...it.data, ...patch };
  it.updated_at = now();
  markDirty(id);
  if (!silent) emit();
}

export function remove(id) {
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
  const ids = [...store.dirty];
  const dels = [...store.deleted];
  try {
    if (ids.length) {
      const rows = [];
      for (const id of ids) {
        const it = store.items.get(id);
        if (!it) continue;
        const data = store.vault?.key ? await encryptJSON(store.vault.key, it.data) : it.data;
        rows.push({ id, type: it.type, data });
      }
      ids.forEach((id) => store.dirty.delete(id));
      if (rows.length) {
        const { data, error } = await store.sb.from('items').upsert(rows).select('id,updated_at');
        if (error) { ids.forEach((id) => store.dirty.add(id)); throw error; }
        data.forEach((r) => { const it = store.items.get(r.id); if (it) it._srv = r.updated_at; });
      }
    }
    if (dels.length) {
      const { error } = await store.sb.from('items').delete().in('id', dels);
      if (error) throw error;
      dels.forEach((id) => store.deleted.delete(id));
    }
    setStatus(store.dirty.size ? 'saving' : 'saved');
    if (store.dirty.size) schedule();
  } catch (e) {
    console.error(e);
    setStatus('error');
    clearTimeout(store.timer);
    store.timer = setTimeout(flush, 5000); // 재시도
  }
}

// 다른 기기/브라우저에서 바뀐 내용 가져오기
export async function pull() {
  if (store.mode !== 'cloud' || store.locked || !navigator.onLine) return;
  const { data, error } = await store.sb.from('items').select('id,updated_at,type');
  if (error) return;
  const serverIds = new Set();
  const changed = [];
  for (const r of data) {
    if (r.type === 'vault') continue;
    serverIds.add(r.id);
    const loc = store.items.get(r.id);
    if (store.dirty.has(r.id)) continue;
    if (!loc || loc._srv !== r.updated_at) changed.push(r.id);
  }
  let touched = false;
  for (const [id] of store.items) {
    if (!serverIds.has(id) && !store.dirty.has(id)) { store.items.delete(id); touched = true; }
  }
  if (changed.length) {
    const { data: rows } = await store.sb.from('items').select('id,type,data,created_at,updated_at').in('id', changed);
    for (const r of rows || []) {
      try { store.items.set(r.id, await decodeRow(r)); touched = true; } catch { /* 키 불일치 */ }
    }
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
  await store.sb.from('items').delete().eq('id', vid);
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
