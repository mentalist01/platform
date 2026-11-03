import {useEffect,useRef} from 'react';
import PreparedConditionImage from './PreparedConditionImage.jsx';

export default function PreparedTheoryCard({card,run,style,onMeasure}) {
  const element=useRef(null);
  useEffect(()=>{
    if(!element.current||!onMeasure)return;
    const node=element.current,report=()=>{if(node.isConnected)onMeasure(card.id,node.offsetHeight);},observer=new ResizeObserver(report);
    observer.observe(node);report();return()=>observer.disconnect();
  },[card.id,onMeasure]);
  return <article ref={element} data-anchor-id={card.anchorId} className={`prepared-card prepared-card--theory${card.compactTheory?'':' has-legacy-offset'}${card.theoryStep?' is-step prepared-theory-enter':''}`} style={style} aria-label={`Теория набора ${card.setName||run.name}`}>
    <div className="prepared-card-body">{card.images.map((asset,index)=><PreparedConditionImage key={asset.id} asset={asset} alt={`Теория, изображение ${index+1}`}/>)}</div>
  </article>;
}
