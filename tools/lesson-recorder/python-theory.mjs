import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ownedRecording} from './storage.mjs';
import {pythonSources} from './python-source-map.mjs';
import { pythonCaptureConfig, pythonCaptureReason } from './python-capture.mjs';
import { createTimeline } from './python-timeline.mjs';

export async function startPythonTheory({ api, engine, payload, captureConfig, now = Date.now }) {
  if (engine.active()) throw new Error('Сначала завершите текущую запись');
  const catalog = await api('/python/catalog', {});
  const task = catalog.tasks.find(t => t.number === Number(payload.taskNumber));
  const section = task?.subsections.find(s => s.id === payload.subsectionId);
  if (!section) throw new Error('Обновите список и выберите тему и подраздел');
  if (section.existingUrl !== payload.expectedUrl) throw new Error('Материал изменился. Обновите список тем перед записью.');
  if (section.existingUrl && payload.replaceExisting !== true) throw new Error('Подтвердите замену существующего видео');
  const title = String(payload.title || '').trim();
  if (!title || title.length > 100) throw new Error('Укажите название длиной до 100 символов');
  const selected = pythonCaptureConfig(captureConfig);
  const reason = pythonCaptureReason(selected);
  if (reason) throw new Error(reason);
  const id = crypto.randomUUID();
  await engine.start({ id, title, local: true, manual: true, autoPublish: true, audioMode: 'teacher',
    captureProfile: 'python', captureConfig: selected,
    pythonTimeline: createTimeline(),
    cutoffAt: now() + 3 * 60 * 60_000,
    pythonTheory: { teacherId: catalog.teacherId, taskNumber: task.number, subsectionId: section.id,
      taskTitle: task.title, subsectionTitle: section.title, expectedUrl: section.existingUrl,
      replaceExisting: payload.replaceExisting === true },
  });
  return id;
}

export async function continuePythonTheory({engine,payload,captureConfig,now=Date.now}) {
  if (engine.active()) throw Error('Сначала завершите текущую запись');
  const parent=engine.state.jobs[payload.id];
  if (!parent?.pythonTheory || parent.pythonArchivedAt || parent.status!=='saved' || parent.pythonTimeline?.approved || !parent.pythonTimeline?.finalized) throw Error('Выберите сохранённый черновик Python, который ещё не отправлен');
  if (parent.pythonTimeline.revision!==payload.revision) throw Error('Монтаж изменился. Обновите черновик');
  if (Object.values(engine.state.jobs).some(job=>job.pythonContinuedFrom===parent.id && (job.status!=='error'||job.file))) throw Error('У черновика уже есть продолжение. Выберите последнюю запись этого проекта');
  const previousSources=pythonSources(parent).map(source=>{
    const file=ownedRecording(path.dirname(source.file||parent.file),source.id,source.file||parent.file);
    if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error('Не найден исходник одной из частей. Продолжение не начато, монтаж сохранён.');
    return {...source,file};
  });
  const selected=pythonCaptureConfig(captureConfig),reason=pythonCaptureReason(selected);if(reason)throw Error(reason);
  const timeline=structuredClone(parent.pythonTimeline),offset=timeline.sourceEnd;
  timeline.finalized=false;timeline.openStart=offset;timeline.revision++;delete timeline.pendingTailStart;
  const id=crypto.randomUUID();
  await engine.start({id,title:parent.title,local:true,manual:true,autoPublish:true,audioMode:'teacher',captureProfile:'python',captureConfig:selected,
    pythonTheory:structuredClone(parent.pythonTheory),pythonTimeline:timeline,pythonCaptureOffset:offset,pythonPreviousSources:previousSources,
    pythonProjectId:parent.pythonProjectId||parent.id,pythonContinuedFrom:parent.id,pythonDraftName:parent.pythonDraftName||'',cutoffAt:now()+3*60*60_000});
  return id;
}

export async function publishPythonTheory(job, { api, ready, save }) {
  if (!await ready(job.url)) { job.status = 'processing'; save(); return; }
  const material = await api('/python/material', { ...job.pythonTheory,
    recordingId: job.id, title: job.title, url: job.url });
  job.pythonMaterial = material; job.status = 'ready'; job.error = ''; save();
}
