import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

// One account-scoped read per opened lesson, shared by all group members.
export function useLessonPaymentSenders(teacherId, enabled) {
  const [snapshot, setSnapshot] = useState({ teacherId: '', status: 'loading', links: [] });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => {
    setSnapshot({ teacherId, status: 'loading', links: [] });
    setRevision(value => value + 1);
  }, [teacherId]);
  useEffect(() => {
    if (!teacherId || !enabled) return undefined;
    let cancelled = false;
    api.getPaymentSenderLinks(teacherId).then(data => {
      if (!cancelled) setSnapshot({ teacherId, status: 'ready', links: Array.isArray(data?.links) ? data.links : [] });
    }).catch(() => {
      if (!cancelled) setSnapshot({ teacherId, status: 'error', links: [] });
    });
    return () => { cancelled = true; };
  }, [teacherId, enabled, revision]);
  return { ...(snapshot.teacherId === teacherId ? snapshot : { status: 'loading', links: [] }), retry };
}
