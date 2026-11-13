import test from 'node:test';
import assert from 'node:assert/strict';
import { planOfflineWave } from '../src/offline-wave-planner.mjs';

const a = 'Cesare-ml/astrological-charts';
const b = 'Cesare-ml/VirgoStars-Ephemeris';
const write = (repo, issue, partition, root) => ({
  repository: repo, issue, status: 'ready', role: 'developer', access: 'write',
  resource_scope: { id: partition, roots: [root] },
  upstream_pr: 10, upstream_branch: 'feature/source'
});
const read = (repo, issue) => ({ repository: repo, issue, status: 'ready', role: 'reviewer', access: 'read' });
const tasks = [write(a, 11, 'render', 'src/render/'), write(b, 5, 'core', 'src/core/'),
  write(a, 12, 'render', 'src/render/'), write(a, 13, 'docs', 'docs/'), read(a, 15)];
let count = 0;
const fakeSession = () => 'chat-00000000-0000-4000-8000-' + String(++count).padStart(12, '0');
const run = (input = tasks, agents = 2, role = 'developer') => {
  count = 0;
  return planOfflineWave({ tasks: input, agents, role, sessionFactory: fakeSession });
};

test('plans independent repositories without claiming anything', () => {
  const plan = run();
  assert.equal(plan.agents_planned, 2);
  assert.equal(plan.claims_acquired, false);
  assert.equal(plan.verified_live_eligibility, false);
  assert.equal(plan.merge_authorized, false);
  assert.equal(plan.slots.length, 2);
  assert.notEqual(plan.slots[0].repository.toLowerCase(), plan.slots[1].repository.toLowerCase());
  assert.notEqual(plan.slots[0].session_id, plan.slots[1].session_id);
});
test('does not double-book two tasks for the same write partition', () => {
  const plan = run(tasks, 3);
  assert.deepEqual(plan.slots.map(s => s.issue).sort((x, y) => x - y), [5, 11, 13]);
  assert.equal(new Set(plan.slots.map(s => s.repository.toLowerCase() + '#' + s.resource_partition)).size, 3);
  assert.throws(() => run(tasks, 4), /not enough independent/);
});
test('is stable independent of catalog order', () => {
  assert.deepEqual(run(tasks).slots, run([...tasks].reverse()).slots);
});
test('supports reviewer-only or mixed local advisory waves', () => {
  assert.equal(run([read(a, 20), read(a, 21)], 2, 'reviewer').slots.length, 2);
  assert.equal(run([read(a, 20), write(b, 21, 'unit', 'test/')], 2, 'any').slots.length, 2);
});
test('rejects bad capacity, role, malformed tasks and duplicate session IDs', () => {
  for (const agents of [0, 1, 41, 2.5, NaN]) assert.throws(() => run(tasks, agents), /agent count/);
  assert.throws(() => run(tasks, 2, 'admin'), /unknown agent role/);
  assert.throws(() => run([...tasks, { ...tasks[0] }]), /Duplicate curated task/);
  assert.throws(() => run([write(a, 1, 'x', 'src/'), write(a, 2, 'y', 'src/shared/')]), /Overlapping write paths/);
  assert.throws(() => planOfflineWave({ tasks, agents: 2, sessionFactory: () => 'chat-00000000-0000-4000-8000-000000000001' }), /duplicate or invalid/);
});
test('refuses to silently plan fewer agents than requested', () => {
  assert.throws(() => run([read(a, 22)], 2, 'reviewer'), /not enough independent/);
  assert.throws(() => run([{ ...write(a, 22, 'ind', 'src/ind/'), status: 'blocked' }, write(b, 2, 'b', 'src/b/')]), /not enough independent/);
});
