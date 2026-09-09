import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineOf,
  branchExperiment,
  createExperiment,
  displacement,
  evidenceMemory,
  initialWorkspace,
  period,
} from '../lib/field';
import { applyActions, demoReply, validateActions } from '../lib/agent';
import { canonicalWorkspace, validWorkspace } from '../lib/validation';

await test('Moon gravity produces the expected pendulum period ratio', () => {
  const w = initialWorkspace();
  const before = w.experiments[0];
  const result = demoReply('Try Moon gravity', w);
  const moon = result.workspace.experiments[1];
  assert.equal(moon.params.gravity, 1.62);
  assert.ok(
    Math.abs(period(moon) / period(before) - Math.sqrt(9.81 / 1.62)) < 1e-12,
  );
  assert.equal(before.params.gravity, 9.81);
  assert.ok(validWorkspace(result.workspace));
});
await test('a frozen baseline survives parent and branch edits', () => {
  const w = initialWorkspace();
  const source = w.experiments[0];
  const branch = branchExperiment(source, 1);
  source.params.length = 2;
  branch.params.gravity = 1.62;
  const frozen = baselineOf(branch)!;
  assert.equal(frozen.params.length, 1.5);
  assert.equal(frozen.params.gravity, 9.81);
  assert.equal(branch.params.length, 1.5);
});
await test('memory evidence remains independent and rejects fabricated periods', () => {
  const w = initialWorkspace();
  const e = w.experiments[0];
  const memory = evidenceMemory(e);
  w.memories.push(memory);
  const expected = memory.evidence!.period;
  e.params.gravity = 1.62;
  assert.equal(memory.evidence!.params.gravity, 9.81);
  assert.equal(memory.evidence!.period, expected);
  assert.ok(validWorkspace(w));
  memory.evidence!.period = 999;
  assert.equal(validWorkspace(w), false);
});
await test('spring scaling and amplitude units match the equations', () => {
  const e = createExperiment('spring');
  const before = period(e);
  e.params.mass *= 4;
  assert.ok(Math.abs(period(e) / before - 2) < 1e-12);
  e.params.amplitude = 20;
  assert.equal(displacement(e, 0), 0.2);
  assert.ok(Math.abs(displacement(e, period(e) / 4)) < 1e-12);
});
await test('actions reject unsafe and nonfinite values without partial mutation', () => {
  const w = initialWorkspace();
  const snapshot = JSON.stringify(w);
  assert.equal(
    validateActions([
      { type: 'update', experimentId: w.selectedId, params: { gravity: NaN } },
    ]),
    false,
  );
  assert.equal(
    validateActions([
      { type: 'update', experimentId: w.selectedId, params: { gravity: -1 } },
    ]),
    false,
  );
  assert.equal(validateActions([{ type: 'execute', code: 'alert(1)' }]), false);
  assert.equal(
    validateActions([
      {
        type: 'update',
        experimentId: w.selectedId,
        params: { __proto__: null, alien: 1 },
      },
    ]),
    false,
  );
  assert.throws(() =>
    applyActions(w, [
      { type: 'update', experimentId: w.selectedId, params: { length: 2 } },
      { type: 'branch', experimentId: 'missing' },
    ]),
  );
  assert.equal(JSON.stringify(w), snapshot);
});
await test('remember commands preserve user provenance; canonical storage excludes keys', () => {
  const { workspace } = demoReply(
    'Remember: I learn through experiments.',
    initialWorkspace(),
  );
  assert.equal(workspace.memories[0].source, 'user');
  assert.equal(workspace.memories[0].evidence, undefined);
  assert.ok(validWorkspace(workspace));
  const polluted = {
    ...workspace,
    key: 'should-never-save',
    profile: { ...workspace.profile, apiKey: 'private' },
  };
  const data = JSON.stringify(canonicalWorkspace(polluted));
  assert.ok(!data.includes('should-never-save'));
  assert.ok(!data.includes('apiKey'));
});
await test('offline experiment commands reject unsupported input and explain inactive spring gravity', () => {
  const w = initialWorkspace();
  assert.match(demoReply('Tell me the weather', w).reply, /Connect a model/);
  const spring = createExperiment('spring');
  w.experiments.push(spring);
  w.selectedId = spring.id;
  const result = demoReply('Try Moon gravity', w);
  assert.equal(result.workspace.experiments.length, 2);
  assert.match(result.reply, /not its ideal period/);
});
await test('duplicate identifiers and orphaned branches are rejected', () => {
  const w = initialWorkspace();
  w.experiments.push({ ...w.experiments[0] });
  assert.equal(validWorkspace(w), false);
  const valid = initialWorkspace();
  const b = branchExperiment(valid.experiments[0], 1);
  b.parentId = 'missing';
  valid.experiments.push(b);
  assert.equal(validWorkspace(valid), false);
});
