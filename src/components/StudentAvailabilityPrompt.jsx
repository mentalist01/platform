import { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { subscribeScheduleSync } from '../services/scheduleSync.js';

export default function StudentAvailabilityPrompt({ userId, onOpen, visible = true, onPromptChange, transport = api.studentAvailabilityPrompt }) {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    let alive = true, loading = false;
    const install = value => { setPrompt(value); onPromptChange?.({ userId, prompt: value }); };
    install(null);
    const refresh = async () => {
      if (loading || document.hidden) return;
      loading = true;
      try { const result = await transport(); if (alive) install(result.prompt || null); }
      catch { if (alive) install(null); }
      finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('learning-groups-changed', refresh);
    const unsubscribe = subscribeScheduleSync(event => {
      try { if (['student-availability', 'group-availability', 'learning-group'].includes(JSON.parse(event.data)?.scope)) void refresh(); } catch { /* Malformed stream message. */ }
    });
    return () => { alive = false; clearInterval(timer); unsubscribe(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('learning-groups-changed', refresh); };
  }, [userId, transport, onPromptChange]);
  if (!visible || !prompt) return null;
  const title = prompt.kind === 'personal' ? 'Свободное время для будущей группы'
    : prompt.needsVote ? 'Ответьте на предложение времени занятий'
      : prompt.answered ? 'В группе открыт подбор времени' : 'Выберите время занятий с группой';
  const description = prompt.kind === 'personal' ? 'Преподаватель подбирает вам группу. Заполните анкету; индивидуальные занятия продолжаются.'
    : prompt.answered && !prompt.needsVote ? `${prompt.groupName}: ваши отметки сохранены. Здесь можно проверить или изменить их.`
      : `${prompt.groupName}: отметьте удобные часы и ответьте на предложение преподавателя.`;
  return <button type="button" onClick={() => onOpen(prompt)} className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 text-left text-violet-900">
    <CalendarDays size={24} className="shrink-0 text-violet-600" /><span className="flex-1"><strong className="block">{title}</strong><span className="text-sm">{description}</span></span><ChevronRight size={20} />
  </button>;
}
