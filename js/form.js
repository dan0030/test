// 입력 폼 대화상자 (위키 편집기의 사진·인용구·각주 등)
import { modal, esc, icon, toast, pickFile } from './ui.js';
import { saveImage } from './images.js';
import { openColorPopover, normHex } from './colors.js';

function field(f) {
  const id = `ff-${f.key}`;
  const hint = f.hint ? `<p class="muted small">${esc(f.hint)}</p>` : '';
  const lbl = `<label class="lbl" for="${id}">${esc(f.label)}</label>`;
  switch (f.type) {
    case 'textarea':
      return `${lbl}<textarea class="input" id="${id}" data-k="${f.key}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>${hint}`;
    case 'select':
      return `${lbl}<select class="input" id="${id}" data-k="${f.key}">${f.options.map(([v, n]) => `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${hint}`;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" id="${id}" data-k="${f.key}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span></label>${hint}`;
    case 'color': {
      const v = normHex(f.value) || '';
      return `${lbl}<button type="button" class="color-btn" id="${id}" data-k="${f.key}" data-color="${esc(v)}" data-auto="${f.auto === false ? '' : 1}"><span class="cb-sw" style="background:${v || 'transparent'}"></span><span class="cb-t">${v || '자동'}</span>${icon('chevron-down', 14)}</button>${hint}`;
    }
    case 'image':
      return `${lbl}<div class="img-field"><input class="input" id="${id}" data-k="${f.key}" value="${esc(f.value || '')}" placeholder="https:// 이미지 주소 또는 파일 올리기"><button type="button" class="btn ghost sm" data-upload="${f.key}">${icon('upload', 15)}<span>파일</span></button></div>${hint}`;
    default:
      return `${lbl}<input class="input" id="${id}" data-k="${f.key}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">${hint}`;
  }
}

export function formDialog({ title, fields, okText = '확인', wide = false, danger }) {
  return modal({
    title,
    wide,
    body: `<div class="form">${fields.map(field).join('')}</div>`,
    actions: [
      ...(danger ? [{ label: danger, cls: 'ghost danger', icon: 'trash', value: () => ({ __delete: true }) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      {
        label: okText, cls: 'primary', icon: 'check', value: (w) => {
          const out = {};
          w.querySelectorAll('[data-k]').forEach((el) => {
            const k = el.dataset.k;
            if (el.type === 'checkbox') out[k] = el.checked;
            else if (el.classList.contains('color-btn')) out[k] = el.dataset.color || '';
            else out[k] = el.value;
          });
          return out;
        },
      },
    ],
    onOpen: (w) => {
      w.querySelectorAll('.color-btn').forEach((b) => b.addEventListener('click', () => openColorPopover(b, b.dataset.color, (c) => {
        b.dataset.color = c === 'transparent' ? '' : c;
        b.querySelector('.cb-sw').style.background = b.dataset.color || 'transparent';
        b.querySelector('.cb-t').textContent = b.dataset.color || '자동';
      }, { auto: !!b.dataset.auto })));
      w.querySelectorAll('[data-upload]').forEach((b) => b.addEventListener('click', async () => {
        const f = await pickFile();
        if (!f) return;
        try {
          toast('이미지를 올리는 중…');
          const url = await saveImage(f, 'content');
          w.querySelector(`[data-k="${b.dataset.upload}"]`).value = url;
          toast('이미지를 올렸어요 (자동으로 줄이고 위치정보를 지웠어요)', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      }));
    },
  });
}
