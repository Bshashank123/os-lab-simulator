// Small DOM toolkit: element builder, icons, form controls, tables, toasts.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = {}, ...kids) {
  const svg = ['svg', 'g', 'path', 'rect', 'circle', 'line', 'text', 'polygon', 'defs', 'marker', 'title'].includes(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    }
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
/** Null-safe append: skips null/undefined/false (the native append() would print the text "null"). */
export const put = (el, ...kids) => { append(el, kids); return el; };

const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  back: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  forward: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  restart: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  home: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  chart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  idle: '<circle cx="12" cy="12" r="10"/><path d="M10 15V9"/><path d="M14 15V9"/>',
};
export function icon(name, size = 16) {
  const s = h('span', { class: 'icon', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
}

export function button(label, { icon: ic, onClick, kind = 'secondary', title, disabled, small, type = 'button' } = {}) {
  return h('button', { class: `btn btn-${kind}${small ? ' btn-sm' : ''}`, type, onClick, title, 'aria-label': ic && !label ? title : undefined, disabled },
    ic ? icon(ic) : null, label ? h('span', { text: label }) : null);
}

export function field(label, control, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint ? h('small', { class: 'hint', text: hint }) : null);
}
export const select = (options, value, onChange, props = {}) =>
  h('select', { ...props, onChange: (e) => onChange(e.target.value) },
    options.map((o) => h('option', { value: o.value ?? o, selected: (o.value ?? o) === value, text: o.label ?? o })));
export const textInput = (value, onInput, props = {}) =>
  h('input', { type: 'text', value: value ?? '', autocomplete: 'off', spellcheck: 'false', ...props, onInput: (e) => onInput(e.target.value) });

export function term(text, tip) {
  return h('abbr', { class: 'term', title: tip, tabindex: '0', text });
}

export function badge(text, tone = 'neutral', iconName) {
  return h('span', { class: `badge badge-${tone}` }, iconName ? icon(iconName, 12) : null, text);
}

export function table(columns, rows, { caption, className = '' } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', { class: `data ${className}` },
    caption ? h('caption', { class: 'sr-only', text: caption }) : null,
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', text: c })))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c?.nodeType ? c : String(c ?? '–'))))))));
}

/** Editable table. rows is mutated in place; onChange fires after every edit. */
export function editableTable({ columns, rows, onChange, newRow, reorder = false, minRows = 1, label }) {
  const wrap = h('div', { class: 'etable' });
  const render = () => {
    clear(wrap);
    wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data editable', 'aria-label': label },
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', text: c.label })), h('th', { scope: 'col', class: 'sr-only', text: 'Row actions' }))),
      h('tbody', {}, rows.map((row, i) => h('tr', {},
        columns.map((c) => h('td', {}, h('input', {
          type: 'text', value: row[c.key] ?? '', inputmode: c.numeric ? 'numeric' : 'text', 'aria-label': `${c.label}, row ${i + 1}`,
          class: c.numeric ? 'num' : '', size: c.size || 6, spellcheck: 'false', autocomplete: 'off',
          onInput: (e) => { row[c.key] = e.target.value; onChange(); },
        }))),
        h('td', { class: 'row-actions' },
          reorder ? button('', { icon: 'up', title: `Move row ${i + 1} up`, small: true, kind: 'ghost', disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); onChange(); } }) : null,
          reorder ? button('', { icon: 'down', title: `Move row ${i + 1} down`, small: true, kind: 'ghost', disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); onChange(); } }) : null,
          button('', { icon: 'x', title: `Remove row ${i + 1}`, small: true, kind: 'ghost', disabled: rows.length <= minRows, onClick: () => { rows.splice(i, 1); render(); onChange(); } }))))))),
      button('Add row', { icon: 'plus', small: true, onClick: () => { rows.push(newRow(rows)); render(); onChange(); } }));
  };
  render();
  return wrap;
}

/** Editable numeric matrix with row/column labels. data is mutated in place. */
export function matrixEditor({ title, data, rowNames, colNames, onChange }) {
  return h('div', { class: 'matrix' }, h('div', { class: 'matrix-title', text: title }),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data matrix-table', 'aria-label': title },
      h('thead', {}, h('tr', {}, h('th', {}), colNames.map((c) => h('th', { scope: 'col', text: c })))),
      h('tbody', {}, data.map((row, i) => h('tr', {}, h('th', { scope: 'row', text: rowNames[i] }),
        row.map((v, j) => h('td', {}, h('input', { type: 'text', inputmode: 'numeric', class: 'num', size: 3, value: v, 'aria-label': `${title} ${rowNames[i]} ${colNames[j]}`,
          onInput: (e) => { data[i][j] = e.target.value; onChange(); } })))))))));
}

export function toast(message, tone = 'info') {
  const t = h('div', { class: `toast toast-${tone}`, role: 'status' }, icon(tone === 'error' ? 'warn' : 'check'), h('span', { text: message }));
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3600);
}

export function errorBox(errors) {
  return h('div', { class: 'error-box', role: 'alert' }, h('strong', {}, icon('warn'), ' Fix these inputs, then run again'),
    h('ul', {}, errors.map((e) => h('li', { text: e }))));
}

export function download(filename, text, mime) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: filename });
  document.body.append(a); a.click(); a.remove();
}
export const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2).replace(/\.?0+$/, '') : v);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PCOLORS = 10;
export const pcolor = (idx) => `var(--p${((idx % PCOLORS) + PCOLORS) % PCOLORS})`;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function checkbox(label, checked, onChange, hint) {
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  return h('div', { class: 'check' }, h('input', { type: 'checkbox', id, checked, onChange: (e) => onChange(e.target.checked) }),
    h('label', { for: id, text: label }), hint ? h('small', { class: 'hint', text: hint }) : null);
}
export const chip = (text, cls = '', style) => h('span', { class: `chip ${cls}`, style }, text);
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const nextId = (rows, key, prefix) => { let n = rows.length + 1; const used = new Set(rows.map((r) => r[key])); while (used.has(prefix + n)) n++; return prefix + n; };
