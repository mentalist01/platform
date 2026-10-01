import test from 'node:test';
import assert from 'node:assert/strict';
import {inferLessonTopic,archiveTopicTitle} from './lesson-topic.mjs';
const infer=(...texts)=>inferLessonTopic(texts.map(text=>({text})));
test('explicit task mentions accept ordinals in either order, without arbitrary problem numbers',()=>{
  for(const text of ['Сегодня решаем третье задание.','Сегодня разбираем задание номер 3.','Сегодня изучаем 3 задание.']) assert.deepEqual(infer(text)?.taskNumbers,[3],text);
  assert.deepEqual(infer('Сегодня решаем двадцать седьмое задание.')?.taskNumbers,[27]);
  assert.deepEqual(infer('Задание 16.','Вернёмся к заданию 16.')?.taskNumbers,[16]);
  assert.equal(infer('В ответе получится 16.','Скорость 27, размер 3, один бит.'),null);
  assert.equal(infer('Сегодня решаем задание 123.'),null);
  assert.equal(infer('Однажды упомянули задание 3.'),null);
});
test('extracts the main subject across speech segments and keeps ambiguous chatter untitled',()=>{
  assert.equal(infer('Сегодня разбираем задание 7, кодирование звука.','Частота дискретизации, разрядность и стерео звук.')?.text,'Задание №7 · Кодирование звука');
  assert.equal(infer('Поговорим о базах данных и ключах.','Связи таблиц и запросы.')?.text,'Базы данных');
  assert.equal(infer('Откроем платформу.','Как дела? Всё понятно?'),null);
});
test('a topic label preserves the original lesson title',()=>{
  assert.equal(archiveTopicTitle({recordingTitle:'Анна · 30 сентября',title:'старое',topic:{text:'Задание №3'}}),'Задание №3 · Анна · 30 сентября');
});
