import {useEffect, useMemo, useState} from 'react';
import {getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';

export function useGroupPracticeDrafts(room) {
  const scope = useMemo(() => ({room}), [room]);
  const [store, setStore] = useState(null);

  useEffect(() => {
    if (!scope.room) return;
    let disposed = false;
    let disconnect;
    void loadYjsRuntime().then(({Y, WebsocketProvider}) => {
      if (disposed) return;
      const doc = new Y.Doc();
      const drafts = doc.getMap('personalPracticeDrafts');
      const provider = new WebsocketProvider(getCollabWsUrl(), scope.room, doc, {
        params: {_auth: getStoredAuthToken()}, disableBc: true, connect: false,
      });
      let initialized = false;
      const setDraft = (key, text) => {
        if (!disposed && drafts.get(key) !== text) drafts.set(key, text);
      };
      const read = () => {
        if (initialized) setStore({scope, entries: new Map(drafts.entries()), setDraft});
      };
      const sync = ready => {
        if (!ready) return;
        initialized = true;
        read();
      };
      drafts.observe(read);
      provider.on('sync', sync);
      disconnect = () => {
        drafts.unobserve(read);
        provider.off('sync', sync);
        provider.destroy();
        doc.destroy();
      };
      provider.connect();
    }).catch(() => {});
    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [scope]);

  return store?.scope === scope ? store : null;
}
