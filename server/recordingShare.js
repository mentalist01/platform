// Signalling only: the selected display track travels directly between browsers
// on the teacher's PC. No frames, audio, cookies or device tokens cross this API.
export function createRecordingShareRelay({ now = Date.now, allowed }) {
  const sessions = new Map();
  const fail = () => { throw Object.assign(new Error('Демонстрация для этой записи недоступна'), { status: 409 }); };
  const get = (teacherId) => {
    const entry = sessions.get(teacherId);
    if (entry && (entry.expiresAt <= now() || !allowed(teacherId, entry.jobId))) sessions.delete(teacherId);
    return sessions.get(teacherId);
  };
  const description = (value, type) => {
    if (value?.type !== type || typeof value.sdp !== 'string' || value.sdp.length > 64000 || !value.sdp.startsWith('v=0')) fail();
    return { type, sdp: value.sdp };
  };
  return {
    teacher(teacherId, payload) {
      const current = get(teacherId);
      if (payload.action === 'stop') {
        if (current?.id === payload.id) sessions.delete(teacherId);
        return {};
      }
      if (payload.action === 'offer') {
        if (!/^[a-f0-9-]{36}$/i.test(payload.id || '') || !allowed(teacherId, payload.jobId)) fail();
        const offer = description(payload.offer, 'offer');
        if (current?.id !== payload.id) sessions.set(teacherId, { id: payload.id, jobId: payload.jobId, offer, expiresAt: now() + 45000 });
      }
      const entry = get(teacherId);
      if (entry?.id !== payload.id) return { expired: true };
      entry.expiresAt = now() + 45000;
      return { answer: entry.answer || null };
    },
    device(teacherId, payload) {
      const entry = get(teacherId);
      if (payload.answer) {
        if (!entry || entry.id !== payload.id) fail();
        entry.answer = description(payload.answer, 'answer');
      }
      return entry ? { id: entry.id, jobId: entry.jobId, offer: entry.offer } : null;
    },
  };
}
