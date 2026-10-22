import { h, clear, icon } from './ui.js';
import { WEEKS, week as getWeek } from './navigation.js';
import { prefs } from './store.js';
import { mountDashboard } from './views/dashboard.js';
import { mountWorkspace } from './views/workspace.js';
import { mountCompare } from './views/compare.js';
import { mountSaved } from './views/saved.js';
import { mountAbout } from './views/about.js';

const root = document.documentElement;
const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const topbar = document.getElementById('topbar');
const shell = document.getElementById('shell');

// ---------- theme + motion
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const theme = () => prefs.get().theme || (systemDark.matches ? 'dark' : 'light');
function applyPrefs() {
  root.dataset.theme = theme();
  root.dataset.motion = prefs.get().motion ? 'on' : 'off';
}
applyPrefs();
systemDark.addEventListener('change', applyPrefs);

// ---------- routing
const ROUTES = [
  [/^#\/week\/(\d+)(?:\/(\w+))?$/, (m) => ({ title: `Week ${m[1]}`, mount: () => mountWorkspace(main, +m[1], m[2]), nav: `week-${m[1]}`, ok: !!getWeek(m[1]) })],
  [/^#\/compare(?:\/(\w+))?$/, (m) => ({ title: 'Compare algorithms', mount: () => mountCompare(main, m[1]), nav: 'compare', ok: true })],
  [/^#\/saved$/, () => ({ title: 'Saved experiments', mount: () => mountSaved(main), nav: 'saved', ok: true })],
  [/^#\/about$/, () => ({ title: 'About the project', mount: () => mountAbout(main), nav: 'about', ok: true })],
  [/^(#\/?)?$/, () => ({ title: 'Dashboard', mount: () => mountDashboard(main), nav: 'dashboard', ok: true })],
];
let cleanup = () => {}, current = null;

function route() {
  cleanup(); cleanup = () => {};
  const hash = location.hash;
  let match = null;
  for (const [re, make] of ROUTES) { const m = hash.match(re); if (m) { match = make(m); break; } }
  if (!match || !match.ok) match = ROUTES[ROUTES.length - 1][1]();
  current = match;
  clear(main);
  try { cleanup = match.mount() || (() => {}); }
  catch (e) { console.error(e); main.append(h('div', { class: 'error-box', role: 'alert' }, h('strong', { text: 'Something went wrong while opening this page.' }), h('p', { text: String(e.message || e) }))); }
  const w = match.nav.startsWith('week-') ? getWeek(match.nav.slice(5)) : null;
  document.title = `${w ? `Week ${w.n}: ${w.topic}` : match.title} | OS Lab Simulator`;
  drawNav(); drawTopbar(w);
  closeSidebar();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

// ---------- chrome
const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '#/', ic: 'home' },
  ...WEEKS.map((w) => ({ id: `week-${w.n}`, label: w.nav, href: `#/week/${w.n}`, topic: w.topic, week: true })),
  { id: 'compare', label: 'Compare Algorithms', href: '#/compare', ic: 'chart' },
  { id: 'saved', label: 'Saved Experiments', href: '#/saved', ic: 'bookmark' },
  { id: 'about', label: 'About the Project', href: '#/about', ic: 'info' },
];
function drawNav() {
  clear(sidebar).append(h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, h('strong', { text: 'OS Lab Simulator' }), h('small', { text: 'Understand. Simulate. Compare.' }))),
    h('nav', { 'aria-label': 'Sections' }, h('ul', { class: 'nav-list' }, NAV.map((n) => h('li', {}, h('a', { href: n.href, class: `nav-item${current?.nav === n.id ? ' active' : ''}${n.week ? ' is-week' : ''}`, 'aria-current': current?.nav === n.id ? 'page' : null },
      n.ic ? icon(n.ic) : null, h('span', { text: n.label })))))));
}
function drawTopbar(w) {
  clear(topbar).append(
    h('button', { class: 'btn btn-ghost menu-btn', type: 'button', 'aria-label': 'Toggle navigation', 'aria-controls': 'sidebar', 'aria-expanded': String(shell.classList.contains('nav-open')), onClick: toggleSidebar }, icon('menu', 20)),
    h('div', { class: 'crumb' }, h('strong', { text: w ? `Week ${w.n}` : current.title }), w ? h('span', { class: 'muted', text: w.topic }) : null),
    h('div', { class: 'topbar-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', 'aria-pressed': String(!prefs.get().motion), title: 'Turn animations off or on', onClick: () => { prefs.set({ motion: !prefs.get().motion }); applyPrefs(); drawTopbar(w); } }, h('span', { text: prefs.get().motion ? 'Animations on' : 'Animations off' })),
      h('button', { class: 'btn btn-ghost', type: 'button', title: 'Switch light or dark theme', 'aria-label': `Switch to ${theme() === 'dark' ? 'light' : 'dark'} theme`, onClick: () => { prefs.set({ theme: theme() === 'dark' ? 'light' : 'dark' }); applyPrefs(); drawTopbar(w); } }, icon(theme() === 'dark' ? 'sun' : 'moon'), h('span', { text: theme() === 'dark' ? 'Light' : 'Dark' }))));
}
function toggleSidebar() { shell.classList.toggle('nav-open'); const b = topbar.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', String(shell.classList.contains('nav-open'))); }
function closeSidebar() { shell.classList.remove('nav-open'); }
document.getElementById('scrim').addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

window.addEventListener('hashchange', route);
route();
