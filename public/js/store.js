// All persistence is local to this browser (localStorage). Nothing is sent to a server.
const K = { prefs: 'oslab.prefs', saved: 'oslab.saved', recent: 'oslab.recent', progress: 'oslab.progress' };
function read(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

export const prefs = {
  get: () => ({ theme: null, motion: true, speed: 2, sidebar: true, ...read(K.prefs, {}) }),
  set(patch) { write(K.prefs, { ...prefs.get(), ...patch }); },
};

export const progress = {
  all: () => read(K.progress, {}),
  mark(week, key) { const p = progress.all(); p[week] = { ...(p[week] || {}), [key]: true }; write(K.progress, p); },
  pct(week) { const p = progress.all()[week] || {}; return Math.round(([p.ran, p.finished, p.saved].filter(Boolean).length / 3) * 100); },
};

export const recent = {
  all: () => read(K.recent, []),
  add(entry) {
    const list = recent.all().filter((e) => !(e.week === entry.week && e.algorithm === entry.algorithm));
    list.unshift({ ...entry, date: new Date().toISOString() });
    write(K.recent, list.slice(0, 8));
  },
};

export const saved = {
  all: () => read(K.saved, []),
  add(exp) {
    const list = saved.all();
    const item = { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: new Date().toISOString(), ...exp };
    list.unshift(item);
    if (!write(K.saved, list)) { delete item.result; if (!write(K.saved, list)) return null; }
    return item;
  },
  update(id, patch) { write(K.saved, saved.all().map((e) => (e.id === id ? { ...e, ...patch } : e))); },
  remove(id) { write(K.saved, saved.all().filter((e) => e.id !== id)); },
  clear() { write(K.saved, []); },
  get: (id) => saved.all().find((e) => e.id === id),
};

// Inputs shared between weeks that use the same module (e.g. Week 1 and 2 share CPU processes) for this session.
const shared = {};
export const moduleInput = {
  get: (module, make) => (shared[module] ||= make()),
  set: (module, value) => { shared[module] = value; },
};

/** Re-open a recent/saved configuration in its week workspace (the workspace re-runs it, so results are always fresh). */
export function openEntry(entry) {
  moduleInput.set(entry.module, JSON.parse(JSON.stringify(entry.input)));
  location.hash = `#/week/${entry.week}/${entry.algorithm}`;
}
