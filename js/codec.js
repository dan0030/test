// 저장 형식 코덱: 큰 기록은 gzip으로 압축한 뒤(보안 금고를 켰다면 그 다음 암호화) 서버에 저장
// → DB 용량과 전송량을 줄여 무료 플랜 한도 안에서 오래 버티게 함
import { encryptJSON, decryptJSON } from './crypto.js';

const MIN_COMPRESS = 1200; // 이보다 작은 기록은 압축 이득이 없어 그대로 저장
const canGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
export async function gzipText(text) { return b64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'))); }
export async function gunzipText(b) { return new TextDecoder().decode(await pipe(unb64(b), new DecompressionStream('gzip'))); }

// 앱 데이터 → DB에 저장할 형태
export async function pack(data, key) {
  let inner = data;
  const json = JSON.stringify(data);
  if (canGzip && json.length > MIN_COMPRESS) {
    const z = await gzipText(json);
    if (z.length < json.length * 0.9) inner = { __z: z };
  }
  return key ? encryptJSON(key, inner) : inner;
}

// DB 형태 → 앱 데이터
export async function unpack(raw, key) {
  let inner = raw || {};
  if (inner.__enc) {
    if (!key) throw new Error('locked');
    inner = await decryptJSON(key, inner);
  }
  if (inner && typeof inner.__z === 'string') return JSON.parse(await gunzipText(inner.__z));
  return inner || {};
}
