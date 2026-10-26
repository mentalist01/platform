import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { openOfficePair } from './adapters.mjs';
import { createRelay } from './relay.mjs';
import { LivePeer, startLiveLoop } from './sync.mjs';

const directory = path.resolve(process.argv[2] || `output/workbook-live-check-${Date.now()}`);
await fs.mkdir(directory, { recursive: false });
const addresses = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
const checks = [], start = performance.now();
let offices, relay;
const measure = async (name, callback) => {
  const began = performance.now();
  await callback();
  checks.push({ name, passed: true, ms: Math.round(performance.now() - began) });
  console.log(JSON.stringify(checks.at(-1)));
};
const edit = (adapter, changes) => adapter.request({ type: 'edit', changes });
const number = value => ({ kind: 'number', value });
try {
  offices = await openOfficePair({ directory, addresses });
  relay = await createRelay(addresses);
  const teacher = new LivePeer({ actor: 'teacher', adapter: offices.excel, exchange: relay.exchange('teacher') });
  const pupil = new LivePeer({ actor: 'pupil', adapter: offices.calc, exchange: relay.exchange('pupil') });
  await Promise.all([teacher.initialize(), pupil.initialize()]);
  const settle = async () => { for (let round = 0; round < 3; round++) await Promise.all([teacher.sync(), pupil.sync()]); };
  const compare = async () => {
    const a = (await offices.excel.request({ type: 'snapshot' })).cells;
    const b = (await offices.calc.request({ type: 'snapshot' })).cells;
    assert.deepEqual(a, b); assert.deepEqual(a, relay.room.cells);
    return a;
  };
  await measure('Concurrent Excel and Calc edits merge without saving either file', async () => {
    await Promise.all([edit(offices.excel, [{ address: 'A1', content: number(12) }]), edit(offices.calc, [{ address: 'B1', content: number(30) }])]);
    await settle(); const cells = await compare();
    assert.equal(cells.A1.content.value, 12); assert.equal(cells.B1.content.value, 30);
  });
  await measure('Formula from Excel calculates in LibreOffice', async () => {
    await edit(offices.excel, [{ address: 'C1', content: { kind: 'formula', value: '=SUM(A1,B1)' } }]);
    await settle(); await compare();
    assert.equal((await offices.calc.request({ type: 'evaluate', address: 'C1' })).value, 42);
  });
  await measure('Formula from LibreOffice calculates in Excel; comma inside text is preserved', async () => {
    await edit(offices.calc, [{ address: 'A2', content: { kind: 'formula', value: '=IF(A1>0,"comma, kept","")' } }]);
    await settle(); await compare();
    assert.equal((await offices.excel.request({ type: 'evaluate', address: 'A2' })).value, 'comma, kept');
  });
  await measure('Formula recalculates on both sides after a remote input changes', async () => {
    await edit(offices.calc, [{ address: 'B1', content: number(35) }]);
    await settle(); await compare();
    for (const adapter of [offices.calc, offices.excel]) assert.equal((await adapter.request({ type: 'evaluate', address: 'C1' })).value, 47);
  });
  await measure('Contents and background color of the same cell merge', async () => {
    await Promise.all([edit(offices.excel, [{ address: 'B2', content: number(55) }]), edit(offices.calc, [{ address: 'B2', fill: 0x72dca0 }])]);
    await settle(); const cells = await compare();
    assert.deepEqual(cells.B2, { content: number(55), fill: 0x72dca0 });
  });
  await measure('Multi-cell input, literal text, deletion and background reset synchronize', async () => {
    await edit(offices.excel, [{ address: 'D1', content: { kind: 'text', value: '=literal, not formula' }, fill: 0xffcc00 }, { address: 'D2', content: number(-3.5) }]);
    await settle(); await compare();
    await edit(offices.calc, [{ address: 'D1', content: { kind: 'empty' }, fill: null }, { address: 'D2', content: number(-7.25) }]);
    await settle(); const cells = await compare();
    assert.deepEqual(cells.D1, { content: { kind: 'empty' }, fill: null });
    assert.equal(cells.D2.content.value, -7.25);
  });
  await measure('Conflicting edits keep both values until an explicit choice', async () => {
    await edit(offices.excel, [{ address: 'C2', content: number(100) }]);
    await edit(offices.calc, [{ address: 'C2', content: number(200) }]);
    await teacher.sync(); await pupil.sync();
    assert.equal(pupil.conflicts.size, 1);
    assert.equal((await offices.calc.request({ type: 'snapshot' })).cells.C2.content.value, 200);
    assert.equal(relay.room.cells.C2.content.value, 100);
    await pupil.resolve('C2', 'content', 'local'); await settle();
    assert.equal((await compare()).C2.content.value, 200);
  });
  await measure('Connection interruption preserves pending changes and recovers', async () => {
    const exchange = teacher.exchange;
    teacher.exchange = async () => { throw Error('Simulated network outage'); };
    await edit(offices.excel, [{ address: 'A1', content: number(20) }]);
    await assert.rejects(teacher.sync(), /network outage/); assert.ok(teacher.pending.length);
    teacher.exchange = exchange; await settle(); await compare();
    assert.equal((await offices.calc.request({ type: 'evaluate', address: 'C1' })).value, 55);
  });
  await measure('Receiving remote changes does not create an echo loop', async () => {
    const revision = relay.room.revision;
    await settle(); await settle();
    assert.equal(relay.room.revision, revision);
  });
  await measure('Automatic loop detects edits in both running applications', async () => {
    const loop = startLiveLoop([teacher, pupil], { intervalMs: 200 });
    try {
      await Promise.all([edit(offices.excel, [{ address: 'A1', content: number(21) }]), edit(offices.calc, [{ address: 'B1', content: number(36) }])]);
      const deadline = performance.now() + 5000;
      let synchronized = false;
      while (performance.now() < deadline) {
        const excel = (await offices.excel.request({ type: 'snapshot' })).cells;
        const calc = (await offices.calc.request({ type: 'snapshot' })).cells;
        if (excel.A1.content.value === 21 && excel.B1.content.value === 36 && calc.A1.content.value === 21 && calc.B1.content.value === 36) { synchronized = true; break; }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      assert.ok(synchronized, 'Both applications must receive remote changes within five seconds');
    } finally { await loop.stop(); }
    await settle(); await compare();
  });
  const final = await compare();
  await measure('Both applications save the merged result to separate local test files', async () => {
    await offices.excel.request({ type: 'save', path: path.join(directory, 'Excel-merged.xlsx') });
    await offices.calc.request({ type: 'save', path: path.join(directory, 'Calc-merged.ods') });
    assert.ok((await fs.stat(path.join(directory, 'Excel-merged.xlsx'))).size > 0);
    assert.ok((await fs.stat(path.join(directory, 'Calc-merged.ods'))).size > 0);
  });
  const report = { ok: true, prototypeOnly: true, engines: ['Excel Windows', 'LibreOffice Windows'], macTested: false,
    checks, durationMs: Math.round(performance.now() - start), cells: final, metrics: { relay: relay.metrics(), teacher: teacher.metrics, pupil: pupil.metrics },
    scope: { sheet: 'Live', addresses, properties: ['content', 'fill'], unsupported: ['sorting', 'row/column insertion', 'sheets', 'Undo', 'arbitrary formula grammar', 'production authorization', 'Mac adapters'] } };
  await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, directory, metrics: report.metrics }));
} catch (error) {
  await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({ ok: false, checks, error: error.stack }, null, 2));
  console.error(error); process.exitCode = 1;
} finally { if (offices) await offices.close(); if (relay) await relay.close(); }
