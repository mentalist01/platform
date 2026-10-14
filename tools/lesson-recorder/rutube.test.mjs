import assert from 'node:assert/strict';
import test from 'node:test';
import { completePrivateVideo, configureUploadEditor, ensurePrivateAccess, isCurrentUploadEditor, RUTUBE_UPLOAD_WAIT_MS } from './rutube.mjs';

const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Test_Key';

test('upload does not edit transient title or privacy controls before Rutube registers the transferred file', async () => {
  let release,edited=false,accessChecked=false;
  const registered=new Promise(resolve=>{release=resolve;});
  const editor={locator:selector=>{assert.equal(selector,'a[href*="rutube.ru/video/"]');return{waitFor:async({timeout})=>{assert.equal(timeout,RUTUBE_UPLOAD_WAIT_MS);await registered;}};},
    getByRole:role=>role==='textbox'?{fill:async title=>{assert.equal(title,'Lesson');edited=true;}}:{innerText:async()=>{accessChecked=true;return 'Только по ссылке';}}};
  const job={},configure=configureUploadEditor({},editor,job,'Lesson',()=>{});
  assert.equal(job.uploadPhase,'waiting-upload');assert.equal(edited,false);assert.equal(accessChecked,false);
  release();await configure;assert.equal(edited,true);assert.equal(accessChecked,true);
});

test('private access selects an actual menu option instead of duplicate card labels and confirms the result', async () => {
  let mode='Для всех',clicked=0;
  const access={innerText:async()=>mode,click:async()=>{},press:async()=>{}};
  const page={getByRole:(role,options)=>{assert.equal(role,'option');assert.equal(options.name,'Только по ссылке');assert.equal(options.exact,true);
    return{filter:()=>({click:async()=>{clicked++;mode='Только по ссылке';}})};}};
  const editor={getByRole:()=>access};await ensurePrivateAccess(page,editor);await ensurePrivateAccess(page,editor);assert.equal(clicked,1);
  mode='Для всех';page.getByRole=()=>({filter:()=>({click:async()=>{}})});
  await assert.rejects(ensurePrivateAccess(page,editor),/Видео не опубликовано/);
});
test('late private defaults can close the menu, but an unresolved public default still stops publication', async () => {
  let mode='Для всех',escaped=false;
  const access={innerText:async()=>mode,click:async()=>{mode='Только по ссылке';},press:async key=>{assert.equal(key,'Escape');escaped=true;}};
  const page={getByRole:()=>({filter:()=>({click:async()=>{throw Error('Menu closed');}})})};
  await ensurePrivateAccess(page,{getByRole:()=>access});assert.equal(escaped,true);
  mode='Для всех';access.click=async()=>{};await assert.rejects(ensurePrivateAccess(page,{getByRole:()=>access}),/Menu closed/);
});

test('theory publishes the exact user title only after retaining its private recovery link', async () => {
  const f = editorFixture(); f.job.autoPublish = true; f.job.title = 'Задание 7: звук';
  const role = f.editor.getByRole.bind(f.editor); let title = '';
  f.editor.getByRole = (kind, options) => kind === 'textbox' ? { fill: async value => {
    assert.equal(f.job.candidateUrl, url); title = value;
  } } : role(kind, options);
  await completePrivateVideo(f.editor, f.job, f.persist);
  assert.equal(title, f.job.title); assert.equal(f.job.url, url);
});

test('a retry cannot publish a different video with a coincident title', async () => {
  const f = editorFixture(); f.job.autoPublish = true; f.job.title = 'Theory';
  f.job.candidateUrl = 'https://rutube.ru/video/private/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/?p=Test_Key';
  await assert.rejects(completePrivateVideo(f.editor, f.job, f.persist), /другой ролик/);
  assert.equal(f.clicks(), 0); assert.equal(f.job.url, undefined);
});
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
