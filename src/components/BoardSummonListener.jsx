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
      const handled = new Set();
      const update = () => {
        if (disposed || !provider.synced) return;
        const commands=[control.get('summon'),control.get('summonCode')].filter(Boolean).sort((a,b)=>a.ts-b.ts);
        for(const command of commands){
          const target = boardPageSummonTarget(command, userId, boardPagesList(pages));
          if (!target || handled.has(target.id)) continue;
          handled.add(target.id);
          rememberSummonedCode(target,book,userId);
          const nextView=target.scope==='board'?'board':target.view==='collab'?'collab':'board';
          if (current.current.view!==nextView) current.current.onOpenWorkspace?.(nextView);
        }
      };
      const liveUpdate = event => { if (provider.synced){for(const key of ['summon','summonCode'])if(event.keysChanged.has(key))observeLiveBoardCommand(control.get(key));} update(); };
      pages.observe(update); control.observe(liveUpdate); provider.on('sync', update);
      cleanup = () => { pages.unobserve(update); control.unobserve(liveUpdate); provider.off('sync', update); provider.destroy(); doc.destroy(); };
      if (disposed) cleanup();
    };
    void start().catch(error => { if (!disposed) console.warn('[board] navigation channel unavailable:', error.message); });
    return () => { disposed = true; cleanup?.(); };
  }, [book, userId]);
  return null;
}
