import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser stubs so the pure logic can run under Node.
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.document = { documentElement: { style: { setProperty() {} } } };

const { Playback, SPEEDS } = await import('../../public/js/playback.js');
const { saved, progress, recent } = await import('../../public/js/store.js');
const { toCSV, toJSON } = await import('../../public/js/export.js');
const { bestOf } = await import('../../public/js/views/compare.js');

test('playback: next/prev move one step and prev restores the earlier index', () => {
  const pb = new Playback({ total: 5 });
  pb.next(); pb.next(); assert.equal(pb.index, 2);
  pb.prev(); assert.equal(pb.index, 1);
  pb.prev(); pb.prev(); assert.equal(pb.index, 0);
});
test('playback: goto clamps, reset returns to 0, disabled ignores input', () => {
  const pb = new Playback({ total: 4 });
  pb.goto(99); assert.equal(pb.index, 3);
  pb.reset(); assert.equal(pb.index, 0);
  pb.disable(); pb.goto(2); assert.equal(pb.index, 0);
});
test('playback: speed has five settings and changing it never changes index or total', () => {
  assert.equal(SPEEDS.length, 5);
  const pb = new Playback({ total: 6 }); pb.goto(3);
  for (let i = 0; i < 5; i++) pb.setSpeed(i);
  assert.equal(pb.index, 3); assert.equal(pb.total, 6);
});
test('playback: play advances on a timer and stops at the last step', async () => {
  const pb = new Playback({ total: 3, speed: 4 });
  pb.play(); await new Promise((r) => setTimeout(r, SPEEDS[4].ms * 4));
  assert.equal(pb.index, 2); assert.equal(pb.playing, false);
});
test('store: save, rename, duplicate-style add, delete and clear', () => {
  saved.clear();
  const a = saved.add({ name: 'A', week: 1, input: {} });
  const b = saved.add({ name: 'B', week: 2, input: {} });
  assert.equal(saved.all().length, 2); assert.notEqual(a.id, b.id);
  saved.update(a.id, { name: 'A2' }); assert.equal(saved.get(a.id).name, 'A2');
  saved.remove(b.id); assert.equal(saved.all().length, 1);
  saved.clear(); assert.equal(saved.all().length, 0);
});
test('store: progress percentage and recent list de-duplication', () => {
  progress.mark(3, 'ran'); assert.equal(progress.pct(3), 33);
  progress.mark(3, 'finished'); progress.mark(3, 'saved'); assert.equal(progress.pct(3), 100);
  recent.add({ week: 1, algorithm: 'fcfs' }); recent.add({ week: 1, algorithm: 'fcfs' });
  assert.equal(recent.all().filter((e) => e.week === 1).length, 1);
});
test('export: CSV escapes commas/quotes, has BOM, metrics and table; JSON round-trips', () => {
  const exp = { name: 'T, "q"', week: 2, topic: 'CPU', algorithm: 'rr', date: 'd', input: { a: 1 }, metrics: { avg: 2.5, list: [1, 2] } };
  const csv = toCSV(exp, { columns: ['p', 'x'], rows: [['P1', 'a,b']] });
  assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('"T, ""q"""')); assert.ok(csv.includes('avg,2.5'));
  assert.ok(csv.includes('list,1; 2')); assert.ok(csv.includes('P1,"a,b"'));
  assert.deepEqual(JSON.parse(toJSON(exp)).input, { a: 1 });
});
test('compare: bestOf handles min, max, ties and unranked metrics', () => {
  const v = [{ id: 'a', value: 3 }, { id: 'b', value: 5 }, { id: 'c', value: 3 }];
  assert.deepEqual(bestOf({ better: 'min' }, v).ids, ['a', 'c']);
  assert.deepEqual(bestOf({ better: 'max' }, v).ids, ['b']);
  assert.equal(bestOf({ better: 'min' }, [{ id: 'a', value: 1 }, { id: 'b', value: 1 }]).tie, true);
  assert.equal(bestOf({ better: null }, v), null);
});
