// Reuse the account's notification WebSocket. Unlike HTTP event streams it
// cannot occupy the browser's last HTTP connection and block the stop request.
export function createLessonAlarmAccountSync({ timeoutMs = 3000 } = {}) {
  const listeners = new Map(), latest = new Map();
  let connection;
  let sequence = 0;
  const pending = new Map();
  const receive = (teacherId, alarm) => {
    if (!Number.isSafeInteger(alarm?.stoppedAtMs) || alarm.stoppedAtMs < 0) return;
    if (alarm.stoppedAtMs < (latest.get(teacherId)?.stoppedAtMs || 0)) return;
    latest.set(teacherId, alarm);
    for (const listener of listeners.get(teacherId) || []) listener(alarm);
  };
  return {
    attach(socket, teacherId) {
      connection?.detach();
      const onMessage = event => {
        let payload;
        try { payload = JSON.parse(String(event.data)); } catch { return; }
        if (payload?.type !== 'lesson-alarm-state' || payload.teacherId !== teacherId) return;
        receive(teacherId, payload.alarm);
        const request = pending.get(payload.requestId);
        if (request?.socket !== socket) return;
        pending.delete(payload.requestId); clearTimeout(request.timer);
        if (payload.error) request.reject(new Error(payload.error));
        else request.resolve(payload.alarm);
      };
      const detach = () => {
        socket.removeEventListener('message', onMessage);
        socket.removeEventListener('close', detach);
        for (const [id, request] of pending) if (request.socket === socket) {
          pending.delete(id); clearTimeout(request.timer); request.reject(new Error('Alarm connection closed'));
        }
        if (connection?.socket === socket) connection = null;
      };
      connection = { socket, teacherId, detach };
      socket.addEventListener('message', onMessage);
      socket.addEventListener('close', detach);
      return detach;
    },
    subscribe(teacherId, listener) {
      if (!listeners.has(teacherId)) listeners.set(teacherId, new Set());
      listeners.get(teacherId).add(listener);
      if (latest.has(teacherId)) listener(latest.get(teacherId));
      return () => {
        const entries = listeners.get(teacherId);
        entries?.delete(listener);
        if (!entries?.size) listeners.delete(teacherId);
      };
    },
    stop(teacherId, stoppedAtMs) {
      const socket = connection?.teacherId === teacherId && connection.socket;
      if (!socket || socket.readyState !== 1) return Promise.reject(new Error('Alarm connection unavailable'));
      const requestId = `alarm-${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Alarm confirmation timed out')); }, timeoutMs);
        pending.set(requestId, { socket, resolve, reject, timer });
        try { socket.send(JSON.stringify({ type: 'lesson-alarm-stop', requestId, stoppedAtMs })); }
        catch (error) { pending.delete(requestId); clearTimeout(timer); reject(error); }
      });
    },
  };
}
