import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifySectionStartup } from './check-section-startup.mjs';

async function fixture(t) {
  const temp = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temp, 'ivan-section-startup-'));
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(temp + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'assets'));
  const write = (file, source) => fs.writeFile(path.join(root, file), source);
  await write('index.html', '<script type="module" src="/assets/index-fixture.js"></script>');
  await write('assets/index-fixture.js', 'const app = () => import("./App-fixture.js");');
  await write('assets/App-fixture.js', 'import "./common.js"; const paths = ["assets/PythonSection-fixture.js", "assets/ProgressSection-fixture.js", "assets/NotesSection-fixture.js"];');
  await write('assets/common.js', 'export const common = true;');
  for (const name of ['PythonSection','ProgressSection','NotesSection']) await write(`assets/${name}-fixture.js`, 'import "./common.js"; export const solve = () => import("./editor-adapter-fixture.js");');
  await write('assets/editor-adapter-fixture.js', 'export const editor = true;');
  return { root, write };
}

test('allows an editor loaded on demand and excludes already loaded shared code', async t => {
  const { root } = await fixture(t);
  const report = await verifySectionStartup(root);
  assert.equal(report.length, 3);
  for (const section of report) {
    assert.equal(section.modules.length, 1);
    assert.ok(section.modules[0].includes(section.name));
  }
});

test('rejects an editor hidden behind a transitive import or re-export', async t => {
  const { root, write } = await fixture(t);
  await write('assets/NotesSection-fixture.js', 'export { editor } from "./notes-helper.js";');
  await write('assets/notes-helper.js', 'export { editor } from "./editor-adapter-fixture.js";');
  await assert.rejects(verifySectionStartup(root), /NotesSection: editor eagerly loaded/);
});

test('rejects an oversized section even when it does not contain an editor', async t => {
  const { root, write } = await fixture(t);
  await write('assets/PythonSection-fixture.js', `export const data = "${'x'.repeat(450_001)}";`);
  await assert.rejects(verifySectionStartup(root), /PythonSection: startup budget exceeded/);
});
