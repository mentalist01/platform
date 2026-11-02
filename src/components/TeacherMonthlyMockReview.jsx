import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,resolveAuthenticatedUploadsUrl} from '../services/api.js';
import MockExamModal from './MockExamModal.jsx';
import MockExamAnalysisModal from './MockExamAnalysisModal.jsx';
import {monthlyMockReviewAttempt} from '../utils/monthlyMockReviewAttempt.js';
import {getMockAnswerCountForTask} from '../utils/egeAnswerFields.js';
import {getPrimaryAnswerVector} from '../utils/answerVariants.js';
import {getMockPrimaryScoreFromSolved,getMockSecondaryScoreFromPrimary} from '../utils/mockExamScore.js';
import {getMockTaskRuleNumber} from '../utils/mockTaskIdentity.js';
import {writeBoardTaskToClipboard} from '../utils/boardTaskClipboard.js';
import './TeacherMonthlyMockReview.css';

const numbers=Array.from({length:27},(_,i)=>i+1);
const partial=(number,question)=>getMockTaskRuleNumber(number,question)===25;
export default function TeacherMonthlyMockReview({studentId,studentName,completion,initialView,onClose}){
  const [result,setResult]=useState(null),[error,setError]=useState(''),[view,setView]=useState(initialView),[selection,setSelection]=useState(''),[initialTask,setInitialTask]=useState(null);
  useEffect(()=>{
    let disposed=false;
    Promise.all([api.getMockExams(studentId),api.getMockAttempt(studentId,completion.examId)])
      .then(([exams,current])=>{const resolved=monthlyMockReviewAttempt(exams,current,completion);if(!disposed)setResult(resolved);})
      .catch(error=>{if(!disposed)setError(error.message||'Не удалось открыть пробник');});
    return()=>{disposed=true;};
  },[studentId,completion]);
  const selected=result?.views.find(row=>row.key===selection)||result?.selected;
  if(!selected)return createPortal(<div className="monthly-review-loading" role="dialog" aria-modal="true" aria-label="Открываем пробник"><section><h3>{error?'Не удалось открыть пробник':'Открываем выполненный пробник…'}</h3>{error&&<p role="alert">{error}</p>}<button type="button" onClick={onClose}>Закрыть</button></section></div>,document.body);
  const {exam,attempt}=selected;
  const openTask=key=>{setInitialTask(Number(key));setView('tasks');};
  const copyTask=async key=>{
    const question=exam.tasks[String(key)],count=getMockAnswerCountForTask(key,question);
    const copied=await writeBoardTaskToClipboard({metadata:{taskNumber:Number(key),taskDisplayNumber:String(key),taskTitle:exam.title,questionId:String(key),questionNumber:Number(key)},questionText:question.question,screenshots:question.screenshots,answerCount:count,sourceStudentId:studentId,
      mockExamSource:{examId:exam.id,studentId,attemptId:attempt.attemptId||'',finishedAt:attempt.finishedAt||attempt.timerFinishedAt||attempt.updatedAt,taskKey:String(key)}});
    if(!copied)throw Error('Не удалось скопировать. Разрешите доступ к буферу обмена и повторите.');
  };
  if(view==='analysis')return <MockExamAnalysisModal open exam={exam} attempt={attempt} attemptOptions={result.views} onSelectAttempt={setSelection} studentLabel={studentName} getAnswerCountForTask={getMockAnswerCountForTask} getExpectedAnswers={getPrimaryAnswerVector} getPrimaryScoreFromSolved={getMockPrimaryScoreFromSolved} getSecondaryScoreFromPrimary={getMockSecondaryScoreFromPrimary} revealUnansweredAnswers onOpenTask={openTask} onCopyTask={copyTask} onClose={onClose}/>;
  return <MockExamModal key={selected.key} exam={exam} studentId={studentId} initialAttempt={attempt} readOnly reviewMode reviewStudentLabel={studentName} attemptMode={attempt.mode||exam.access?.mode} initialTaskNumber={initialTask} MOCK_TASK_NUMBERS={numbers} getMockAnswerCountForTask={getMockAnswerCountForTask} allowsPartialAnswers={partial} getPrimaryScoreFromSolved={getMockPrimaryScoreFromSolved} getSecondaryScoreFromPrimary={getMockSecondaryScoreFromPrimary} getLocalDayKey={()=>''} withStudentId={url=>resolveAuthenticatedUploadsUrl(url,studentId)} onCopyTask={copyTask} onOpenAnalysis={()=>setView('analysis')} onClose={onClose}/>;
}
