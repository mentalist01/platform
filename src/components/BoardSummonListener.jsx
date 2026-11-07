import { useEffect, useLayoutEffect, useRef } from 'react';
import { loadYjsRuntime } from '../utils/collaborationRuntime.js';
import { getCollabWsUrl } from '../utils/runtimeUrls.js';
import { getStoredAuthToken } from '../services/api.js';
import { boardPageBookRoom, boardPagesList, boardPageSummonTarget } from '../utils/boardPages.js';
import { groupNotebookBoard } from '../utils/groupNotebook.js';
import { requestLessonPages } from '../services/lessonPages.js';
import { observeLiveBoardCommand } from '../utils/boardCommandClock.js';
import { rememberSummonedCode } from '../utils/lessonSummonCode.js';

// Keep the teacher's navigation channel alive while the pupil is in code, chat
// or another section. The canvas itself mounts only when its section opens.
export default function BoardSummonListener({ teacherId, userId, groupId = '', view, onOpenWorkspace }) {
  const current = useRef({ view, onOpenWorkspace });
  useLayoutEffect(() => { current.current = { view, onOpenWorkspace }; }, [view, onOpenWorkspace]);
  const base = groupId ? groupNotebookBoard(groupId) : teacherId && userId ? `board-${teacherId}-${userId}` : '';
  const book = boardPageBookRoom(base);
  useEffect(() => {
    if (!book) return undefined;
    let disposed = false, cleanup;
    const start = async () => {
      const [{ Y, WebsocketProvider }] = await Promise.all([loadYjsRuntime(), requestLessonPages(book).catch(() => null)]);
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
        rememberSummonedCode(target,book,userId);
        const nextView=target.view==='collab'?'collab':'board';
        if (current.current.view!==nextView) current.current.onOpenWorkspace?.(nextView);
      };
      const liveUpdate = () => { if (provider.synced) observeLiveBoardCommand(control.get('summon')); update(); };
      pages.observe(update); control.observe(liveUpdate); provider.on('sync', update);
      cleanup = () => { pages.unobserve(update); control.unobserve(liveUpdate); provider.off('sync', update); provider.destroy(); doc.destroy(); };
      if (disposed) cleanup();
    };
    void start().catch(error => { if (!disposed) console.warn('[board] navigation channel unavailable:', error.message); });
    return () => { disposed = true; cleanup?.(); };
  }, [book, userId]);
  return null;
}
