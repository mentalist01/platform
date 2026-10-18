import { apiFetch, getStoredAuthToken, parseApiError } from './api.js';

export function createStudentContactService({ listRoute, itemRoute }) {
  let scope = '', contacts = {}, pending = null, loadedAt = 0, revision = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  const resetScope = () => {
    const next = getStoredAuthToken();
    if (scope !== next) { scope = next; contacts = {}; pending = null; loadedAt = 0; revision++; }
    return next;
  };
  const snapshot = studentId => { resetScope(); return contacts[studentId] || null; };
  const all = () => { resetScope(); return contacts; };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  async function load(force = false) {
    const token = resetScope();
    if (pending) return pending;
    if (!force && loadedAt && Date.now() - loadedAt < 30_000) return;
    const requestedRevision = revision;
    const work = (async () => {
      const response = await apiFetch(listRoute);
      if (!response.ok) throw new Error(await parseApiError(response));
      const value = await response.json();
      if (scope !== token || getStoredAuthToken() !== token || requestedRevision !== revision) return;
      contacts = value.contacts || {}; loadedAt = Date.now(); notify();
    })();
    pending = work;
    try { await work; } finally { if (pending === work) pending = null; }
  }
  async function save(studentId, contact) {
    const token = resetScope();
    if (pending) { try { await pending; } catch { /* The write reports its own result. */ } }
    if (getStoredAuthToken() !== token) throw new Error('Аккаунт изменился. Откройте контакт заново.');
    const response = await apiFetch(itemRoute(studentId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact),
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const value = await response.json();
    if (scope === token && getStoredAuthToken() === token) { revision++; contacts = { ...contacts, [studentId]: value.contact }; notify(); }
    return value.contact;
  }
  return { snapshot, all, subscribe, load, save };
}
