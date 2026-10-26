import {getStoredAuthToken,parseApiError} from './api.js';
import {resolveApiUrl} from '../utils/runtimeUrls.js';
import {lessonPageSelectionKey,writeLessonPageSelection} from '../utils/lessonPageSelection.js';
import {studySubjectGroup,studySubjectBoard} from '../utils/studySubjects.js';
import {boardPageRoom} from '../utils/boardPages.js';
import {selectPreparedLessonCard} from '../hooks/usePreparedLesson.js';

export const STUDY_CONTINUE_EVENT='platform:study-continue';
const caches=new Map();
const empty={records:{},plan:null,loading:false,error:''};
export function studyCache(teacherId) {
  if(!caches.has(teacherId))caches.set(teacherId,{state:empty,listeners:new Set(),pending:null,loadedAt:0,queue:Promise.resolve()});
  return caches.get(teacherId);
}
function publish(cache,patch){cache.state={...cache.state,...patch};cache.listeners.forEach(listener=>listener());}
async function request(id='',input) {
  const groupId=studySubjectGroup(id),endpoint=groupId?'group-study-progress':'student-study-progress',subjectId=groupId||id;
  const response=await fetch(resolveApiUrl(`/api/${endpoint}${subjectId?`/${encodeURIComponent(subjectId)}`:''}`),{method:input?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${getStoredAuthToken()}`,...(input?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify(input)}:{})});
  if(!response.ok)throw Error(await parseApiError(response));return response.json();
}
export async function loadStudyProgress(teacherId,force=false) {
  if(!teacherId)return;
  const cache=studyCache(teacherId);
  if(cache.pending)return cache.pending;
  if(!force&&Date.now()-cache.loadedAt<60000)return;
  publish(cache,{loading:true});
  cache.pending=request().then(result=>{
    const records={...result.records};
    for(const [id,current] of Object.entries(cache.state.records))if(records[id]&&current.revision>records[id].revision)records[id]=current;
    cache.loadedAt=Date.now();publish(cache,{records,groups:result.groups||[],plan:result.plan,loading:false,error:''});
  }).catch(error=>publish(cache,{loading:false,error:error.message})).finally(()=>{cache.pending=null;});
  return cache.pending;
}
function accept(teacherId,result){const cache=studyCache(teacherId),record=result.record,previous=cache.state.records[record.studentId];if(!previous||previous.revision<=record.revision)publish(cache,{records:{...cache.state.records,[record.studentId]:record},plan:result.plan,error:''});return result;}
export async function getStudyProgress(teacherId,studentId){return accept(teacherId,await request(studentId));}
export function changeStudyProgress(teacherId,studentId,input) {
  const cache=studyCache(teacherId);
  const result=cache.queue.catch(()=>{}).then(async()=>{
    if(!cache.state.records[studentId])await getStudyProgress(teacherId,studentId);
    try{return accept(teacherId,await request(studentId,{...input,revision:cache.state.records[studentId].revision}));}
    catch(error){await getStudyProgress(teacherId,studentId).catch(()=>{});throw error;}
  });cache.queue=result;return result;
}
export async function continueStudentStudy(teacherId,studentId) {
  const {record}=await getStudyProgress(teacherId,studentId),current=record.current;
  if(!current)throw Error('Сначала отметьте текущую тему ученика в плане или на доске.');
  if(current.pageMissing)throw Error('Текущая страница убрана. Откройте план и свяжите тему с другой страницей.');
  const base=studySubjectBoard(teacherId,studentId),room=boardPageRoom(base,current.pageId);
  if(current.cardId&&selectPreparedLessonCard(room,current.cardId)===false)throw Error('Дождитесь завершения запуска кода, затем нажмите «Продолжить» ещё раз.');
  writeLessonPageSelection(lessonPageSelectionKey(base+'~pages','teacher',teacherId),current.pageId);
  window.dispatchEvent(new CustomEvent(STUDY_CONTINUE_EVENT,{detail:{studentId,...(record.groupId?{groupId:record.groupId}:{}),pageId:current.pageId}}));
}
