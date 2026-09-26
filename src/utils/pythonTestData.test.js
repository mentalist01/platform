import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTestsFileContent, preparePythonTests } from './pythonTestData.js';

test('save and JSON import preserve spaces and empty final stdin lines', () => {
  const cases = [{ input: 'один\nдва\nтри\n | \n', output: 'один | два | три' }, { input: '1\n2\n3\n\n', output: '123' }];
  assert.deepEqual(preparePythonTests(cases), cases);
  assert.deepEqual(parseTestsFileContent(JSON.stringify(cases)), cases);
  assert.deepEqual(parseTestsFileContent(JSON.stringify({ tests: cases })), cases);
  assert.equal(preparePythonTests([{ input: 'x\r\n \r\n', output: 'x' }])[0].input, 'x\n \n');
});

test('text import retains delimiters, blank lines and trailing spaces', () => {
  const [first, second] = parseTestsFileContent('input:\r\na\r\nb\r\nc\r\n | \r\noutput:\r\na | b | c\r\n---\r\nstdin:\r\n1\r\n2\r\n3\r\n\r\nstdout:\r\n123');
  assert.equal(first.input, 'a\nb\nc\n | \n');
  assert.equal(second.input, '1\n2\n3\n\n');
  assert.equal(second.output, '123');
});

test('alternate JSON field names work; missing input never silently becomes empty', () => {
  assert.deepEqual(parseTestsFileContent('[{"stdin":"a\\nb\\n","expectedOutput":"b"}]'), [{ input: 'a\nb\n', output: 'b' }]);
  assert.deepEqual(parseTestsFileContent('[{"input":"","output":"hello"}]'), [{ input: '', output: 'hello' }]);
  assert.throws(() => parseTestsFileContent('[{"output":"value"}]'), /отсутствует поле input/);
  assert.throws(() => parseTestsFileContent('[{"input":[],"output":"value"}]'), /должно быть строкой/);
  assert.throws(() => parseTestsFileContent('[{"input":"a","stdin":"b","output":"value"}]'), /разные значения/);
  assert.throws(() => parseTestsFileContent('output:\nvalue'), /отсутствует поле input/);
});
