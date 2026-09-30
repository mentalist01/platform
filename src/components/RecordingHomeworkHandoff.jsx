import { useEffect, useRef, useState } from 'react';
import { Video, X } from 'lucide-react';
import { api } from '../services/api';

export default function RecordingHomeworkHandoff({ teacherId, students, selectedStudent, onSelectStudent, onOpen }) {
  const [request] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { materialId: params.get('homeworkRecording') || '', studentId: params.get('homeworkStudent') || '' };
  });
  const [material, setMaterial] = useState(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [opening, setOpening] = useState(false);
  const recipientApplied = useRef(false);
  useEffect(() => {
    if (!request.materialId) return;
    let cancelled = false;
    setMaterial(null); setError('');
    api.getLearningMaterials({ teacherId }).then(result => {
      const found = result.materials?.find(entry => entry.id === request.materialId && entry.kind === 'video');
      if (!cancelled) { setMaterial(found || null); if (!found) setError('Запись недоступна этому аккаунту или удалена.'); }
    }).catch(e => { if (!cancelled) setError(e?.message || 'Не удалось загрузить запись.'); });
    return () => { cancelled = true; };
  }, [request.materialId, teacherId]);
  useEffect(() => {
    if (!recipientApplied.current && request.studentId && students.some(student => student.id === request.studentId)) {
      recipientApplied.current = true; onSelectStudent?.(request.studentId);
    }
  }, [request.studentId, students, onSelectStudent]);
  const dismiss = () => {
    const url = new URL(window.location.href); url.searchParams.delete('homeworkRecording'); url.searchParams.delete('homeworkStudent');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash); setDismissed(true);
  };
  if (!request.materialId || dismissed) return null;
  return <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4" role="region" aria-label="Запись из пульта для домашки">
    <div className="flex items-start gap-3"><Video size={20} className="shrink-0 text-violet-600" /><div className="min-w-0 flex-1">
      <strong className="text-sm text-violet-900">{material?.title || 'Готовим запись для домашки…'}</strong>
      <p className="mt-1 text-xs text-slate-600">Выберите ученика в списке выше. Запись добавится в обычную форму домашки; срок и другие задания можно будет изменить.</p>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      <button type="button" disabled={!material || !selectedStudent || opening} onClick={async () => {
        setOpening(true); try { if (await onOpen(material)) dismiss(); } catch (e) { setError(e?.message || 'Не удалось открыть домашку.'); } finally { setOpening(false); }
      }} className="mt-3 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
        {opening ? 'Открываем…' : `Добавить в домашку${selectedStudent ? ` · ${selectedStudent.nickname || selectedStudent.name}` : ''}`}
      </button>
    </div><button type="button" onClick={dismiss} aria-label="Закрыть назначение записи"><X size={16} /></button></div>
  </div>;
}
