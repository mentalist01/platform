import {useCallback,useSyncExternalStore} from 'react';
import {LESSON_PAGE_SELECTION_EVENT,lessonPageSelectionKey,readLessonPageSelection,writeLessonPageSelection} from '../utils/lessonPageSelection.js';
export function useLessonPageSelection(book,role,userId,fallback='main') {
  const key=lessonPageSelectionKey(book,role,userId);
  const subscribe=useCallback(listener=>{
    const changed=event=>{if(event.detail?.key===key||event.key===key)listener();};
    window.addEventListener(LESSON_PAGE_SELECTION_EVENT,changed);window.addEventListener('storage',changed);
    return()=>{window.removeEventListener(LESSON_PAGE_SELECTION_EVENT,changed);window.removeEventListener('storage',changed);};
  },[key]);
  const snapshot=useCallback(()=>readLessonPageSelection(key,fallback),[key,fallback]);
  const pageId=useSyncExternalStore(subscribe,snapshot,snapshot);
  const select=useCallback(value=>writeLessonPageSelection(key,value),[key]);
  return [pageId,select];
}
