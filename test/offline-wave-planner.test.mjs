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


test('10 + 10 separate planning waves preserve distinct issue and session identities', () => {
  const forty = Array.from({ length: 40 }, (_, i) =>
    write(a, 1000 + i, 'partition-' + i, 'tests/unique-' + i + '.mjs'));
  count = 0;
  const first = planOfflineWave({ tasks: forty, agents: 10, sessionFactory: fakeSession });
  const second = planOfflineWave({ tasks: forty, agents: 10,
    previousSlots: first.slots, sessionFactory: fakeSession });
  assert.equal(first.agents_total_planned, 10);
  assert.equal(second.agents_previously_planned, 10);
  assert.equal(second.agents_total_planned, 20);
  const all = [...first.slots, ...second.slots];
  assert.equal(new Set(all.map(slot => slot.issue)).size, 20);
  assert.equal(new Set(all.map(slot => slot.resource_partition)).size, 20);
  assert.equal(new Set(all.map(slot => slot.session_id)).size, 20);
  const remaining = planOfflineWave({ tasks: forty, agents: 20,
    previousSlots: all, sessionFactory: fakeSession });
  assert.equal(remaining.agents_total_planned, 40);
  assert.throws(() => planOfflineWave({ tasks: forty, agents: 2,
    previousSlots: [...all, ...remaining.slots] }), /capacity/);
});

test('previous slots fail closed on duplicate claims, tampering and reused session IDs', () => {
  count = 0;
  const plan = planOfflineWave({ tasks, agents: 2, sessionFactory: fakeSession });
  const duplicate = [plan.slots[0], plan.slots[0]];
  assert.throws(() => planOfflineWave({ tasks, agents: 2, previousSlots: duplicate }),
    /previous wave conflicts/);
  const badPartition = [{ ...plan.slots[0], resource_partition: 'not-approved' }];
  assert.throws(() => planOfflineWave({ tasks, agents: 2, previousSlots: badPartition }),
    /conflicting write partition/);
  const missingTask = [{ ...plan.slots[0], issue: 999999 }];
  assert.throws(() => planOfflineWave({ tasks, agents: 2, previousSlots: missingTask }),
    /previous wave conflicts/);
  const badSession = [{ ...plan.slots[0], session_id: 'chat-INVALID' }];
  assert.throws(() => planOfflineWave({ tasks, agents: 2, previousSlots: badSession }),
    /invalid previous/);
  const expandedTasks = [...tasks, write(b, 800, 'addon', 'test/addon/')];
  assert.throws(() => planOfflineWave({ tasks: expandedTasks, agents: 2,
    previousSlots: plan.slots, sessionFactory: () => plan.slots[0].session_id }),
    /duplicate or invalid/);
});

test('same write partition in different prior tasks blocks later wave', () => {
  const old = [{ ...tasks[0] }];
  const candidate = [{ ...tasks[2] }];
  count = 0;
  const slot = planOfflineWave({ tasks: [old[0], candidate[0], read(a, 500), read(a, 501)],
    agents: 2, role: 'any', sessionFactory: fakeSession }).slots[0];
  // Both writer tasks share the same partition. The unselected second writer
  // cannot later be planned even if it is not itself in the prior slots.
  const all = [old[0], candidate[0], write(b, 400, 'b', 'src/b/'),
    read(a, 500), read(a, 501)];
  const previousSlots = [{
    slot: 1, repository: old[0].repository, issue: old[0].issue,
    session_id: slot.session_id, access: 'write', role: 'developer',
    resource_partition: 'render', upstream_pr: 10, upstream_branch: 'feature/source'
  }];
  assert.throws(() => planOfflineWave({ tasks: all, agents: 2, role: 'developer',
    previousSlots, sessionFactory: fakeSession }), /not enough independent/);
});
