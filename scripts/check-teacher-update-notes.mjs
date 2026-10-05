import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export function validateTeacherUpdateCatalog(catalog, version) {
  assert.ok(Array.isArray(catalog.cabinet) && catalog.cabinet.length, 'Cabinet release notes are required');
  assert.ok(Array.isArray(catalog.desktop), 'Desktop release notes are required');
  const ids = new Set();
  for (const release of [...catalog.cabinet, ...catalog.desktop]) {
    assert.ok(/^[a-z0-9.-]+$/.test(release.id) && !ids.has(release.id), 'Release ids must be unique');
    ids.add(release.id);
    assert.ok(release.title?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(release.date), 'Release title and date are required');
    assert.ok(Array.isArray(release.changes) && release.changes.length && release.changes.every(change => typeof change === 'string' && change.trim()), 'Describe every release with a non-empty change list');
  }
  assert.ok(catalog.desktop.some(release => release.version === version), `Add desktop release notes for ${version}`);
}

export function validateTeacherUpdateHistory(catalog, previous) {
  const all = [...catalog.cabinet, ...catalog.desktop];
  for (const released of [...previous.cabinet, ...previous.desktop]) {
    assert.deepEqual(all.find(release => release.id === released.id), released, `Keep published release ${released.id} unchanged; add a new entry instead`);
  }
  assert.ok(catalog.cabinet.some(release => !previous.cabinet.some(old => old.id === release.id)), 'Add a new cabinet release id for this update');
}

export function checkTeacherUpdateNotes() {
  const filename = 'src/data/teacherUpdates.json';
  const catalog = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const version = JSON.parse(fs.readFileSync('tools/teacher-desktop/package.json', 'utf8')).version;
  validateTeacherUpdateCatalog(catalog, version);
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // Local preparation can add the catalog before its first commit. Published builds
  // require a clean tree through the existing release script.
  const pending = git(['status', '--porcelain', '--', filename]);
  const notesCommit = git(['log', '-1', '--format=%H', '--', filename]);
  let previous;
  try { previous = JSON.parse(git(['show', `${pending ? 'HEAD' : `${notesCommit}^`}:${filename}`])); } catch { /* First catalog publication. */ }
  if (previous) validateTeacherUpdateHistory(catalog, previous);
  if (pending) return;
  assert.ok(notesCommit, 'Commit the teacher release notes before publication');
  const productPaths = ['src', 'server', 'tools/teacher-desktop', 'tools/lesson-recorder'];
  const changes = git(['diff', '--name-only', notesCommit, 'HEAD', '--', ...productPaths,
    ':(exclude)**/*.test.*', ':(exclude)**/test/**', ':(exclude)**/README.md', ':(exclude)**/scripts/**']);
  assert.equal(changes, '', 'Before the next release, add all changes to teacherUpdates.json with a new cabinet id (and desktop version notes when applicable).');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkTeacherUpdateNotes();
  console.log('Teacher release notes are complete and current.');
}
