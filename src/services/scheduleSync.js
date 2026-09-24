import { getStoredAuthToken, resolveAuthenticatedApiUrl } from './api.js';
import { createScheduleSyncChannel } from '../utils/scheduleSyncChannel.js';

export const subscribeScheduleSync = createScheduleSyncChannel({
  getConnection: () => {
    const url = resolveAuthenticatedApiUrl('/api/schedule-sync/stream');
    return { url, key: JSON.stringify([url, getStoredAuthToken()]) };
  },
  createSource: (url) => typeof EventSource === 'function'
    ? new EventSource(url, { withCredentials: true })
    : null,
});
