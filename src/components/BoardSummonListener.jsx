import { useEffect, useLayoutEffect, useRef } from 'react';
import { loadYjsRuntime } from '../utils/collaborationRuntime.js';
import { getCollabWsUrl } from '../utils/runtimeUrls.js';
import { getStoredAuthToken } from '../services/api.js';
import { boardPageBookRoom, boardPagesList, boardPageSummonTarget } from '../utils/boardPages.js';
import { groupNotebookBoard } from '../utils/groupNotebook.js';

// Keep the teacher's navigation channel alive while the pupil is in code, chat
// or another section. The canvas itself mounts only when its section opens.
export default function BoardSummonListener({ teacherId, userId, groupId = '', boardVisible, onOpenBoard }) {
  const current = useRef({ boardVisible, onOpenBoard });
  useLayoutEffect(() => { current.current = { boardVisible, onOpenBoard }; }, [boardVisible, onOpenBoard]);
  const base = groupId ? groupNotebookBoard(groupId) : teacherId && userId ? `board-${teacherId}-${userId}` : '';
  const book = boardPageBookRoom(base);
  useEffect(() => {
    if (!book) return undefined;
    let disposed = false, cleanup;
    const start = async () => {
      const { Y, WebsocketProvider } = await loadYjsRuntime();
      if (disposed) return;
      const doc = new Y.Doc(), provider = new WebsocketProvider(getCollabWsUrl(), book, doc,
        { params: { _auth: getStoredAuthToken() || '' }, disableBc: true });
      const pages = doc.getMap('pages'), control = doc.getMap('pageControl');
      let handled = '';
      const update = () => {
        if (disposed || !provider.synced) return;
        const target = boardPageSummonTarget(control.get('summon'), userId, boardPagesList(pages));
        if (!target || target.id === handled) return;
        handled = target.id;
        if (!current.current.boardVisible) current.current.onOpenBoard?.();
      };
      pages.observe(update); control.observe(update); provider.on('sync', update);
      cleanup = () => { pages.unobserve(update); control.unobserve(update); provider.off('sync', update); provider.destroy(); doc.destroy(); };
      if (disposed) cleanup();
    };
    void start().catch(error => { if (!disposed) console.warn('[board] navigation channel unavailable:', error.message); });
    return () => { disposed = true; cleanup?.(); };
  }, [book, userId]);
  return null;
}
