import {configurePreparedGameAnswers,normalizePreparedAnswerGroups,preparedAnswerGroups,splitPreparedGamePaste} from '../utils/preparedAnswerGroups.js';
import './PreparedGameAnswers.css';

export default function PreparedGameAnswerEditor({task,busy,onChange,onError,issues,showIssues}) {
  const config=normalizePreparedAnswerGroups(task.answerGroups),groups=preparedAnswerGroups(task);
  const configure=next=>{try{onChange(configurePreparedGameAnswers(task,next));onError('');}catch(error){onError(error.message);}};
  const changeCount=(number,part,count)=>configure(config.map(row=>row.number===number?{...row,counts:row.counts.map((value,index)=>index===part?count:value)}:row));
  const changeParts=(number,count)=>configure(config.map(row=>row.number===number?{...row,counts:Array.from({length:count},(_,index)=>row.counts[index]||1)}:row));
  const countSelect=group=><label>Чисел<select aria-label={`Чисел в ответе ${group.label}`} value={group.count} disabled={busy} onChange={event=>changeCount(group.number,group.part,Number(event.target.value))}>{Array.from({length:10},(_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label>;
  return <section className="prepared-game-editor" aria-label="Ответы блока 19–21">
    <div className="prepared-game-editor-title"><strong>Ответы 19–21</strong><small>Только вам</small></div>
    <p>Настройте каждую задачу отдельно. «а» и «б» — разные подпункты: решить нужно оба.</p>
    {config.map(row=><section key={row.number} className="prepared-game-editor-section" aria-label={`Настройка задания ${row.number}`}>
      <header><strong>№{row.number}</strong><div><label>Подпунктов<select aria-label={`Подпунктов в задании ${row.number}`} value={row.counts.length} disabled={busy} onChange={event=>changeParts(row.number,Number(event.target.value))}>{Array.from({length:7},(_,index)=><option key={index} value={index}>{index===0?'Не использовать':index===1?'Без а/б':index}</option>)}</select></label>{row.counts.length===1&&countSelect(groups.find(group=>group.number===row.number))}</div></header>
      {groups.filter(group=>group.number===row.number).map(group=><div className="prepared-game-editor-part" key={group.key}>
        {row.counts.length>1&&<div><strong>{group.label}</strong>{countSelect(group)}</div>}
        <div className="prepared-game-answer-cells" style={{'--game-answer-columns':Math.min(3,group.count)}}>{group.indices.map((index,position)=><label key={index}><span>{group.count>1?`Ответ ${position+1}`:'Ответ'}</span><input data-answer-index={index} aria-label={`Правильный ответ ${group.label}, число ${position+1}`} value={task.answers[index]||''} maxLength={500} disabled={busy} aria-invalid={showIssues&&issues.missing.includes(index)||undefined} onChange={event=>onChange({answers:task.answers.map((value,i)=>i===index?event.target.value:value)})} onPaste={event=>{
          const values=splitPreparedGamePaste(event.clipboardData.getData('text'));if(values.length<2)return;
          event.preventDefault();const answers=[...task.answers];values.slice(0,answers.length-index).forEach((value,i)=>{answers[index+i]=value;});onChange({answers});
        }}/></label>)}</div>
      </div>)}
    </section>)}
    {showIssues&&issues.missing.length>0&&<p role="alert" className="prepared-field-error">Заполните ответы во всех используемых подпунктах.</p>}
    <small>Ctrl+V распределяет числа по порядку: №19 → №20 → №21. Можно вставлять через пробел, запятую или Enter.</small>
  </section>;
}
