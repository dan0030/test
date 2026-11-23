// 보안 금고(종단간 암호화) — 브라우저 Web Crypto API만 사용
// 암호 문구 → PBKDF2(SHA-256, 310,000회) → AES-GCM 256bit 키
// 키는 추출 불가(non-extractable) CryptoKey로만 존재하며 서버로 전송되지 않습니다.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 310000;
const CHECK = 'o-note-vault-ok';

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export async function deriveKey(passphrase, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function newSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { __enc: 1, iv: b64(iv), ct: b64(ct) };
}

export async function decryptJSON(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

export async function makeVault(passphrase) {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  const check = await encryptJSON(key, CHECK);
  return { key, vaultData: { salt, check, iter: ITER } };
}

export async function openVault(passphrase, vaultData) {
  const key = await deriveKey(passphrase, vaultData.salt);
  try {
    const v = await decryptJSON(key, vaultData.check);
    if (v !== CHECK) return null;
    return key;
  } catch {
    return null;
  }
}

// "이 기기에서 기억하기": 추출 불가 키를 IndexedDB에 보관 (원문 암호는 저장하지 않음)
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('onote-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function rememberKey(uid, key) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(key, uid);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { /* 저장 불가 환경이면 무시 */ }
}
export async function recallKey(uid) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction('keys').objectStore('keys').get(uid);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}
export async function forgetKey(uid) {
  try {
    const db = await idb();
    db.transaction('keys', 'readwrite').objectStore('keys').delete(uid);
  } catch { /* noop */ }
}
