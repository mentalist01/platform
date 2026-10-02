import { getStoredAuthToken, parseApiError } from './api';
import { resolveApiUrl } from '../utils/runtimeUrls';

const request = async (path, { body, token, guest = false, signal } = {}) => {
  const authToken = guest ? token : getStoredAuthToken();
  const response = await fetch(resolveApiUrl(path), {
    method: body === undefined ? 'GET' : 'POST',
    credentials: guest ? 'omit' : 'include', cache: 'no-store', signal,
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw Object.assign(new Error(await parseApiError(response)), { status: response.status });
  return response.json();
};

export const guestMeetingsApi = {
  list: () => request('/api/teacher-meetings'),
  create: (title) => request('/api/teacher-meetings', { body: { title } }),
  control: (id, action, guestId) => request(`/api/teacher-meetings/${encodeURIComponent(id)}/control`, { body: { action, guestId } }),
  info: (id) => request(`/api/guest-meetings/${encodeURIComponent(id)}`, { guest: true }),
  join: (id, data) => request(`/api/guest-meetings/${encodeURIComponent(id)}/join`, { guest: true, body: data }),
  presence: (id, options) => request(`/api/guest-meetings/${encodeURIComponent(id)}/presence`, options),
  publicConfig: () => request('/api/public-meetings/config', { guest: true }),
  createPublic: (name, title) => request('/api/public-meetings', { guest: true, body: { name, title } }),
  controlPublic: (id, token, action, guestId) => request(`/api/public-meetings/${encodeURIComponent(id)}/control`, { guest: true, token, body: { action, guestId } }),
};

export const meetingStorageKey = (id) => `ivan100-guest-meeting:${id}`;
export const rememberMeeting = (identity) => {
  try { sessionStorage.setItem(meetingStorageKey(identity.meeting.id), JSON.stringify({ token: identity.token })); }
  catch { /* The current call also works without browser storage. */ }
};

export const guestMeetingLink = (id) => {
  const url = new URL('/', window.location.href);
  url.searchParams.set('meeting', id);
  return url.toString();
};
