import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoChapters, chaptersToText, videoChapterMetadata, normalizeVideoChapters } from './videoChapters.js';
test('manual and AI chapter text handles long videos, bullets and readable titles', () => {
  const chapters = parseVideoChapters('00:00 Начало\n- [02:15] — range()\n01:05:30 Разбор задачи');
  assert.deepEqual(chapters, [{time:0,title:'Начало'},{time:135,title:'range()'},{time:3930,title:'Разбор задачи'}]);
  assert.deepEqual(parseVideoChapters(chaptersToText(chapters)),chapters);
  assert.deepEqual(videoChapterMetadata({chapters}).chapters,chapters);
});
test('bad times, duplicate and reversed chapters cannot be silently saved', () => {
  for (const text of ['02:60 Ошибка','01:70:20 Ошибка','00:00 Первый\n00:00 Второй','02:00 Второй\n01:00 Первый','02:00','Просто текст']) assert.throws(()=>parseVideoChapters(text));
  assert.deepEqual(parseVideoChapters(''),[]);
  assert.deepEqual(normalizeVideoChapters([{time:-1,title:'bad'}]),[]);
  assert.deepEqual(normalizeVideoChapters([{time:1.5,title:'bad'}]),[]);
  assert.deepEqual(videoChapterMetadata({type:'rutube',content:'legacy'}),{});
});
