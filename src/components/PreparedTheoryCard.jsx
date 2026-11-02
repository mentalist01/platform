import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,BookOpen} from 'lucide-react';
import PreparedConditionImage from './PreparedConditionImage.jsx';

export default function PreparedTheoryCard({card,run,context,readOnly,style,onMeasure}) {
  const element=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const step=card.theoryStep,nextSheet=step&&step.index+1<step.count,NextIcon=nextSheet&&step.count>2?ArrowDown:ArrowRight;
  const advance=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await context.action(run.id,{action:'theory-next',cardId:card.id});context.select?.(result.teacherCardId);}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  useEffect(()=>{
    if(!element.current||!onMeasure)return;
    const node=element.current,report=()=>{if(node.isConnected)onMeasure(card.id,node.offsetHeight);},observer=new ResizeObserver(report);
    observer.observe(node);report();return()=>observer.disconnect();
  },[card.id,onMeasure]);
  return <article ref={element} data-anchor-id={card.anchorId} className={`prepared-card prepared-card--theory${step?' is-step prepared-theory-enter':''}`} style={style} aria-label={`Теория набора ${card.setName||run.name}`}>
    <header><strong className="prepared-theory-label"><BookOpen size={15}/>Теория{step&&<span className="prepared-theory-counter">{step.index+1} / {step.count}</span>}</strong><span className="prepared-card-source" title={card.setName||run.name}>{card.setName||run.name}</span>{step&&run.canManage&&!readOnly&&card.hasNext?<button type="button" className="prepared-theory-next" disabled={busy} onPointerDown={e=>e.stopPropagation()} onClick={()=>void advance()}>{busy?'Открываем…':nextSheet?'Следующий лист':'К задачам'}<NextIcon size={14}/></button>:<span className="prepared-task-status">{step?'Лист теории':'Перед задачами'}</span>}</header>
    {error&&<p className="prepared-error" role="alert">{error}</p>}
    <div className="prepared-card-body">{card.images.map((asset,index)=><PreparedConditionImage key={asset.id} asset={asset} alt={`Теория, изображение ${index+1}`}/>)}</div>
  </article>;
}
