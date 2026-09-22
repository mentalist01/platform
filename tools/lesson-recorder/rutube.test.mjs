import assert from 'node:assert/strict';
import test from 'node:test';
import { completePrivateVideo, isCurrentUploadEditor, RUTUBE_UPLOAD_WAIT_MS } from './rutube.mjs';

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
        waitFor: async ({ timeout }) => { assert.equal(timeout, RUTUBE_UPLOAD_WAIT_MS); },
        click: async ({ timeout }) => { assert.equal(timeout, RUTUBE_UPLOAD_WAIT_MS); clicks++; closed = !closeError; },
      };
    },
    locator: () => ({ waitFor: async ({ timeout }) => { assert.equal(timeout, RUTUBE_UPLOAD_WAIT_MS); }, getAttribute: async () => url }),
    waitFor: async ({ state }) => { assert.equal(state, 'hidden'); if (!closed) throw Error('Editor still open'); },
  };
  return { editor, job, persist: () => snapshots.push({ ...job }), snapshots, clicks: () => clicks };
}

for (const button of ['Сохранить', 'Опубликовать']) {
  test(`finalizes a private Rutube video through ${button}`, async () => {
    const f = editorFixture({ button });
    assert.equal(await completePrivateVideo(f.editor, f.job, f.persist), url);
    assert.equal(f.clicks(), 1);
    assert.equal(f.snapshots[0].uploadPhase, 'waiting-link');
    assert.equal(f.snapshots[1].uploadPhase, 'publishing');
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

test('large uploads get twelve hours, with a readable timeout and no premature publication', async () => {
  assert.equal(RUTUBE_UPLOAD_WAIT_MS, 12 * 3600_000);
  const f = editorFixture();
  f.editor.locator = () => ({ waitFor: async ({ timeout }) => {
    assert.ok(timeout > 600000); throw Object.assign(Error('raw locator trace'), { name: 'TimeoutError' });
  } });
  await assert.rejects(completePrivateVideo(f.editor, f.job, f.persist), error => /12 часов/.test(error.message) && !error.message.includes('locator'));
  assert.equal(f.clicks(), 0); assert.equal(f.job.url, undefined);
});

test('retry reuses only the matching open editor instead of navigating away from a file transfer', async () => {
  const job = { uploadStarted: true, mp4: 'lesson-id.mp4' };
  const editor = (name, visible = true) => ({ isVisible: async () => visible,
    getByRole: () => ({ inputValue: async () => name }) });
  assert.equal(await isCurrentUploadEditor(editor('Урок [id]'), job, 'Урок [id]'), true);
  assert.equal(await isCurrentUploadEditor(editor('lesson-id'), job, 'Урок [id]'), true);
  assert.equal(await isCurrentUploadEditor(editor('Чужой урок'), job, 'Урок [id]'), false);
  assert.equal(await isCurrentUploadEditor(editor('Урок [id]', false), job, 'Урок [id]'), false);
  assert.equal(await isCurrentUploadEditor(editor('Урок [id]'), { ...job, uploadStarted: false }, 'Урок [id]'), false);
});
