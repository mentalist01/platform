import test from 'node:test';
import assert from 'node:assert/strict';
import { getPythonVideoMaterials } from './pythonVideoMaterials.js';

test('Python video picker includes subsection and legacy Rutube links without losing private keys', () => {
  const tasks = [{ number: 101, title: 'Input' }, { number: 102, title: 'Variables' }];
  const videos = getPythonVideoMaterials(tasks, {
    101: { pythonSubsections: [{ id: 'intro', title: 'Introduction' }], pythonTheoryBySubsection: {
      intro: { rutube: { type: 'rutube', content: 'https://rutube.ru/video/private/abc123/?p=private_key' }, text: { type: 'text', content: 'Text' } },
      invalid: { rutube: { type: 'rutube', content: 'https://example.com/video' } },
    } },
    102: { pythonTheory: { type: 'rutube', content: 'https://rutube.ru/video/def456/' } },
  });
  assert.equal(videos.length, 2);
  assert.equal(videos[0].title, 'Input · Introduction');
  assert.equal(videos[0].url, 'https://rutube.ru/play/embed/abc123/?p=private_key');
  assert.equal(videos[1].url, 'https://rutube.ru/play/embed/def456');
});
