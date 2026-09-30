import { useEffect, useState } from 'react';
import { requestLearningGroupJson } from '../services/api';
import StudentLessonDetailModal from './StudentLessonDetailModal';

const EMPTY_MATERIALS = [];

export default function LearningGroupLessonReplay({ groupId, lessonId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    requestLearningGroupJson(`/api/learning-groups/${encodeURIComponent(groupId)}/lessons/${encodeURIComponent(lessonId)}/replay`)
      .then(result => { if (alive) setData(result); })
      .catch(cause => { if (alive) setError(cause.message || 'Не удалось открыть запись занятия'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [groupId, lessonId, retry]);
  return <StudentLessonDetailModal open lesson={data?.lesson} replay={data?.replay} materials={EMPTY_MATERIALS}
    topicText={data?.lesson?.topic} loading={loading} error={error} onClose={onClose} onRetry={() => {
      setLoading(true); setError(''); setData(null); setRetry(n => n + 1);
    }} />;
}
