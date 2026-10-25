import {useEffect,useRef} from 'react';
import {BookOpen} from 'lucide-react';
import {preparedAssetUrl} from '../services/preparedLessonTasks.js';

export default function PreparedTheoryCard({card,run,style,onMeasure}) {
  const element=useRef(null);
  useEffect(()=>{
    if(!element.current||!onMeasure)return;
    const node=element.current,report=()=>{if(node.isConnected)onMeasure(card.id,node.offsetHeight);},observer=new ResizeObserver(report);
    observer.observe(node);report();return()=>observer.disconnect();
  },[card.id,onMeasure]);
  return <article ref={element} data-anchor-id={card.anchorId} className="prepared-card prepared-card--theory" style={style} aria-label={`Теория набора ${card.setName||run.name}`}>
    <header><strong className="prepared-theory-label"><BookOpen size={15}/>Теория</strong><span className="prepared-card-source" title={card.setName||run.name}>{card.setName||run.name}</span><span className="prepared-task-status">Перед задачами</span></header>
    <div className="prepared-card-body">{card.images.map((asset,index)=><img key={asset.id} src={preparedAssetUrl(asset.url)} alt={`Теория, изображение ${index+1}`} draggable={false} style={{height:Math.min(900,600*asset.height/asset.width)}}/>)}</div>
  </article>;
}
