import { useEffect, useState } from 'react';
import { loadParentContacts, parentContactsSnapshot, subscribeParentContacts } from '../services/studentParentContacts';

export default function useStudentParentContacts(scopeKey) {
  const [state, setState] = useState(() => ({ scopeKey, contacts: parentContactsSnapshot(), loading: true, error: '' }));
  useEffect(() => {
    let disposed = false;
    const update = () => {
      if (!disposed) setState(previous => ({ ...previous, scopeKey, contacts: parentContactsSnapshot() }));
    };
    const refresh = async () => {
      try {
        await loadParentContacts();
        if (!disposed) setState({ scopeKey, contacts: parentContactsSnapshot(), loading: false, error: '' });
      } catch (failure) {
        if (!disposed) setState({ scopeKey, contacts: parentContactsSnapshot(), loading: false, error: failure.message });
      }
    };
    const unsubscribe = subscribeParentContacts(update);
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { disposed = true; unsubscribe(); window.removeEventListener('focus', refresh); };
  }, [scopeKey]);
  return state.scopeKey === scopeKey ? state : { contacts: {}, loading: true, error: '' };
}
