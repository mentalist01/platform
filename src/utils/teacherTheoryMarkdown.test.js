import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherTheoryMarkdown} from './teacherTheoryMarkdown.js';
import {sanitizeTeacherTheory} from '../../server/preparedTeacherTheory.js';
test('ChatGPT plain-text copies render headings, emphasis, lists, tables and code',()=>{
  const html=sanitizeTeacherTheory(teacherTheoryMarkdown('## Тема\n\n**Важно** и *пример*\n\n1. Первый\n2. Второй\n\n```python\nprint(1 < 2)\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'));
  for(const fragment of ['<h2>Тема</h2>','<strong>Важно</strong>','<em>пример</em>','<ol>','<table>','print(1 &lt; 2)'])assert.ok(html.includes(fragment),fragment);
  assert.doesNotMatch(sanitizeTeacherTheory(teacherTheoryMarkdown('<img src="https://evil.test/a" onerror="bad()">')) ,/<img/);
});
