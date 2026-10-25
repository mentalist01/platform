import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {studyCache,loadStudyProgress} from '../services/studentStudyProgress.js';
const empty={records:{},plan:null,loading:false,error:''};
export default function useStudentStudyProgress(teacherId) {
  const subscribe=useCallback(listener=>{
    if(!teacherId)return()=>{};
    const cache=studyCache(teacherId);cache.listeners.add(listener);
    if(cache.listeners.size===1){cache.refresh=()=>{if(document.visibilityState!=='hidden')void loadStudyProgress(teacherId);};window.addEventListener('focus',cache.refresh);window.addEventListener('online',cache.refresh);document.addEventListener('visibilitychange',cache.refresh);}
    void loadStudyProgress(teacherId);
    return()=>{cache.listeners.delete(listener);if(!cache.listeners.size){window.removeEventListener('focus',cache.refresh);window.removeEventListener('online',cache.refresh);document.removeEventListener('visibilitychange',cache.refresh);}};
  },[teacherId]);
  const snapshot=useCallback(()=>teacherId?studyCache(teacherId).state:empty,[teacherId]);
  const state=useSyncExternalStore(subscribe,snapshot,snapshot);
  useEffect(()=>{if(teacherId)void loadStudyProgress(teacherId);},[teacherId]);
  return state;
}
