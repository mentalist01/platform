import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,BookOpen,CheckCircle2,Sparkles,Trophy,X} from 'lucide-react';
import {getMockExamResultFeedback} from '../utils/mockExamCompletion';
import './MockExamCompletionOverlay.css';

export default function MockExamCompletionOverlay({result,onClose,theme}) {
  const dialog=useRef(null),titleId=useId(),descriptionId=useId();
  const feedback=getMockExamResultFeedback(result.score,result.completedAt);
  const [displayScore,setDisplayScore]=useState(feedback.score);
  const excellent=feedback.tone==='excellent';
  useEffect(()=>{
    const previous=document.activeElement;dialog.current?.focus();
    return ()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return undefined;
    let frame;const start=performance.now(),target=feedback.score;
    const tick=now=>{const progress=Math.min(1,(now-start)/1000);setDisplayScore(Math.round(target*(1-(1-progress)**3)));if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
  },[feedback.score]);
  const Icon=excellent?Trophy:feedback.tone==='support'?BookOpen:Sparkles;
  return createPortal(<div className="mock-completion-backdrop" data-theme={theme==='dark'?'dark':'light'} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
    if(event.key==='Tab'){
      const buttons=[...dialog.current.querySelectorAll('button:not(:disabled),a[href]')];
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}
    }
  }}>
    {excellent&&<div className="mock-completion-confetti" aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} style={{'--x':`${(i*37)%100}%`,'--delay':`${i%8*.09}s`,'--spin':`${(i%2?1:-1)*(140+i*17)}deg`,'--color':['#a78bfa','#f9a8d4','#facc15','#5eead4'][i%4]}} />)}</div>}
    <section ref={dialog} className="mock-completion-card" data-tone={feedback.tone} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <button className="mock-completion-close" type="button" aria-label="Закрыть результат пробника" onClick={onClose}><X size={20}/></button>
      <div className="mock-completion-eyebrow"><CheckCircle2 size={15}/>{result.timedOut?'Время вышло · результат сохранён':'Пробник завершён'}</div>
      <div className="mock-completion-medal"><Icon size={25}/></div>
      <div className="mock-completion-score" aria-label={`${feedback.score} из 100 баллов`}>
        <svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="78"/><circle className="mock-completion-score-progress" cx="90" cy="90" r="78" style={{'--score':feedback.score,strokeDasharray:`${feedback.score/100*490.1} 490.1`}}/></svg>
        <div aria-hidden="true"><strong>{displayScore}</strong><span>из 100 баллов</span></div>
      </div>
      <p className="mock-completion-score-label">Твой результат{result.attemptNumber>1?' этой попытки':''}</p>
      <h2 id={titleId}>{feedback.title}</h2>
      <p id={descriptionId} className="mock-completion-message">{feedback.message}</p>
      {feedback.stage&&<div className="mock-completion-benchmark"><span>{feedback.stage.label}</span><strong>Ориентир: {feedback.stage.min}–{feedback.stage.max} баллов</strong></div>}
      {Number.isFinite(result.bestScore)&&result.bestScore>feedback.score&&<p className="mock-completion-best">Лучший результат — <strong>{result.bestScore} из 100</strong>. В отчёте останется он.</p>}
      <button className="mock-completion-continue" type="button" onClick={onClose}>Вернуться к пробнику<ArrowRight size={18}/></button>
      <p className="mock-completion-note">{result.hasRewards?'Дальше тебя ждут награды за пробник.':'Ты сделал важный шаг. Продолжаем вместе.'}</p>
    </section>
  </div>,document.body);
}
