import assert from 'node:assert/strict';
import test from 'node:test';
import { completePrivateVideo } from './rutube.mjs';

const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Test_Key';
function editorFixture({ button = 'Опубликовать', access = 'Только по ссылке', closeError = false } = {}) {
  let clicks = 0; let closed = false; const snapshots = []; const job = { status: 'uploading' };
  const editor = {
    getByRole(role, { name }) {
      if (role === 'combobox') return { innerText: async () => access };
      assert.equal(role, 'button');
      // Rutube can change the footer label after moderation without replacing
      // our locator. Both labels must resolve; unrelated actions must not.
      assert.ok(name.test(button));
      assert.equal(name.test('Удалить'), false);
      return {
        waitFor: async () => {},
        click: async () => { clicks++; closed = !closeError; },
      };
    },
    locator: () => ({ waitFor: async () => {}, getAttribute: async () => url }),
    waitFor: async ({ state }) => { assert.equal(state, 'hidden'); if (!closed) throw Error('Editor still open'); },
  };
  return { editor, job, persist: () => snapshots.push({ ...job }), snapshots, clicks: () => clicks };
}

for (const button of ['Сохранить', 'Опубликовать']) {
  test(`finalizes a private Rutube video through ${button}`, async () => {
    const f = editorFixture({ button });
    assert.equal(await completePrivateVideo(f.editor, f.job, f.persist), url);
    assert.equal(f.clicks(), 1);
    assert.equal(f.snapshots[0].uploadPhase, 'publishing');
    assert.equal(f.snapshots[0].url, undefined);
    assert.equal(f.job.status, 'processing'); assert.equal(f.job.url, url);
  });
}

test('never publishes a video with public access', async () => {
  const f = editorFixture({ access: 'Для всех' });
  await assert.rejects(completePrivateVideo(f.editor, f.job, f.persist), /только по ссылке/);
  assert.equal(f.clicks(), 0); assert.equal(f.job.url, undefined);
});

test('an unconfirmed publication retains a candidate for recovery, without attaching it as complete', async () => {
  const f = editorFixture({ closeError: true });
  await assert.rejects(completePrivateVideo(f.editor, f.job, f.persist), /still open/);
  assert.equal(f.job.url, undefined); assert.equal(f.job.candidateUrl, url);
  assert.equal(f.job.status, 'uploading');
});
