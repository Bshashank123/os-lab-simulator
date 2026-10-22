// Playback controller + shared control bar. Speed only changes timing, never the computed trace.
import { h, icon, button, clear } from './ui.js';
import { prefs } from './store.js';

export const SPEEDS = [
  { label: 'Very Slow', ms: 2200 }, { label: 'Slow', ms: 1300 }, { label: 'Normal', ms: 750 },
  { label: 'Fast', ms: 380 }, { label: 'Very Fast', ms: 130 },
];

export class Playback {
  constructor({ total = 0, onChange = () => {}, speed = prefs.get().speed } = {}) {
    this.total = total; this.index = 0; this.playing = false; this.speed = speed; this.onChange = onChange; this.timer = null; this.enabled = total > 0;
  }
  load(total) { this.pause(); this.total = total; this.index = 0; this.enabled = total > 0; this.emit(); }
  disable() { this.pause(); this.enabled = false; this.emit(); }
  emit() { document.documentElement.style.setProperty('--anim', `${Math.min(650, SPEEDS[this.speed].ms * 0.6)}ms`); this.onChange(this); }
  goto(i) { if (!this.enabled) return; this.index = Math.max(0, Math.min(this.total - 1, i)); this.emit(); }
  next() { if (this.index < this.total - 1) this.goto(this.index + 1); else this.pause(); }
  prev() { this.pause(); this.goto(this.index - 1); }
  play() {
    if (!this.enabled) return;
    if (this.index >= this.total - 1) this.index = 0;
    this.playing = true; this.emit(); this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      if (this.index >= this.total - 1) { this.pause(); return; }
      this.index += 1; this.emit();
      if (this.index >= this.total - 1) this.pause(); else this.schedule();
    }, SPEEDS[this.speed].ms);
  }
  pause() { clearTimeout(this.timer); if (this.playing) { this.playing = false; this.emit(); } }
  toggle() { this.playing ? this.pause() : this.play(); }
  reset() { this.pause(); this.goto(0); }
  restart() { this.index = 0; this.play(); }
  setSpeed(i) { this.speed = i; prefs.set({ speed: i }); this.emit(); if (this.playing) this.schedule(); }
  destroy() { clearTimeout(this.timer); this.playing = false; }
}

export function playbackControls(pb) {
  const root = h('div', { class: 'playback', role: 'group', 'aria-label': 'Playback controls' });
  const btn = {
    reset: button('Reset', { icon: 'reset', title: 'Reset to the first step', onClick: () => pb.reset() }),
    prev: button('', { icon: 'back', title: 'Previous step (Left arrow)', onClick: () => pb.prev() }),
    play: button('Play', { icon: 'play', kind: 'primary', title: 'Play or pause (Space)', onClick: () => pb.toggle() }),
    next: button('', { icon: 'forward', title: 'Next step (Right arrow)', onClick: () => { pb.pause(); pb.next(); } }),
    restart: button('Restart', { icon: 'restart', title: 'Restart from step 1 and play', onClick: () => pb.restart() }),
  };
  const speed = h('select', { 'aria-label': 'Playback speed', onChange: (e) => pb.setSpeed(+e.target.value) },
    SPEEDS.map((s, i) => h('option', { value: i, text: s.label })));
  const counter = h('span', { class: 'step-counter', 'aria-live': 'polite' });
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { class: 'progress-fill' }));
  const jump = h('input', { type: 'range', min: 1, max: 1, value: 1, 'aria-label': 'Jump to step', onInput: (e) => { pb.pause(); pb.goto(+e.target.value - 1); } });
  root.append(h('div', { class: 'pb-row' }, btn.reset, btn.prev, btn.play, btn.next, btn.restart,
    h('label', { class: 'speed' }, h('span', { text: 'Speed' }), speed)),
    h('div', { class: 'pb-row pb-status' }, counter, bar), jump);
  const sync = () => {
    const off = !pb.enabled;
    Object.values(btn).forEach((b) => { b.disabled = off; });
    btn.prev.disabled = off || pb.index === 0;
    btn.next.disabled = off || pb.index >= pb.total - 1;
    jump.disabled = off; speed.value = pb.speed;
    clear(btn.play); btn.play.append(icon(pb.playing ? 'pause' : 'play'), h('span', { text: pb.playing ? 'Pause' : 'Play' }));
    counter.textContent = off ? 'No simulation yet. Run one to enable playback.' : `Step ${pb.index + 1} of ${pb.total}`;
    const pct = pb.total > 1 ? (pb.index / (pb.total - 1)) * 100 : off ? 0 : 100;
    bar.firstChild.style.width = `${pct}%`; bar.setAttribute('aria-valuenow', Math.round(pct));
    jump.max = Math.max(1, pb.total); jump.value = pb.index + 1;
  };
  return { el: root, sync };
}

export function bindKeys(pb, signal) {
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, button, [contenteditable]') && e.key === ' ') return;
    if (e.target.closest('input[type=text], textarea, select')) return;
    if (e.key === ' ') { e.preventDefault(); pb.toggle(); }
    else if (e.key === 'ArrowRight') { pb.pause(); pb.next(); }
    else if (e.key === 'ArrowLeft') pb.prev();
  }, { signal });
}
