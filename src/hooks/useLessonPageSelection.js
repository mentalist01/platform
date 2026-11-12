import {useCallback,useSyncExternalStore} from 'react';
import {LESSON_PAGE_SELECTION_EVENT,lessonPageSelectionKey,readLessonPageSelection,writeScopedLessonPageSelection} from '../utils/lessonPageSelection.js';
export function useLessonPageSelection(book,role,userId,fallback='main',scope='board') {
  const key=lessonPageSelectionKey(book,role,userId,scope);
  const boardKey=lessonPageSelectionKey(book,role,userId);
  const subscribe=useCallback(listener=>{
    const changed=event=>{if(event.detail?.key===key||event.key===key)listener();};
    window.addEventListener(LESSON_PAGE_SELECTION_EVENT,changed);window.addEventListener('storage',changed);
    return()=>{window.removeEventListener(LESSON_PAGE_SELECTION_EVENT,changed);window.removeEventListener('storage',changed);};
  },[key]);
  const snapshot=useCallback(()=>readLessonPageSelection(key,scope==='code'?readLessonPageSelection(boardKey,fallback):fallback),[key,boardKey,fallback,scope]);
  const pageId=useSyncExternalStore(subscribe,snapshot,snapshot);
  // Ordinary page navigation still opens the paired board and code page.
  // A scoped summon can move one pane without touching the other selection.
  const select=useCallback((value,options={})=>writeScopedLessonPageSelection({book,role,userId,scope,fallback,only:options.only},value),[book,role,userId,scope,fallback]);
  return [pageId,select];
}
