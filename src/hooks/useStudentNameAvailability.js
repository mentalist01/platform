import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function useStudentNameAvailability(name, nickname, teacherId) {
  const key = JSON.stringify([name.trim(), nickname.trim(), teacherId]);
  const [checked, setChecked] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!name.trim() || !teacherId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.studentNameAvailability({ name: name.trim(), nickname: nickname.trim() })
        .then(result => { if (!cancelled) setChecked({ ...result, key }); })
        .catch(error => { if (!cancelled) setChecked({ key, canCreate: false, error: true,
          message: error?.message || 'Не удалось проверить имя. Повторите проверку.' }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [name, nickname, teacherId, key, attempt]);
  const current = checked?.key === key ? checked : null;
  return { ...current, pending: !!name.trim() && !!teacherId && !current,
    canCreate: current?.canCreate === true, retry: () => { setChecked(null); setAttempt(value => value + 1); } };
}
