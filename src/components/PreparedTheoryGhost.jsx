import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen} from 'lucide-react';
import {preparedAssetUrl} from '../services/preparedLessonTasks.js';
import {placePreparedCard} from '../utils/preparedSetLayout.js';
import PreparedConditionImage from './PreparedConditionImage.jsx';

export default function PreparedTheoryGhost({upcoming,items,zoom,offset,surface,revision}) {
  const element=useRef(null),[visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!element.current||!surface.current||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.intersectionRatio>=.35),{root:surface.current,threshold:[.35]});
    observer.observe(element.current);
    return ()=>observer.disconnect();
  },[surface]);
  const {geometry:{width,height,scale},recipe,images}=upcoming;
  const point=useMemo(()=>{
    try{return placePreparedCard(items,recipe,{width:width*scale,height:height*scale});}
    catch(error){if(error.status!==409)throw error;return null;}
  },[items,recipe,width,height,scale,revision]);
  const style=point&&{width,left:(point.x-offset.x)*zoom,top:(point.y-offset.y)*zoom,transform:`scale(${scale*zoom})`};
  return <>
    <div ref={element} className="prepared-card prepared-card--theory prepared-theory-ghost" style={style||{display:'none'}} aria-hidden="true">
      <span><BookOpen size={15}/>Дальше · теория</span>
      <div className="prepared-card-body">{images.map(image=><PreparedConditionImage key={image.id} asset={image} alt=""/>)}</div>
    </div>
    {!visible&&<aside className="prepared-theory-ghost-thumbnail" aria-label="После этой задачи откроется теория">
      <strong><BookOpen size={14}/>Дальше · теория</strong>
      <img src={preparedAssetUrl(images[0].url)} alt="" draggable={false}/>
    </aside>}
  </>;
}
