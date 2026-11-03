import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,BookOpen} from 'lucide-react';
import PreparedConditionImage from './PreparedConditionImage.jsx';
import PreparedTaskPicker from './PreparedTaskPicker.jsx';

export default function PreparedTheoryCard({card,run,context,readOnly,style,onMeasure,present,dark,onNavigate}) {
  const element=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const step=card.theoryStep,nextSheet=card.nextKind?card.nextKind==='theory':step&&step.index+1<step.count,NextIcon=nextSheet&&(step?.blockCount||step?.count)<=2?ArrowRight:ArrowDown;
  const advance=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await context.action(run.id,{action:'theory-next',cardId:card.id});if(onNavigate)onNavigate(result);else context.select?.(result.teacherCardId);}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const choose=async taskId=>{const result=await context.action(run.id,{action:'choose',taskId});if(onNavigate)onNavigate(result);else context.select?.(result.teacherCardId);};
  useEffect(()=>{
    if(!element.current||!onMeasure)return;
    const node=element.current,report=()=>{if(node.isConnected)onMeasure(card.id,node.offsetHeight);},observer=new ResizeObserver(report);
    observer.observe(node);report();return()=>observer.disconnect();
  },[card.id,onMeasure]);
  return <article ref={element} data-anchor-id={card.anchorId} className={`prepared-card prepared-card--theory${!run.canManage?' is-student':''}${step?' is-step prepared-theory-enter':''}`} style={style} aria-label={`Теория набора ${card.setName||run.name}`}>
    <header><strong className="prepared-theory-label"><BookOpen size={15}/>Теория{step&&<span className="prepared-theory-counter">{step.index+1} / {step.count}</span>}</strong><span className="prepared-card-source" title={card.setName||run.name}>{card.setName||run.name}</span>{step&&run.canManage&&!readOnly&&<PreparedTaskPicker className="prepared-theory-preview" label="Все листы" theorySetId={card.setId} run={run} dark={dark} present={present||new Set(run.cards.map(row=>row.anchorId))} disabled={busy} onChoose={choose}/>}
    {step&&run.canManage&&!readOnly&&card.hasNext?<button type="button" className="prepared-theory-next" disabled={busy} onPointerDown={e=>e.stopPropagation()} onClick={()=>void advance()}>{busy?'Открываем…':nextSheet?'Следующий лист':'К задаче'}<NextIcon size={14}/></button>:<span className="prepared-task-status">{step?'Лист теории':'Перед задачами'}</span>}</header>
    {error&&<p className="prepared-error" role="alert">{error}</p>}
    <div className="prepared-card-body">{card.images.map((asset,index)=><PreparedConditionImage key={asset.id} asset={asset} alt={`Теория, изображение ${index+1}`}/>)}</div>
  </article>;
}
