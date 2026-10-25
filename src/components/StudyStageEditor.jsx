import {useState} from 'react';
import {Scissors} from 'lucide-react';
import {studyStageLabel} from '../utils/studyPlanStages.js';

export default function StudyStageEditor({stage,siblings,onSplit,onMerge}) {
  const [after,setAfter]=useState(stage.fromPart);
  return <div className="study-stage-editor"><strong>Этап плана · {studyStageLabel(stage)}</strong><p>Части одной темы можно проходить в разных местах маршрута. Прогресс ученика останется общим.</p>
    {stage.fromPart<stage.toPart&&<><label>Разделить после<select aria-label="Разделить этап после части" value={after} onChange={event=>setAfter(Number(event.target.value))}>{Array.from({length:stage.toPart-stage.fromPart},(_,i)=><option key={i} value={stage.fromPart+i}>Части {stage.fromPart+i}</option>)}</select></label><button type="button" onClick={()=>onSplit(after)}><Scissors size={14}/>Разделить на два этапа</button></>}
    {siblings>1&&<button type="button" onClick={onMerge}>Собрать тему в один этап</button>}
  </div>;
}
