import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentSearchQuery,
  createStudentSearchSnippet,
  matchStudentSearchCandidate,
  normalizeStudentSearchText,
} from './studentSearch.js';

test('normalizes Russian text and whitespace without changing code tokens', () => {
  assert.equal(normalizeStudentSearchText('  Импорт\n Ёлка  '), 'импорт елка');
  assert.equal(buildStudentSearchQuery('import functools').normalized, 'import functools');
});

test('matches a phrase found only in full file content', () => {
  const query = buildStudentSearchQuery('import functools');
  const result = matchStudentSearchCandidate({
    result: { id: 'file:1', title: 'Шпаргалка' },
    fields: [
      { name: 'title', text: 'Шпаргалка', weight: 600 },
      { name: 'content', text: '# memo\nimport functools\n\n@functools.cache\ndef solve(): pass', weight: 500 },
    ],
  }, query);
  assert.ok(result);
  assert.equal(result.matchedField, 'content');
  assert.match(result.snippet, /import functools/);
});

test('requires every query token but lets tokens occur in separate metadata fields', () => {
  const candidate = {
    result: { id: 'file:2' },
    fields: [
      { name: 'title', text: 'Динамическое программирование', weight: 600 },
      { name: 'tags', text: 'шпаргалка functools', weight: 200 },
    ],
  };
  assert.ok(matchStudentSearchCandidate(candidate, 'динамическое functools'));
  assert.equal(matchStudentSearchCandidate(candidate, 'динамическое itertools'), null);
});

test('snippet is bounded and centered around a matching line', () => {
  const source = `${'before '.repeat(90)}\nimport functools\n${'after '.repeat(90)}`;
  const snippet = createStudentSearchSnippet(source, buildStudentSearchQuery('functools'), 140);
  assert.ok(snippet.length <= 140);
  assert.match(snippet, /import functools/);
});
