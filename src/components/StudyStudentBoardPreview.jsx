import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,Map,X} from 'lucide-react';
import {getStudyProgress} from '../services/studentStudyProgress.js';
import {studyPreviewPage,studyStudentLabel} from '../utils/studyStudentSearch.js';

export default function StudyStudentBoardPreview({teacherId,student,renderBoard,onClose,onMark}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[pageId,setPageId]=useState('');
  const root=useRef(null),close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{let alive=true;void getStudyProgress(teacherId,student.id).then(result=>{if(alive){setData(result);setPageId(studyPreviewPage(result,teacherId,student.id));}}).catch(cause=>{if(alive)setError(cause.message);});return()=>{alive=false;};},[teacherId,student.id,retry]);
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';root.current?.focus();
    const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}if(event.key==='Tab'){
      const nodes=[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(node=>node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);if(!first)return;
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }};root.current?.addEventListener('keydown',key);const node=root.current;return()=>{node?.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return createPortal(<div className="study-board-backdrop"><section ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Доска ${student.kind==='group'?'группы':'ученика'}: ${studyStudentLabel(student)}`} className="study-board-preview">
    <header><button type="button" className="study-board-back" onClick={onClose}><ArrowLeft size={17}/>К плану</button><div><strong>{studyStudentLabel(student)}</strong><small>Просмотр доски · выберите нужную страницу</small></div><button type="button" className="study-plan__primary" disabled={!data||!pageId} onClick={()=>onMark(pageId)}><Map size={16}/>Закрыть и отметить тему</button><button type="button" aria-label="Закрыть доску и вернуться к плану" onClick={onClose}><X size={21}/></button></header>
    <div className="study-board-preview__canvas">{data?renderBoard({studentId:student.id,groupId:student.groupId,participantIds:student.participantIds,initialPageId:studyPreviewPage(data,teacherId,student.id),onPageChange:setPageId}):<div className="study-board-preview__loading" role="status">{error?<><p role="alert">{error}</p><button onClick={()=>{setError('');setRetry(value=>value+1);}}>Повторить</button></>:'Открываем доску ученика…'}</div>}</div>
  </section></div>,document.body);
}
